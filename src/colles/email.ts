/**
 * Gabarits email des rapports de colles — logique pure (testable, pas de DOM).
 *
 * Depuis le round 10, le CORPS de l'email est une IMAGE PNG (l'option SVG a
 * été retirée au round 16 : html-to-image ne produit que des
 * `<foreignObject>` illisibles hors navigateur) capturée par `html-to-image`
 * depuis le DOM rendu du rapport (src/colles/email-render.ts). Deux gabarits :
 *
 *  - `buildReportContent(data)` : la PAGE du rapport — gabarit réutilisable
 *    dont le CSS est EMBARQUÉ (bloc `<style>`, couleurs fixes indépendantes
 *    du thème) et le contenu changé pour chaque planche (slots `data-slot`
 *    remplis par `fillReportPage` dans email-render.ts). C'est ce que
 *    `html-to-image` capture en image.
 *  - `buildReportEmailHtml(data)` : le wrapper EMAIL minimal qui référence
 *    l'image en pièce jointe inline (`<img src="cid:rapport@azprose">`),
 *    construit par mailer.rs en multipart/related. Gmail-safe : ne produit
 *    jamais de `<style>`/`<script>`/`<svg>`.
 *
 * Layout de la page : métadonnées colle sur UNE LIGNE compacte (flex wrap,
 * séparées par des puces — plus de grid vertical qui gâchait l'espace),
 * Programme sur UNE ligne, notes détaillées alignées en TABLE (labels/valeurs
 * alignés, ligne pointillée de guidage — PAS de grid : elle ne survit pas au
 * clone html-to-image des images exportées), hauteur minimale CALCULÉE depuis
 * la largeur (variable `--rp-w`) au ratio 16:10 — 1280×2048 en sortie image
 * (voir REPORT_PAGE_CSS).
 *
 * Le module ne connaît pas la pipeline : `email-render.ts` produit les
 * fragments markdown (énoncé, observations) et la capture.
 */
import type { ColleMeta } from "./types";

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
  /** Nom du colleur (signature). */
  colleur: string;
}

/** Content-ID de l'image inline dans le multipart/related (mailer.rs). */
export const REPORT_CID = "rapport@azprose";

/**
 * CSS EMBARQUÉ de la page du rapport (bloc `<style>` dans le gabarit).
 *
 * Optimisations round 15 (gabarit) : typographie resserrée (les énoncés longs
 * sont le seul vrai driver de hauteur — on économise les paddings/margins),
 * Programme sur UNE ligne (label + contenu, ellipsis si trop long), métadonnées
 * sur UNE ligne (dl rp-meta, flex wrap), notes détaillées en TABLE (pas de
 * grid — elle ne survit pas au clone html-to-image), et `min-height` sur la
 * racine CALCULÉ depuis la largeur (`--rp-w`) au ratio hauteur 16:10 : à 640px
 * CSS (capture pixelRatio 2 → 1280px), la hauteur minimale de l'image est
 * 2048px — un rapport court n'est jamais plus petit que ça (min-height : le
 * contenu garde sa hauteur naturelle s'il dépasse).
 *
 * Couleurs fixes (indépendantes du thème — l'email doit être lisible en mode
 * sombre). html-to-image copie les styles calculés sur son clone : le `<style>`
 * embarqué est appliqué et chaque règle est de toute façon reportée inline
 * par le clone, l'image est donc identique au DOM.
 */
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
.rp-sign{margin-top:auto;padding-top:6px;border-top:1px solid #e2e5ea;font-size:12px;color:#6b7280;line-height:1.4;}
.rp-sign-name{color:#111827;}
[data-slot][hidden]{display:none !important;}
`;

/** Échappe un texte brut avant insertion dans le HTML. */
export function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

/** Objet du rapport : « Colle de maths — Ahmed El Moujahid ». */
export function buildReportSubject(data: ColleReportData): string {
  const matiere = data.meta.matiere?.trim();
  const eleve = data.meta.eleve?.trim();
  return matiere ? `Colle de ${matiere} — ${eleve}` : `Colle — ${eleve}`;
}

// ── Builders de sections (purs) ──────────────────────────────────────────────
// Chaque builder renvoie le HTML COMPLET de sa section, ou `""` si vide.
// Ils servent AUX DEUX chemins : la page chaînée de `buildReportContent` et le
// remplissage des slots du gabarit DOM (`fillReportPage`, email-render.ts) —
// une seule source de vérité pour la mise en page.

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
 * Métadonnées colle sur UNE ligne compacte (dl rp-meta, flex wrap) — "" si aucune ligne.
 * `includeSalle` (défaut true) : la Salle est OMISE dans les rendus PNG (email,
 * archivage) et PDF (retouche utilisateur round 18) — la vue HTML de l'app la
 * garde (ColleCard lit `meta.salle` directement, pas ce builder).
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

/**
 * Bloc évaluation : note globale + détail des rubriques (notes INLINE), puis
 * observations. Les observations s'affichent MÊME sans note (boîte
 * séparée) ; sans note NI observations, le bloc entier est omis (contrat
 * testé « omet le bloc évaluation quand aucune note n'est saisie »).
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
    // Notes INLINE (retour utilisateur) : largeur LIBRE — chaque note occupe
    // son espace naturel, plus de table étirée à 100 % (une rubrique = une
    // ligne entière, label à gauche + ligne pointillée + valeur à droite).
    // Chaque rubrique est un span « incassable » (inline-block + nowrap) et
    // les notes s'enchaînent dans le flux, séparées par un BIG DOT (·).
    // Robustesse clone html-to-image : inline-block et le pseudo-élément
    // ::before sont des styles calculés RÉELS (le clone les inline — la grid
    // perdait, elle, ses gap : blockification en used value jamais computed).
    // Ne PAS réintroduire de grid, de table ni de div wrapper.
    const items = rubricRows
      .map(
        (r) =>
          `<span class="rp-rubric">` +
          `<span class="rp-rubric-label">${escHtml(r.label)}</span>` +
          `<span class="rp-rubric-value">${escHtml(formatNoteValue(r.value))} / ${escHtml(formatNoteValue(r.maxScore))}</span>` +
          `</span>`,
      )
      .join("");
    html +=
      `<section class="rp-eval">` +
      `<div class="rp-eval-head">` +
      `<span class="rp-eval-label">Note</span>` +
      `<span class="rp-note">${escHtml(formatNoteValue(note))}<span class="rp-note-max"> / ${escHtml(formatNoteValue(noteMax))}</span></span>` +
      `</div>` +
      (items ? `<div class="rp-rubrics">${items}</div>` : "") +
      `</section>`;
  }
  if (obs) {
    html +=
      `<div class="rp-obs">` +
      `<div class="rp-obs-title">Observations</div>` +
      `<div class="rp-obs-content">${obs}</div>` +
      `</div>`;
  }
  return html;
}

/** Signature du colleur, épinglée en bas de carte — "" si absent. */
export function buildReportSignature(colleur: string): string {
  const c = colleur.trim();
  if (!c) return "";
  return (
    `<div class="rp-sign">Bien cordialement,<br>` +
    `<strong class="rp-sign-name">${escHtml(c)}</strong></div>`
  );
}

/**
 * Le GABARIT de la page (ce que html-to-image capture) : structure FIXE avec
 * le CSS embarqué et des emplacements vides `data-slot`. C'est ce DOM que
 * `fillReportPage` remplit pour chaque planche (email-render.ts) — le shell et
 * les styles ne sont rendus qu'UNE fois pour un lot de planches.
 */
export function buildReportPageShell(): string {
  return (
    `<div class="rp">` +
    `<style>${REPORT_PAGE_CSS}</style>` +
    `<div class="rp-card">` +
    `<div data-slot="head"></div>` +
    `<div class="rp-body">` +
    `<div data-slot="meta"></div>` +
    `<div data-slot="programme"></div>` +
    `<div data-slot="enonce"></div>` +
    `<div data-slot="eval"></div>` +
    `<div data-slot="signature"></div>` +
    `</div>` +
    `</div>` +
    `</div>`
  );
}

/**
 * La PAGE du rapport composée d'un bloc (équivalent gabarit + fill, sans DOM) :
 * c'est EXACTEMENT le même HTML que `fillReportPage(buildReportPageShell(),
 * data)` produit dans le navigateur. Largeur fixe 640px, hauteur minimale au
 * ratio 16:10 (1280×2048 en sortie image), styles 100 % embarqués — couleurs
 * fixes indépendantes du thème.
 *
 * Les fragments markdown (`bodyHtml`/`observationsHtml`) sont insérés tels
 * quels (produits par la pipeline : callouts, images, maths en SVG MathJax).
 *
 * `includeEval` (défaut true — rétro-compatible, l'email ne le passe pas) :
 * l'impression des planches (round 18) peut OMETTRE la « troisième carte »
 * (section Évaluation : notes + observations) — feuille d'examen pour les
 * élèves (sans) vs archivage administration (avec).
 *
 * `includeSalle` (défaut true) : OMISE dans les rendus PNG/PDF (retouche
 * round 18) — la vue HTML de l'app la garde.
 *
 * `includeSignature` (défaut true) : OMISE dans le rendu PDF (retouche
 * round 18 — la feuille imprimée ne porte plus « Bien cordialement ») ;
 * l'email la conserve.
 */
export function buildReportContent(
  data: ColleReportData,
  includeEval = true,
  includeSalle = true,
  includeSignature = true,
): string {
  const m = data.meta;
  return (
    `<div class="rp">` +
    `<style>${REPORT_PAGE_CSS}</style>` +
    `<div class="rp-card">` +
    buildReportHead(m) +
    `<div class="rp-body">` +
    buildReportMetaRows(m, data.colleur, includeSalle) +
    buildReportProgramme(data.programme) +
    buildReportEnonce(data.bodyHtml) +
    (includeEval
      ? buildReportEval(data.note, data.noteMax, data.rubricRows, data.observationsHtml)
      : "") +
    (includeSignature ? buildReportSignature(data.colleur) : "") +
    `</div>` +
    `</div>` +
    `</div>`
  );
}

/**
 * Le wrapper EMAIL : un simple `<img>` référençant l'image en pièce jointe
 * inline (multipart/related — mailer.rs l'assemble avec le Content-ID
 * `REPORT_CID`). Styles 100 % inline, jamais de `<style>`/`<script>`/`<svg>`.
 */
export function buildReportEmailHtml(data: ColleReportData): string {
  const m = data.meta;
  const alt = `${m.matiere?.trim() || "Colle"} — ${m.eleve?.trim() || "rapport de colle"}`;
  return (
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"></head>` +
    `<body style="margin:0;padding:0;background:#f0f2f5;">` +
    `<img src="cid:${REPORT_CID}" alt="${escHtml(alt)}" ` +
    `style="display:block;width:100%;max-width:640px;height:auto;margin:0 auto;">` +
    `</body></html>`
  );
}
