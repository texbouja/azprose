// Projection du colloscope vers le calendrier — module PUR (ni DOM, ni Tauri).
//
// LE CALENDRIER EST UNE VUE, comme la grille. Le colloscope (dans
// `spreadsheet_cells`) possède la donnée ; on la projette à l'affichage, on ne
// la recopie JAMAIS dans `calendar_events`. C'est la leçon de la migration v8,
// qui a supprimé la table doublon `datagrid_rows` : deux copies de la même
// donnée, c'est un pont à synchroniser et des orphelins à la première
// suppression.
//
// Conséquence directe, et c'est l'exigence n°1 de l'utilisateur : **un même
// événement ne peut pas apparaître deux fois**. Une ligne du colloscope donne
// un événement, dont l'identité DÉRIVE de sa position source. Il n'y a rien à
// accumuler d'un import à l'autre, et rien à dédoublonner entre un ajout
// optimiste et un retour de base — puisqu'il n'y a pas d'ajout optimiste.
//
// Chaque ligne porte sa propre date : aucune récurrence RFC 5545 ici. La
// rotation des groupes et les vacances ont déjà été résolues à l'import.

import type { CalendarEventData } from "@/lib/calendar-types";
import type { ColloscopeEleve, ColloscopeSeance } from "./colloscope";

/** Catégorie de calendrier des colles — voir `calendar-categories.ts`. */
export const CALENDRIER_COLLES = "colles";

/** Préfixe d'identité des événements projetés. Sert AUSSI de discriminant de
 *  routage : une mutation sur un tel id part vers le colloscope, jamais vers
 *  `calendar_events`. Les événements utilisateur portent des UUID. */
export const PREFIXE_COLLE = "colle:";

// ── Identité ────────────────────────────────────────────────────────────────

/** `colle:{spreadsheetId}:{rowIndex}` — stable entre deux rechargements, et
 *  adresse directement la cellule à réécrire. */
export function idColle(spreadsheetId: string, rowIndex: number): string {
  return `${PREFIXE_COLLE}${spreadsheetId}:${rowIndex}`;
}

export function estIdColle(id: unknown): id is string {
  return typeof id === "string" && id.startsWith(PREFIXE_COLLE);
}

/** Défait `idColle`. null si ce n'est pas un identifiant de colle bien formé.
 *  ⚠️ le `spreadsheetId` est un UUID, qui ne contient pas de « : » — on coupe
 *  donc sur le DERNIER, pas sur le premier. */
export function decouperIdColle(
  id: string,
): { spreadsheetId: string; rowIndex: number } | null {
  if (!estIdColle(id)) return null;
  const corps = id.slice(PREFIXE_COLLE.length);
  const sep = corps.lastIndexOf(":");
  if (sep <= 0) return null;
  const rowIndex = Number(corps.slice(sep + 1));
  if (!Number.isInteger(rowIndex) || rowIndex < 0) return null;
  return { spreadsheetId: corps.slice(0, sep), rowIndex };
}

// ── Comparaison de noms de colleur ──────────────────────────────────────────

/** Civilités à ignorer : le colloscope écrit « M. BOUJAIDA », le profil
 *  contient « Boujaida ». */
const CIVILITES = /^(m|mr|mme|mlle|pr|prof|dr)\.?\s+/;

/** Forme comparable d'un nom : sans accents, sans casse, sans civilité, sans
 *  espaces superflus. */
export function normaliserColleur(nom: string): string {
  return nom
    .normalize("NFD")
    // Plage des diacritiques combinantes U+0300–U+036F, que NFD vient de
    // détacher des lettres. Les caractères sont ici sous leur forme brute :
    // ils ne s'affichent pas isolément, d'où ce commentaire.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(CIVILITES, "")
    .trim();
}

/** Deux écritures désignent-elles le même colleur ? Deux noms vides ne se
 *  correspondent PAS : sans nom, on ne prétend reconnaître personne. */
export function memeColleur(a: string, b: string): boolean {
  const na = normaliserColleur(a);
  const nb = normaliserColleur(b);
  return na.length > 0 && na === nb;
}

// ── Résolution des élèves ───────────────────────────────────────────────────

export interface ElevesResolus {
  /** Élèves désignés, dans l'ordre du tableau `Élèves`. */
  eleves: ColloscopeEleve[];
  /** Libellé de groupe si la cellule en désignait un, sinon null. */
  groupe: string | null;
  /** Jetons qui n'ont résolu ni en groupe ni en code — affichés tels quels. */
  inconnus: string[];
}

function cle(v: string): string {
  return v.trim().toLowerCase();
}

/**
 * Interprète la cellule `Groupe` d'une séance. Trois temps, dans cet ordre :
 *
 *   1. la valeur désigne un GROUPE connu de cette classe → tous ses élèves ;
 *   2. sinon, les jetons (`,` ou `;`) résolvent en CODES élèves → rattrapage ;
 *   3. sinon → non résolu, conservé tel quel et signalé.
 *
 * ⚠️ Le discriminant est la DONNÉE, jamais la forme du libellé. Les noms de
 * groupe sont les valeurs des colonnes de rotation du fichier importé
 * (`colloscope.ts` : « leurs titres importent peu ») : rien n'impose « G » ni
 * un suffixe numérique. Et leur NOMBRE est variable — il dépend de l'effectif
 * et de la taille des groupes, jusqu'au cas d'un élève par groupe. L'autorité
 * est donc le tableau `Élèves`, registre des effectifs.
 */
export function resoudreEleves(
  valeurGroupe: string,
  eleves: ColloscopeEleve[],
  classe: string,
): ElevesResolus {
  const dansLaClasse = eleves.filter((e) => cle(e.classe) === cle(classe));
  const brut = valeurGroupe.trim();
  if (!brut) return { eleves: [], groupe: null, inconnus: [] };

  // 1. Un groupe de cette classe ?
  const membres = dansLaClasse.filter((e) => cle(e.groupe) === cle(brut));
  if (membres.length > 0) {
    // On rend le libellé TEL QU'ÉCRIT dans le registre, pas tel que saisi :
    // c'est lui qui sera réécrit dans le colloscope.
    return { eleves: membres, groupe: membres[0].groupe, inconnus: [] };
  }

  // 2. Une liste de codes ?
  const jetons = brut.split(/[,;]/).map((j) => j.trim()).filter(Boolean);
  const trouves: ColloscopeEleve[] = [];
  const inconnus: string[] = [];
  for (const jeton of jetons) {
    const e = dansLaClasse.find((x) => cle(x.code) === cle(jeton));
    if (e) trouves.push(e);
    else inconnus.push(jeton);
  }
  // 3. Rien n'a résolu → tout est inconnu (cas d'un libellé de rotation absent
  //    du registre : une incohérence du fichier source, qui mérite d'être vue).
  return { eleves: trouves, groupe: null, inconnus };
}

/**
 * Règle MIROIR de `resoudreEleves`, pour l'écriture : un ensemble d'élèves
 * égal à un groupe connu se réécrit par le LIBELLÉ du groupe, sinon par la
 * liste des codes. Le colloscope reste lisible, et un groupe d'un seul élève
 * continue de s'écrire par son nom — ce qui compte quand les groupes sont
 * petits, sans quoi tout le colloscope basculerait en listes de codes.
 */
export function ecrireEleves(
  choisis: ColloscopeEleve[],
  eleves: ColloscopeEleve[],
  classe: string,
): string {
  if (choisis.length === 0) return "";
  const dansLaClasse = eleves.filter((e) => cle(e.classe) === cle(classe));
  const codesChoisis = new Set(choisis.map((e) => cle(e.code)));
  const groupes = new Set(dansLaClasse.map((e) => e.groupe).filter(Boolean));
  for (const g of groupes) {
    const membres = dansLaClasse.filter((e) => cle(e.groupe) === cle(g));
    if (
      membres.length === codesChoisis.size &&
      membres.every((e) => codesChoisis.has(cle(e.code)))
    ) {
      return g;
    }
  }
  return choisis.map((e) => e.code).join(",");
}

// ── Horaire ─────────────────────────────────────────────────────────────────

/** Minutes depuis minuit, ou null. Tolérant : `13h`, `13h30`, `13:30`, `9 h 05`. */
function minutesDe(texte: string): number | null {
  const m = /^\s*(\d{1,2})\s*[h:]\s*(\d{1,2})?\s*$/.exec(texte);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export interface Creneau {
  debutMin: number;
  finMin: number;
}

/**
 * `13h-14h` → minutes. Le champ est du TEXTE LIBRE dans le fichier importé :
 * un colloscope venu d'ailleurs peut écrire `13:00-14:00`, ou n'importe quoi.
 * Illisible → null, et l'appelant produit un événement « journée entière »
 * plutôt qu'un événement à 00:00 silencieusement faux.
 */
export function parserHoraire(horaire: string): Creneau | null {
  const parts = horaire.split(/[-–—]/);
  if (parts.length !== 2) return null;
  const debutMin = minutesDe(parts[0]);
  const finMin = minutesDe(parts[1]);
  if (debutMin === null || finMin === null || finMin <= debutMin) return null;
  return { debutMin, finMin };
}

/** Miroir de `parserHoraire` — le format réécrit dans le colloscope.
 *  L'aller-retour est garanti par test : `parser(formater(x)) === x`. */
export function formaterHoraire(c: Creneau): string {
  const f = (min: number) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
  };
  return `${f(c.debutMin)}-${f(c.finMin)}`;
}

// ── Projection ──────────────────────────────────────────────────────────────

/** Une séance telle que la porte le colloscope, avec son adresse source. */
export interface SeanceSituee extends ColloscopeSeance {
  /** Tableau de classe d'où vient la ligne. */
  spreadsheetId: string;
  /** Position de la ligne dans ce tableau. */
  rowIndex: number;
}

export interface OptionsProjection {
  /** `Réglages › Profil › Nom de colleur`. Vide → AUCUNE colle. */
  colleurName: string;
  /** Bornes de la plage visible, incluses (`YYYY-MM-DD`). */
  debut: string;
  fin: string;
}

/** Une date locale, sans décalage de fuseau (`new Date("2026-11-20")` est UTC). */
function dateLocale(iso: string, minutes = 0): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (minutes) d.setMinutes(minutes);
  return d;
}

/** Clé de contenu : deux lignes rigoureusement identiques ne donnent qu'UN
 *  événement. Dernier verrou de l'exigence « jamais deux fois le même ». */
function cleContenu(s: SeanceSituee): string {
  return [s.classe, s.date, s.horaire, s.groupe, s.matiere, s.colleur, s.salle]
    .map((v) => v.trim().toLowerCase())
    .join(" ");
}

export interface ResultatProjection {
  evenements: CalendarEventData[];
  /** Lignes écartées comme doublons EXACTS d'une autre ligne. Une donnée
   *  fautive, pas un cas d'usage : compté pour être signalé, pas caché. */
  doublons: number;
}

/**
 * Projette les séances visibles en événements de calendrier.
 *
 * - **Filtre colleur** : seules les séances de `colleurName`. Nom vide →
 *   liste vide, jamais la totalité : noyer le calendrier sous les séances de
 *   seize colleurs serait le pire des défauts.
 * - **Bornage** à la plage affichée : une trentaine de séances par semaine au
 *   lieu de plusieurs milliers sur l'année.
 * - **Horaire illisible** → événement « journée entière ».
 */
export function projeterColles(
  seances: SeanceSituee[],
  eleves: ColloscopeEleve[],
  options: OptionsProjection,
): ResultatProjection {
  const { colleurName, debut, fin } = options;
  if (!normaliserColleur(colleurName)) return { evenements: [], doublons: 0 };

  const vues = new Set<string>();
  const evenements: CalendarEventData[] = [];
  let doublons = 0;

  for (const s of seances) {
    const jour = s.date.trim();
    if (!jour || jour < debut || jour > fin) continue;
    if (!memeColleur(s.colleur, colleurName)) continue;

    const k = cleContenu(s);
    if (vues.has(k)) {
      doublons += 1;
      continue;
    }
    vues.add(k);

    const creneau = parserHoraire(s.horaire);
    const start = dateLocale(jour, creneau?.debutMin ?? 0);
    if (!start) continue; // date illisible : la séance n'est pas plaçable
    const end = creneau ? dateLocale(jour, creneau.finMin)! : dateLocale(jour)!;
    if (!creneau) end.setDate(end.getDate() + 1);

    const resolus = resoudreEleves(s.groupe, eleves, s.classe);
    const personnes = resolus.eleves.map((e) => `${e.nom} ${e.prenom}`.trim());

    evenements.push({
      id: idColle(s.spreadsheetId, s.rowIndex),
      text: `${s.classe} · ${s.matiere}`.trim(),
      start,
      end,
      allDay: !creneau,
      calendarId: CALENDRIER_COLLES,
      // `persons` porte les ÉLÈVES, pas le groupe (arbitrage 2026-08-23) : un
      // seul élève peut manquer, et le colleur doit pouvoir lui programmer un
      // rattrapage depuis cette vue.
      persons: personnes.length > 0 ? personnes : resolus.inconnus,
      location: s.salle || undefined,
    } as CalendarEventData);
  }

  return { evenements, doublons };
}
