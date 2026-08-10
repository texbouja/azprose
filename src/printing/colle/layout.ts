/**
 * Gabarit CONFIGURABLE du rapport de colle (titre, sous-titre, métadonnées,
 * corps, évaluation) — module PUR (testable sans DOM ni Tauri).
 *
 * La source de vérité du rendu d'impression (email PNG, archivage PNG,
 * planches PDF) : le layout vit dans les réglages (PrintStyle.layout), est
 * normalisé par `normalizeReportLayout`, et produit le HTML de chaque zone
 * via des TEMPLATES à variables `{{…}}` (catalogue `REPORT_VARS`).
 *
 * Décisions utilisateur :
 *  - ORDRE FIXE des 5 zones (Titre, Sous-titre, Métadonnées, Corps,
 *    Évaluation) — l'ordre n'est pas configurable.
 *  - TEMPLATE VIDE = zone masquée.
 *  - Le programme est une VARIABLE (`{{programme}}` texte, `{{blocProg}}`
 *    bloc rendu) utilisable dans n'importe quelle zone — plus de zone dédiée.
 *  - La signature « Bien cordialement » est SUPPRIMÉE du moteur.
 *  - Échappement STRICT : les valeurs de variables texte passent par
 *    `escHtml` au remplacement ; seules les variables « html » du catalogue
 *    (fragments markdown rendus, blocs composés) sont insérées brutes.
 *  - `{{meta.<champ>}}` (ou `{{meta:<champ>}}`) : valeur BRUTE (échappée) de
 *    n'importe quel champ du rapport, utilisable dans TOUTES les zones —
 *    matiere, eleve, classe, groupe, creneau, salle, date (format fr), dateIso,
 *    programme, note, noteMax, colleur. `{{metaRow:<champ>}}` : ligne
 *    « Champ : valeur » PRÉCOMPOSÉE (`<dt>/<dd>`) pour la zone Métadonnées
 *    (les 6 champs de la ligne d'info : date, creneau, salle, classe, groupe,
 *    colleur) — c'est le composant du template par défaut.
 *  - Le MOTEUR de gabarit (blocs + variables, sémantiques « non renseignée =
 *    invisible ») vit dans `src/lib/handout-layout.ts` (détaché des colles
 *    pour devenir le moteur central des rendus de documents) — ce module n'en
 *    est que le PREMIER consommateur : `renderReportZone` délègue à
 *    `renderTemplateText` et `{{#each rubriques}}` fournit le résolveur
 *    d'items (champs d'item : `{{label}}`, `{{value}}`, `{{maxScore}}` —
 *    value/maxScore formatés « 4,5 »).
 *  - `includeEval`/`includeSalle` restent des contraintes de CONTEXTE de
 *    rendu (planches PDF) : elles coupent les variables correspondantes même
 *    si le template les mentionne.
 *  - DEPUIS la généralisation des métadonnées (fence ```` ```meta ````), les
 *    CHAMPS GÉNÉRIQUES du catalogue document (centre, ville, filiere, session,
 *    duree, document, theme, origine, auteur, email, website, preauteur,
 *    type, …) sont résolvables comme `{{champ}}`/`{{meta:champ}}`/
 *    `{{metaRow:champ}}` (ligne précomposée) quand la planche les porte —
 *    ```` ```colle ```` ≡ ```` ```meta ```` + `type: colle`.
 *
 * Les builders `buildReport*` exposés ici servent de blocs composés du
 * catalogue (`{{blocProg}}`, `{{blocEnonce}}`, `{{blocEval}}`, `{{rubriques}}`,
 * `{{observations}}`) ET restent appelables directement (rétro-compat tests).
 */
import type { ColleMeta } from "@/colles/types";
import {
  escHtml,
  renderTemplateText,
  type ResolveEach,
  type ResolveResult,
} from "@/lib/handout-layout";
import { DOC_META_FIELDS } from "@/lib/doc-meta";
import type { VarDef } from "@/printing/core/vars";

export { escHtml } from "@/lib/handout-layout";

/** Alias rétro-compat du type de catalogue (nouveau nom commun : `VarDef`). */
export type ReportVarDef = VarDef;

// ── Types (déplacés depuis email.ts — une seule source de vérité) ───────────

/** Une ligne de rubrique saisie par le colleur. */
export interface ColleReportRubric {
  label: string;
  value: number | string;
  maxScore: number;
}

/** Données d'un rapport de colle (une planche → un email). */
export interface ColleReportData {
  meta: ColleMeta;
  /** Programme de la semaine (première fiche) — "" si absent/vide. */
  programme: string;
  /** Énoncé rendu en HTML (markdown + maths en SVG typé par MathJax). */
  bodyHtml: string;
  /** Rubriques saisies (dans l'ordre de la config). */
  rubricRows: ColleReportRubric[];
  /** Note globale = somme des rubriques, ou null si aucune saisie. */
  note: number | null;
  /** Dénominateur = somme des maxScore de la matière. */
  noteMax: number;
  /** Observations rendues en HTML ("" si vide). */
  observationsHtml: string;
  /** Nom du colleur. */
  colleur: string;
}

// ── Helpers (déplacés depuis email.ts) ──────────────────────────────────────

/** Affiche une valeur de note en français (« 12.5 » → « 12,5 »). */
export function formatNoteValue(v: number | string): string {
  const s = typeof v === "number" ? String(v) : String(v).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return s.replace(".", ",");
  return s;
}

/** Formate une date YYYY-MM-DD à la française (ex. « mar. 10 févr. »). */
export function formatReportDate(d?: string): string {
  if (!d) return "";
  const parsed = new Date(`${d}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

// ── CSS EMBARQUÉ de la page du rapport (bloc `<style>` dans le gabarit) ─────
// Optimisations round 15 (gabarit) : typographie resserrée (les énoncés longs
// sont le seul vrai driver de hauteur — on économise les paddings/margins),
// Programme sur UNE ligne (label + contenu, ellipsis si trop long), métadonnées
// sur UNE ligne (dl rp-meta, flex wrap), notes détaillées en spans INLINE
// séparés par un big dot (choix datant de l'ère html-to-image — la grid ne
// survit pas à son clone —, conservé depuis : capture headless du document
// complet, le rendu est identique), et
// `min-height` sur la racine CALCULÉ depuis la largeur (`--rp-w`) au ratio
// hauteur 16:10 : à 640px CSS (capture pixelRatio 2 → 1280px), la hauteur
// minimale de l'image est 2048px — un rapport court n'est jamais plus petit.
//
// Couleurs fixes (indépendantes du thème — l'email doit être lisible en mode
// sombre). Le document autonome (headless Chrome depuis le round 19) embarqué
// le `<style>` dans le `<head>` : le navigateur l'applique avant la capture,
// l'image est donc identique au rendu du gabarit.
export const REPORT_PAGE_CSS = `
.rp{--rp-w:640px;width:var(--rp-w);background:#f0f2f5;padding:16px 0;box-sizing:border-box;min-height:calc(var(--rp-w) * 16 / 10);display:flex;flex-direction:column;}
.rp-card{width:calc(var(--rp-w) - 48px);margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e2e5ea;box-sizing:border-box;flex:1;min-height:0;display:flex;flex-direction:column;}
.rp-head{background:#1d4ed8;color:#ffffff;padding:9px 20px;flex-shrink:0;}
.rp-title{font-size:16px;font-weight:700;line-height:1.2;}
.rp-sub{font-size:12px;opacity:.9;margin-top:1px;line-height:1.3;}
.rp-body{padding:12px 20px;display:flex;flex-direction:column;flex:1;min-height:0;}
.rp-meta{display:flex;flex-wrap:wrap;gap:2px 0;margin:0 0 8px;font-size:12px;}
.rp-meta dt{color:#6b7280;white-space:nowrap;}
.rp-meta dt::after{content:":";margin:0 5px;}
.rp-meta dd{margin:0;color:#111827;white-space:nowrap;line-height:1.4;}
.rp-meta dd::after{content:"·";margin:0 8px;color:#d1d5db;}
.rp-meta dd:last-child::after{content:"";margin:0;}
.rp-prog{display:flex;align-items:baseline;gap:8px;background:#eff6ff;border-left:3px solid #3b82f6;padding:4px 10px;border-radius:0 6px 6px 0;font-size:13px;line-height:1.4;margin:0 0 8px;}
.rp-prog-label{font-weight:700;color:#1e40af;white-space:nowrap;}
.rp-prog-text{color:#111827;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.rp-block-title{font-weight:700;color:#111827;font-size:13px;margin:0 0 2px;}
.rp-enonce{margin:0 0 8px;}
.rp-enonce-box{background:#f8f9fa;border:1px solid #e2e5ea;border-radius:6px;padding:8px 12px;font-size:13px;line-height:1.5;color:#111827;}
.rp-enonce-box p{margin:0 0 8px;}
.rp-enonce-box p:last-child{margin-bottom:0;}
.rp-eval{background:#f8f9fa;border:1px solid #e2e5ea;border-radius:8px;padding:8px 12px;margin:0 0 8px;}
.rp-eval-head{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid #e2e5ea;padding-bottom:4px;margin-bottom:4px;}
.rp-eval-label{font-weight:700;color:#111827;font-size:13px;}
.rp-note{font-weight:800;color:#1d4ed8;font-size:16px;white-space:nowrap;}
.rp-note-max{font-size:12px;font-weight:600;color:#6b7280;}
.rp-rubrics{margin:4px 0 0;font-size:12.5px;line-height:1.5;}
.rp-rubric{display:inline-block;white-space:nowrap;}
.rp-rubric-label{color:#374151;}
.rp-rubric-label::after{content:" : ";}
.rp-rubric-value{color:#111827;font-weight:600;}
.rp-rubric + .rp-rubric::before{content:"·";margin:0 7px;color:#6b7280;font-size:15px;vertical-align:-1px;}
.rp-obs{margin-top:6px;}
.rp-obs-title{font-weight:700;color:#111827;font-size:13px;margin-bottom:2px;}
.rp-obs-content{background:#f8f9fa;border-left:3px solid #d1d5db;padding:5px 10px;border-radius:0 6px 6px 0;font-size:12.5px;line-height:1.45;color:#111827;}
.rp-obs-content p{margin:0 0 6px;}
.rp-obs-content p:last-child{margin-bottom:0;}
[data-slot][hidden]{display:none !important;}
`;

// ── Blocs composés (builders de sections, purs) ─────────────────────────────
// Chaque builder renvoie le HTML COMPLET de sa section, ou `""` si vide.
// Ils servent de valeurs aux variables `{{bloc*}}` du catalogue ET restent
// appelables directement (rétro-compat).

/** En-tête bleu : matière — élève + sous-titre date. */
export function buildReportHead(m: ColleMeta): string {
  const matiere = m.matiere?.trim();
  const eleve = m.eleve?.trim();
  const title = `${escHtml(matiere || "Colle")}${eleve ? ` — ${escHtml(eleve)}` : ""}`;
  const headerDate = m.date ? ` · ${escHtml(formatReportDate(m.date))}` : "";
  return (
    `<div class="rp-head">` +
    `<div class="rp-title">${title}</div>` +
    `<div class="rp-sub">${headerDate || "Rapport de colle"}</div>` +
    `</div>`
  );
}

/**
 * Métadonnées colle sur UNE ligne compacte (dl rp-meta, flex wrap) — "" si
 * aucune ligne. `includeSalle` (défaut true) : la Salle est OMISE dans les
 * rendus PNG (email, archivage) et PDF — la vue HTML de l'app la garde.
 */
export function buildReportMetaRows(
  m: ColleMeta,
  colleur: string,
  includeSalle = true,
): string {
  const rows: Array<[string, string]> = [];
  if (m.date) rows.push(["Date", escHtml(formatReportDate(m.date))]);
  if (m.creneau) rows.push(["Créneau", escHtml(m.creneau)]);
  if (includeSalle && m.salle) rows.push(["Salle", escHtml(m.salle)]);
  if (m.classe) rows.push(["Classe", escHtml(String(m.classe))]);
  if (m.groupe) rows.push(["Groupe", escHtml(String(m.groupe))]);
  if (colleur.trim()) rows.push(["Colleur", escHtml(colleur.trim())]);
  if (!rows.length) return "";
  return `<dl class="rp-meta">${rows.map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join("")}</dl>`;
}

/** Programme sur UNE ligne (label + contenu, ellipsis) — "" si absent. */
export function buildReportProgramme(programme: string): string {
  const p = programme.trim();
  if (!p) return "";
  return (
    `<div class="rp-prog">` +
    `<span class="rp-prog-label">Programme</span>` +
    `<span class="rp-prog-text">${escHtml(p)}</span>` +
    `</div>`
  );
}

/** Énoncé (fragments markdown verbatim) — "" si absent. */
export function buildReportEnonce(bodyHtml: string): string {
  const b = bodyHtml.trim();
  if (!b) return "";
  return (
    `<section class="rp-enonce">` +
    `<div class="rp-block-title">Énoncé</div>` +
    `<div class="rp-enonce-box">${b}</div>` +
    `</section>`
  );
}

/** Détaill des rubriques en spans INLINE incassables (big dot) — "" si aucune. */
export function buildReportRubrics(rubricRows: ColleReportRubric[]): string {
  if (!rubricRows.length) return "";
  const items = rubricRows
    .map(
      (r) =>
        `<span class="rp-rubric">` +
        `<span class="rp-rubric-label">${escHtml(r.label)}</span>` +
        `<span class="rp-rubric-value">${escHtml(formatNoteValue(r.value))} / ${escHtml(formatNoteValue(r.maxScore))}</span>` +
        `</span>`,
    )
    .join("");
  return `<div class="rp-rubrics">${items}</div>`;
}

/** Bloc Observations — "" si vide. */
export function buildReportObs(observationsHtml: string): string {
  const obs = observationsHtml.trim();
  if (!obs) return "";
  return (
    `<div class="rp-obs">` +
    `<div class="rp-obs-title">Observations</div>` +
    `<div class="rp-obs-content">${obs}</div>` +
    `</div>`
  );
}

/**
 * Bloc évaluation : note globale + détail des rubriques (notes INLINE), puis
 * observations. Les observations s'affichent MÊME sans note (boîte séparée) ;
 * sans note NI observations, le bloc entier est omis (contrat testé « omet le
 * bloc évaluation quand aucune note n'est saisie »).
 */
export function buildReportEval(
  note: number | null,
  noteMax: number,
  rubricRows: ColleReportRubric[],
  observationsHtml: string,
): string {
  const obs = observationsHtml.trim();
  if (note === null && !obs) return "";
  let html = "";
  if (note !== null) {
    html +=
      `<section class="rp-eval">` +
      `<div class="rp-eval-head">` +
      `<span class="rp-eval-label">Note</span>` +
      `<span class="rp-note">${escHtml(formatNoteValue(note))}<span class="rp-note-max"> / ${escHtml(formatNoteValue(noteMax))}</span></span>` +
      `</div>` +
      buildReportRubrics(rubricRows) +
      `</section>`;
  }
  if (obs) html += buildReportObs(obs);
  return html;
}

// ── Layout configurable ─────────────────────────────────────────────────────

/** Configuration d'UNE zone du gabarit (5 zones, ordre fixe). */
export interface ReportZoneLayout {
  /**
   * Contenu de la zone : texte HTML libre + variables `{{…}}` du catalogue.
   * Vide → zone masquée. Valeurs de variables texte échappées au remplacement
   * (échappement strict) ; variables « html » insérées brutes.
   */
  template: string;
  /** Classe CSS SUPPLÉMENTAIRE ajoutée au conteneur de la zone ("" = aucune). */
  class: string;
}

/** Un fichier CSS externe copié dans les réglages (re-sélectionner = recharger). */
export interface ReportCssFile {
  name: string;
  content: string;
}

/** Gabarit complet du rapport (config utilisateur, persisté dans cfg.print). */
export interface ReportLayout {
  titre: ReportZoneLayout;
  sousTitre: ReportZoneLayout;
  metadonnees: ReportZoneLayout;
  corps: ReportZoneLayout;
  evaluation: ReportZoneLayout;
  /** CSS supplémentaire du gabarit (chrome — ajouté à REPORT_PAGE_CSS). */
  customCss: string;
  /** Fichiers CSS externes copiés inline (appliqués après customCss). */
  cssFiles: ReportCssFile[];
}

/** Contraintes de CONTEXTE du rendu (indépendantes du layout utilisateur). */
interface ReportRenderContext {
  /** false → la zone Évaluation est masquée (feuille d'examen, planches PDF). */
  includeEval?: boolean;
  /** false → `{{salle}}`/`{{meta:salle}}` résolvent à vide (rendus PNG/PDF). */
  includeSalle?: boolean;
}

/** Le gabarit PAR DÉFAUT — la valeur par défaut en CLAIR du layout courant. */
export const DEFAULT_REPORT_LAYOUT: ReportLayout = {
  titre: { template: "{{titre}}", class: "" },
  sousTitre: { template: "{{sousTitre}}", class: "" },
  metadonnees: {
    template:
      "{{metaRow:date}} {{metaRow:creneau}} {{metaRow:salle}} {{metaRow:classe}} {{metaRow:groupe}} {{metaRow:colleur}}",
    class: "",
  },
  corps: { template: "{{blocProg}}{{blocEnonce}}", class: "" },
  evaluation: { template: "{{blocEval}}", class: "" },
  customCss: "",
  cssFiles: [],
};

/** Normalise un layout (partiel/hérité) vers un layout complet et valide. */
export function normalizeReportLayout(layout?: ReportLayout | null): ReportLayout {
  const d = DEFAULT_REPORT_LAYOUT;
  if (!layout) return d;
  const zone = (z: ReportZoneLayout | undefined, def: ReportZoneLayout): ReportZoneLayout => ({
    template: z?.template ?? def.template,
    class: z?.class ?? def.class,
  });
  return {
    titre: zone(layout.titre, d.titre),
    sousTitre: zone(layout.sousTitre, d.sousTitre),
    metadonnees: zone(layout.metadonnees, d.metadonnees),
    corps: zone(layout.corps, d.corps),
    evaluation: zone(layout.evaluation, d.evaluation),
    customCss: layout.customCss ?? d.customCss,
    cssFiles: layout.cssFiles ?? d.cssFiles,
  };
}

// ── Catalogue de variables ───────────────────────────────────────────────────

/**
 * Catalogue des variables exposées au gabarit (utilisé par l'UI pour l'aide
 * et par le moteur pour la résolution). L'ordre = ordre d'affichage.
 *
 * Type commun `VarDef` du noyau printing (src/printing/core/vars.ts) — la
 * règle d'or (printing.md §2.2) : noms CANONIQUES sans préfixe technique
 * (`{{eleve}}`, pas `{{meta.eleve}}`). Les alias historiques `meta.*`/`meta:`
 * restent résolus par le moteur (rétro-compat des templates enregistrés)
 * mais ne sont PLUS listés ici — plus de doublon dans l'UI.
 */
export const REPORT_VARS: VarDef[] = [
  { name: "titre", label: "Titre composé (matière — élève)", html: true, zones: ["titre"] },
  { name: "matiere", label: "Matière", html: false, zones: ["titre", "sousTitre", "metadonnees", "corps", "evaluation"] },
  { name: "eleve", label: "Élève", html: false, zones: ["titre", "sousTitre", "metadonnees", "corps", "evaluation"] },
  { name: "classe", label: "Classe", html: false, zones: ["titre", "sousTitre", "metadonnees", "corps", "evaluation"] },
  { name: "groupe", label: "Groupe", html: false, zones: ["titre", "sousTitre", "metadonnees", "corps", "evaluation"] },
  { name: "creneau", label: "Créneau", html: false, zones: ["titre", "sousTitre", "metadonnees", "corps", "evaluation"] },
  { name: "salle", label: "Salle", html: false, zones: ["titre", "sousTitre", "metadonnees", "corps", "evaluation"] },
  { name: "sousTitre", label: "Sous-titre composé (date ou « Rapport de colle »)", html: true, zones: ["sousTitre"] },
  { name: "date", label: "Date (format français)", html: false, zones: ["titre", "sousTitre", "metadonnees", "corps", "evaluation"] },
  { name: "dateIso", label: "Date (AAAA-MM-JJ brute)", html: false, zones: ["titre", "sousTitre", "metadonnees", "corps", "evaluation"] },
  { name: "metaRow:date", label: "Ligne méta Date", html: true, zones: ["metadonnees"] },
  { name: "metaRow:creneau", label: "Ligne méta Créneau", html: true, zones: ["metadonnees"] },
  { name: "metaRow:salle", label: "Ligne méta Salle", html: true, zones: ["metadonnees"] },
  { name: "metaRow:classe", label: "Ligne méta Classe", html: true, zones: ["metadonnees"] },
  { name: "metaRow:groupe", label: "Ligne méta Groupe", html: true, zones: ["metadonnees"] },
  { name: "metaRow:colleur", label: "Ligne méta Colleur", html: true, zones: ["metadonnees"] },
  { name: "programme", label: "Programme (texte brut)", html: false, zones: ["titre", "sousTitre", "metadonnees", "corps", "evaluation"] },
  { name: "blocProg", label: "Bloc Programme rendu (label + contenu, une ligne)", html: true, zones: ["corps"] },
  { name: "blocEnonce", label: "Bloc Énoncé rendu (titre + boîte du markdown)", html: true, zones: ["corps"] },
  { name: "bodyHtml", label: "Énoncé (markdown rendu, sans le bloc)", html: true, zones: ["corps"] },
  { name: "blocEval", label: "Bloc Évaluation rendu (note + rubriques + observations)", html: true, zones: ["evaluation"] },
  { name: "note", label: "Note globale", html: false, zones: ["evaluation"] },
  { name: "noteMax", label: "Note maximale", html: false, zones: ["evaluation"] },
  { name: "rubriques", label: "Rubriques (détail des notes)", html: true, zones: ["evaluation"] },
  { name: "observations", label: "Observations (markdown rendu)", html: true, zones: ["evaluation"] },
  { name: "colleur", label: "Colleur", html: false, zones: ["titre", "sousTitre", "metadonnees", "corps", "evaluation"] },
];

/**
 * Libellés français des métadonnées (clés `meta:*` / `metaRow:*`) — les 6
 * champs historiques de la ligne d'info + le catalogue document (`salle` et
 * `groupe` sont des champs spécifiques colle, hors catalogue).
 */
const META_LABELS: Record<string, string> = {
  date: "Date",
  creneau: "Créneau",
  salle: "Salle",
  classe: "Classe",
  groupe: "Groupe",
  colleur: "Colleur",
  ...Object.fromEntries(DOC_META_FIELDS.map((f) => [f.key, f.labelFr])),
};

/** Clé structurée connue du rapport (hors meta générique). */
const STRUCTURED_KEYS = new Set([
  "matiere", "eleve", "classe", "groupe", "creneau", "salle", "date", "dateIso",
  "programme", "note", "noteMax", "colleur",
]);

/** Vrai si la clé est structurée OU présente dans la meta de la planche. */
function isKnownMetaKey(key: string, m: ColleMeta): boolean {
  if (STRUCTURED_KEYS.has(key)) return true;
  return Object.prototype.hasOwnProperty.call(m, key);
}

/**
 * Résout la valeur BRUTE (non échappée) d'un champ de métadonnées pour un
 * rapport — les champs composés du rapport d'abord (matiere, eleve, …), puis
 * TOUT champ présent dans la meta de la planche (catalogue document : centre,
 * ville, filiere, session, duree, document, theme, origine, auteur, email,
 * website, preauteur, type, …). "" si absent. `includeSalle` coupe la salle
 * dans les rendus PNG/PDF (contrainte de contexte, pas du layout).
 */
function metaValue(
  key: string,
  m: ColleMeta,
  data: ColleReportData,
  includeSalle: boolean,
): string {
  switch (key) {
    case "matiere": return m.matiere ?? "";
    case "eleve": return m.eleve ?? "";
    case "classe": return m.classe != null ? String(m.classe) : "";
    case "groupe": return m.groupe != null ? String(m.groupe) : "";
    case "creneau": return m.creneau ?? "";
    case "salle": return includeSalle && m.salle ? m.salle : "";
    case "date": return formatReportDate(m.date);
    case "dateIso": return m.date ?? "";
    case "programme": return data.programme ?? "";
    case "note": return data.note === null ? "" : formatNoteValue(data.note);
    case "noteMax": return formatNoteValue(data.noteMax);
    case "colleur": return data.colleur ?? "";
    default: {
      // Champ générique (catalogue document ou clé libre) présent dans la
      // meta de la planche — tableau joint par « · », objet (dict `notes`)
      // ignoré (rien de lisible à afficher), clé absente → "".
      if (!Object.prototype.hasOwnProperty.call(m, key)) return "";
      const v = (m as Record<string, unknown>)[key];
      if (v === null || v === undefined) return "";
      if (typeof v === "object") return Array.isArray(v) ? (v as unknown[]).join(" · ") : "";
      return String(v);
    }
  }
}

/**
 * Résout UNE variable `{{name}}` pour un rapport. Retourne la valeur brute
 * (non échappée) — l'échappement est appliqué PAR LE REND DE ZONE selon
 * `raw` : `raw:false` → la valeur est échappée au remplacement ; `raw:true` →
 * la valeur contient déjà du HTML sûr (champs composés échappés à la
 * construction, fragments markdown verbatim). `null` → variable inconnue.
 */
export function resolveReportVar(
  name: string,
  data: ColleReportData,
  ctx: ReportRenderContext = {},
): { value: string; raw: boolean } | null {
  const m = data.meta;
  const includeSalle = ctx.includeSalle !== false;
  switch (name) {
    case "titre": {
      const matiere = m.matiere?.trim();
      const eleve = m.eleve?.trim();
      return {
        value: `${escHtml(matiere || "Colle")}${eleve ? ` — ${escHtml(eleve)}` : ""}`,
        raw: true,
      };
    }
    case "sousTitre": {
      const d = m.date ? ` · ${escHtml(formatReportDate(m.date))}` : "";
      return { value: d || "Rapport de colle", raw: true };
    }
    case "matiere": return { value: m.matiere ?? "", raw: false };
    case "eleve": return { value: m.eleve ?? "", raw: false };
    case "classe": return { value: m.classe != null ? String(m.classe) : "", raw: false };
    case "groupe": return { value: m.groupe != null ? String(m.groupe) : "", raw: false };
    case "creneau": return { value: m.creneau ?? "", raw: false };
    case "salle": return { value: includeSalle && m.salle ? m.salle : "", raw: false };
    case "colleur": return { value: data.colleur ?? "", raw: false };
    case "date": return { value: formatReportDate(m.date), raw: false };
    case "dateIso": return { value: m.date ?? "", raw: false };
    case "programme": return { value: data.programme ?? "", raw: false };
    case "note": return { value: data.note === null ? "" : formatNoteValue(data.note), raw: false };
    case "noteMax": return { value: formatNoteValue(data.noteMax), raw: false };
    case "bodyHtml": return { value: data.bodyHtml, raw: true };
    case "blocProg": return { value: buildReportProgramme(data.programme), raw: true };
    case "blocEnonce": return { value: buildReportEnonce(data.bodyHtml), raw: true };
    case "blocEval": return {
      value: buildReportEval(data.note, data.noteMax, data.rubricRows, data.observationsHtml),
      raw: true,
    };
    case "rubriques": return { value: buildReportRubrics(data.rubricRows), raw: true };
    case "observations": return { value: buildReportObs(data.observationsHtml), raw: true };
    default:
      // `{{metaRow:<champ>}}` : ligne « Champ : valeur » précomposée
      // (`<dt>/<dd>`), pour la zone Métadonnées — tous les champs du catalogue
      // document + la ligne d'info colle (date, creneau, salle, classe,
      // groupe, colleur).
      if (name.startsWith("metaRow:")) {
        const key = name.slice(8);
        const label = META_LABELS[key];
        if (!label) return null;
        const value = metaValue(key, m, data, includeSalle);
        if (!value) return { value: "", raw: false };
        return {
          value: `<dt>${escHtml(label)}</dt><dd>${escHtml(value)}</dd>`,
          raw: true,
        };
      }
      // `{{meta.<champ>}}` / `{{meta:<champ>}}` : valeur BRUTE (échappée au
      // remplacement) de n'importe quel champ — utilisable dans TOUTES les
      // zones (le titre peut être `{{meta.eleve}}`, par exemple). Une clé
      // NI structurée NI présente dans la meta = variable INCONNUE (null),
      // pas « vide » (contrat historique des tests).
      if (name.startsWith("meta.") || name.startsWith("meta:")) {
        const key = name.slice(5);
        if (!isKnownMetaKey(key, m)) return null;
        return { value: metaValue(key, m, data, includeSalle), raw: false };
      }
      // `{{champ}}` générique du catalogue document (centre, ville, filiere,
      // session, duree, document, theme, origine, auteur, email, website,
      // preauteur, type, …) : résolu si la planche porte la clé — sinon null
      // (→ invisible au rendu). Garde `hasOwnProperty` (pas d'héritage).
      if (Object.prototype.hasOwnProperty.call(m, name)) {
        const v = (m as Record<string, unknown>)[name];
        if (v === null || v === undefined) return { value: "", raw: false };
        if (typeof v === "object") {
          return {
            value: Array.isArray(v) ? (v as unknown[]).join(" · ") : "",
            raw: false,
          };
        }
        return { value: String(v), raw: false };
      }
      return null;
  }
}

/** Classe supplémentaire d'une zone ("" → rien). */
function extraClass(c: string | undefined): string {
  return c?.trim() ? ` ${c.trim()}` : "";
}

// ── Moteur de gabarit ────────────────────────────────────────────────────────
// Le moteur (blocs `{{#if}}`/`{{#unless}}`/`{{#each}}` + `{{else}}`, variables,
// échappement strict, « non renseignée = invisible ») vit dans
// `src/lib/handout-layout.ts` — ce module n'en est qu'un consommateur, ses
// signatures utilisent directement les types du moteur (`ResolveResult`,
// `ResolveEach`). Seul `ReportEachContext` reste aliasé ici (les tests l'utilisent).

/** Contexte d'un bloc `{{#each name}}` (alias rétro-compat, consommé par les tests). */
export interface ReportEachContext {
  items: Array<{ resolve: (name: string) => ResolveResult }>;
}

/**
 * Rend UN TEMPLATE de zone : blocs conditionnels (`{{#if}}`/`{{#unless}}`/
 * `{{#each}}` + `{{else}}`, imbricables) puis variables `{{name}}` — valeurs
 * texte échappées, variables html brutes, variable NON RENSEIGNÉE →
 * invisible (""), texte libre verbatim. `resolveEach` fournit les items de
 * `{{#each}}` (facultatif). Délègue au moteur générique `handout-layout.ts`.
 */
export function renderReportZone(
  template: string,
  resolve: (name: string) => ResolveResult,
  resolveEach?: ResolveEach,
): string {
  return renderTemplateText(template, resolve, resolveEach);
}

/** Rendu HTML d'UNE zone (slot) du gabarit — "" si zone vide. */
export function renderReportSlotHtml(
  slot: "head" | "meta" | "corps" | "eval",
  data: ColleReportData,
  layout: ReportLayout = DEFAULT_REPORT_LAYOUT,
  ctx: ReportRenderContext = {},
): string {
  const L = normalizeReportLayout(layout);
  const resolve = (name: string) => resolveReportVar(name, data, ctx);
  // `{{#each rubriques}}` : un item par ligne de rubrique (le résolveur de
  // l'item expose label / value / maxScore — valeur et max déjà formatées
  // françaises « 4,5 »).
  const resolveEach = (name: string): ReportEachContext | null => {
    if (name !== "rubriques") return null;
    return {
      items: data.rubricRows.map((r) => ({
        resolve: (n) => {
          switch (n) {
            case "label": return { value: r.label ?? "", raw: false };
            case "value": return { value: formatNoteValue(r.value), raw: false };
            case "maxScore": return { value: formatNoteValue(r.maxScore), raw: false };
            default: return null;
          }
        },
      })),
    };
  };

  switch (slot) {
    case "head": {
      const titre = renderReportZone(L.titre.template, resolve, resolveEach);
      const sousTitre = renderReportZone(L.sousTitre.template, resolve, resolveEach);
      if (!titre.trim() && !sousTitre.trim()) return "";
      return (
        `<div class="rp-head">` +
        `<div class="rp-title${extraClass(L.titre.class)}">${titre}</div>` +
        `<div class="rp-sub${extraClass(L.sousTitre.class)}">${sousTitre}</div>` +
        `</div>`
      );
    }
    case "meta": {
      const inner = renderReportZone(L.metadonnees.template, resolve, resolveEach);
      if (!inner.trim()) return "";
      return `<dl class="rp-meta${extraClass(L.metadonnees.class)}">${inner}</dl>`;
    }
    case "corps": {
      const inner = renderReportZone(L.corps.template, resolve, resolveEach);
      if (!inner.trim()) return "";
      return L.corps.class.trim()
        ? `<div class="${L.corps.class.trim()}">${inner}</div>`
        : inner;
    }
    case "eval": {
      if (ctx.includeEval === false) return "";
      const inner = renderReportZone(L.evaluation.template, resolve, resolveEach);
      if (!inner.trim()) return "";
      return L.evaluation.class.trim()
        ? `<div class="${L.evaluation.class.trim()}">${inner}</div>`
        : inner;
    }
  }
}

/** Le CSS complet du rapport : REPORT_PAGE_CSS + customCss + fichiers CSS. */
export function renderReportLayoutCss(layout: ReportLayout = DEFAULT_REPORT_LAYOUT): string {
  const L = normalizeReportLayout(layout);
  const custom = L.customCss?.trim();
  const files = (L.cssFiles ?? [])
    .filter((f) => f?.content?.trim())
    .map((f) => `/* ${f.name} */\n${f.content.trim()}`)
    .join("\n");
  return [REPORT_PAGE_CSS, custom, files].filter(Boolean).join("\n");
}

/**
 * La PAGE du rapport composée d'un bloc (équivalent gabarit + fill, sans DOM) :
 * c'est EXACTEMENT le même HTML que le shell rempli dans le navigateur.
 * Largeur fixe 640px, hauteur minimale au ratio 16:10, styles 100 % embarqués.
 * Les fragments markdown (`bodyHtml`/`observationsHtml`) sont insérés tels
 * quels (produits par la pipeline : callouts, images, maths en SVG MathJax).
 *
 * `opts.includeCss === false` → sans le bloc `<style>` (le document
 * d'impression des planches assemble son propre `<head>`).
 */
export function renderReportLayout(
  data: ColleReportData,
  layout: ReportLayout = DEFAULT_REPORT_LAYOUT,
  ctx: ReportRenderContext = {},
  opts: { includeCss?: boolean } = {},
): string {
  const css = opts.includeCss === false ? "" : `<style>${renderReportLayoutCss(layout)}</style>`;
  const head = renderReportSlotHtml("head", data, layout, ctx);
  const meta = renderReportSlotHtml("meta", data, layout, ctx);
  const corps = renderReportSlotHtml("corps", data, layout, ctx);
  const evalHtml = ctx.includeEval === false
    ? ""
    : renderReportSlotHtml("eval", data, layout, ctx);
  return (
    `<div class="rp">` +
    css +
    `<div class="rp-card">` +
    head +
    `<div class="rp-body">` +
    meta +
    corps +
    evalHtml +
    `</div>` +
    `</div>` +
    `</div>`
  );
}
