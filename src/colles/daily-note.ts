/**
 * Injection d'une section colles dans la daily note (au clic calendrier).
 *
 * Si la date cliquée contient des colles du colleur du profil
 * (`userProfile.current.colleurName`), la note fraîchement créée est complétée
 * d'une section structurée :
 *
 *   # Colles       ← titre de section (aucune disposition particulière requise :
 *                    l'extraction s'ancre sur la PREMIÈRE fence ```colle)
 *   ## <élève>     ← un titre H2 par élève, juste avant sa codefence
 *   ```colle       ← une fiche par élève (métadonnées YAML de la db)
 *   matiere: …
 *   colleur: …
 *   eleve: …
 *   date: …
 *   creneau: …
 *   salle: …
 *   classe: …
 *   groupe: …
 *   email_eleve: …   ← colonne Élèves du colloscope (vide si absente)
 *   programme: ""    ← renseigné après génération par le colleur
 *   ```
 *   ---            ← séparateur de fiches — CHAQUE fiche se termine par `---`,
 *                    y compris la dernière (borne les corps des planches au
 *                    parsing : sans lui, le corps d'une planche sans contenu
 *                    avalerait les fiches suivantes jusqu'à EOF)
 *   ## <élève>
 *   ```colle
 *   …
 *   ```
 *   ---            ← `---` final obligatoire (dernière planche bornée)
 *
 * Les titres (`# Colles`, `## <élève>`) sont IGNORÉS par les parsers
 * (splitPlanches ne retient que les fences ; stripColleSeparators ne vide que
 * les `---`) : les previews (normal et CollePreview) et la TOC ne sont pas
 * altérés — seuls les `## <élève>` s'ajoutent naturellement au plan de la
 * note (navigation vers la fiche dans la daily note).
 *
 * Les métadonnées proviennent de la base colloscope (readColloscope) ; le YAML
 * est toujours sérialisé par `stringify` (package `yaml`), même protection que
 * le write-back — jamais d'injection de texte libre autrement.
 *
 * L'injection n'a lieu QUE pour une note absente (branche création) : une note
 * existante est ouverte telle quelle, jamais modifiée.
 */

import { stringify } from "yaml";

import { seancesDuColleur } from "./colloscope";
import type { ColloscopeData, ColloscopeSeance } from "./colloscope";

// ── Génération pure (testable sans Tauri ni runes) ────────────────────────

/** Métadonnées d'une fiche de colle (codefence ```colle). */
export interface ColleFicheMeta {
  matiere: string;
  colleur: string;
  eleve: string;
  date: string;
  creneau: string;
  salle: string;
  classe: string;
  groupe: string;
  /** Email de l'élève (colonne Élèves du colloscope ; vide si absente). */
  email_eleve: string;
  /** Programme de la semaine — vide à la génération, renseigné ensuite par le colleur. */
  programme: string;
}

/** Écrit la codefence d'une fiche : ```colle + YAML stringifié. */
export function fenceColle(meta: ColleFicheMeta): string {
  const yaml = stringify({
    matiere: meta.matiere,
    colleur: meta.colleur,
    eleve: meta.eleve,
    date: meta.date,
    creneau: meta.creneau,
    salle: meta.salle,
    classe: meta.classe,
    groupe: meta.groupe,
    email_eleve: meta.email_eleve,
    programme: meta.programme,
  }).trimEnd();
  return "```colle\n" + yaml + "\n```";
}

/**
 * Séances du colleur pour une date, triées par (horaire, classe, groupe).
 * Tri stable pour un rendu déterministe, quel que soit l'ordre du colloscope.
 */
export function seancesDuJour(
  data: ColloscopeData,
  date: string,
  colleurName: string,
): ColloscopeSeance[] {
  return seancesDuColleur(
    data.seances.filter((s) => s.date === date),
    colleurName,
  ).sort(
    (a, b) =>
      a.horaire.localeCompare(b.horaire) ||
      a.classe.localeCompare(b.classe) ||
      a.groupe.localeCompare(b.groupe),
  );
}

/**
 * Construit la section colles d'une daily note : titre `# Colles`, puis par
 * élève un titre `## <élève>` suivi de sa codefence ```colle. CHAQUE fiche se
 * termine par un `---` (y compris la dernière) : ces séparateurs bornent le
 * corps des planches au parsing (`splitPlanches` s'arrête à la prochaine ligne
 * `---`) — sans eux, le corps d'une planche sans contenu avalerait les fiches
 * suivantes jusqu'à EOF.
 *
 * Retourne `null` si aucune colle du colleur ce jour, ou si aucun élève du
 * colloscope ne correspond aux groupes collés (fiches vides inutiles).
 */
export function buildCollesSection(
  data: ColloscopeData,
  date: string,
  colleurName: string,
): string | null {
  const seances = seancesDuJour(data, date, colleurName);
  if (seances.length === 0) return null;

  const fiches: { eleve: string; fence: string }[] = [];
  for (const s of seances) {
    const eleves = data.eleves
      .filter((e) => e.classe === s.classe && e.groupe === s.groupe)
      .sort((a, b) => a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom));
    for (const e of eleves) {
      const eleve = `${e.prenom} ${e.nom}`;
      fiches.push({
        eleve,
        fence: fenceColle({
          matiere: s.matiere,
          colleur: s.colleur,
          eleve,
          date: s.date,
          creneau: s.horaire,
          salle: s.salle,
          classe: s.classe,
          groupe: s.groupe,
          email_eleve: e.email,
          programme: "",
        }),
      });
    }
  }
  if (fiches.length === 0) return null;

  return `# Colles\n\n${fiches
    .map((f) => `## ${f.eleve}\n\n${f.fence}`)
    .join("\n\n---\n\n")}\n\n---\n`;
}
