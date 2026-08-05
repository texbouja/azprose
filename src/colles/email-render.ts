/**
 * Rendu DOM des rapports de colles pour email — capture en IMAGE via
 * html-to-image (décision utilisateur round 10) et GABARIT réutilisé
 * (décision utilisateur round 15).
 *
 * Le corps de l'email est une image PNG : affichage identique sur tous les
 * clients, garantie totale. (L'option SVG — `toSvg` — a été RETIRÉE au round 16 :
 * html-to-image encapsule le HTML dans un `<foreignObject>` qui ne s'affiche
 * que dans un navigateur — vide dans les visionneuses librsvg/Inkscape — et le
 * fichier inliné (≈300 propriétés CSS par élément) pesait ~10 Mo pour une
 * planche réelle.) `html-to-image` clone le node rendu (y compris les SVG
 * MathJax et les images locales déjà résolues par la pipeline) et le capture
 * en une seule opération — plus de rasterisation manuelle SVG→PNG, plus de
 * canvas, plus de tailles px explicites (les `ex` de MathJax sont résolus par
 * le layout du conteneur).
 *
 * GABARIT (round 15) : la création des images est laborieuse — le shell de la
 * page (structure + CSS embarqué `<style>`) est rendu UNE seule fois dans le
 * conteneur hors écran, puis pour CHAQUE planche on ne change que le contenu
 * des slots (`fillReportPage`) avant la capture. Les fragments markdown de
 * TOUTES les planches sont rendus en parallèle au début (un seul typeset
 * MathJax par planche, au niveau de la page — plus de typeset par fragment).
 *
 * Le conteneur est caché MAIS mis en page (attaché à document.body, hors
 * écran à gauche, 640px de large) : typesetMath et html-to-image ont besoin
 * du layout (getBoundingClientRect). Attention : PAS de `visibility:hidden`
 * sur le node racine — html-to-image copie les styles calculés sur son clone
 * et une racine invisible produirait une image vide.
 */
import {
  renderMarkdown,
  stripAutoCalloutTitles,
  makeCalloutsCollapsible,
  postRenderDom,
} from "@/markdown";
import { typesetMath } from "@/lib/typeset-math";
import { toPng } from "html-to-image";
import { printSettings } from "@/stores/markdown-settings.svelte";
import { buildReportPrintCss } from "@/lib/prose-style-css";
import { rubriquesFor, sumMaxScore, sumNotes } from "./rubrics";
import type { CollePlanche, RubriquesParMatiere } from "./types";
import {
  buildReportContent,
  buildReportEmailHtml,
  buildReportEnonce,
  buildReportEval,
  buildReportHead,
  buildReportMetaRows,
  buildReportPageShell,
  buildReportProgramme,
  buildReportSignature,
  buildReportSubject,
  type ColleReportData,
} from "./email";

export interface ColleReportOptions {
  theme: string;
  filePath: string | null;
  rootPath?: string | null;
  /** Nom du colleur pour la signature (repli meta.colleur). */
  colleur?: string;
}

/** Image capturée + wrapper email prêt pour l'envoi (mailer.rs). */
export interface ColleReportImage {
  /** Données binaires de l'image en base64 (sans préfixe data:). */
  base64: string;
  /** Type MIME de l'image : toujours `image/png` (l'option SVG est retirée). */
  mimeType: "image/png";
  /** Taille de l'image capturée (px). */
  width: number;
  height: number;
  subject: string;
  /** Wrapper email (`<img src="cid:rapport@azprose">`), multipart/related. */
  html: string;
}

/**
 * Largeur CSS du rapport (px) — la sortie est rendue en pixelRatio 2×
 * (1280px). DOIT rester synchrone avec `--rp-w` dans REPORT_PAGE_CSS
 * (email.ts) : la hauteur minimale de la page est `calc(var(--rp-w) * 16 / 10)`
 * (ratio 16:10 → 2048px de haut en sortie image). Changer la largeur = modifier
 * CES DEUX valeurs (constante ici + variable CSS).
 */
const REPORT_WIDTH = 640;
/** Facteur de capture : 2× pour la rétine (sortie ≈ 1280px de large). */
const REPORT_PIXEL_RATIO = 2;
/** Fond de l'image (celui du body email) — évite la transparence. */
const REPORT_BG = "#f0f2f5";

/**
 * Rend un fragment markdown (énoncé ou observations) : renvoie son innerHTML
 * une fois la pipeline passée (callouts, images locales). Détaché du DOM —
 * PAS de typeset ici : la page entière est typée UNE fois par planche dans
 * `renderReportImages` (les maths `\(…\)` brutes produites par la pipeline
 * sont converties en SVG à ce moment-là).
 */
async function renderFragment(markdown: string, opts: ColleReportOptions): Promise<string> {
  const result = await renderMarkdown(
    markdown,
    opts.theme,
    opts.filePath ?? undefined,
    opts.rootPath ?? undefined,
  );
  const tmp = document.createElement("div");
  tmp.innerHTML = result.html;
  stripAutoCalloutTitles(tmp);
  makeCalloutsCollapsible(tmp);
  await postRenderDom(tmp, {
    filePath: opts.filePath,
    rootPath: opts.rootPath ?? undefined,
  });
  return tmp.innerHTML;
}

/** Construit les données d'un rapport depuis une planche (fragments rendus). */
export async function buildReportData(
  planche: CollePlanche,
  rubriques: RubriquesParMatiere,
  opts: ColleReportOptions,
): Promise<ColleReportData> {
  const [bodyHtml, observationsHtml] = await Promise.all([
    renderFragment(planche.bodySource, opts),
    planche.meta.observations?.trim()
      ? renderFragment(planche.meta.observations, opts)
      : Promise.resolve(""),
  ]);
  const cfg = rubriquesFor(planche.meta.matiere, rubriques);
  const notes = planche.meta.notes ?? null;
  const note = sumNotes(notes);
  const noteMax = sumMaxScore(cfg);
  const rubricRows = cfg.flatMap((r) => {
    const v = notes?.[r.id];
    if (v === undefined || v === null || String(v).trim() === "") return [];
    return [{ label: r.label, value: v as number | string, maxScore: r.maxScore }];
  });
  return {
    meta: planche.meta,
    programme: planche.meta.programme ?? "",
    bodyHtml,
    rubricRows,
    note,
    noteMax,
    observationsHtml,
    colleur: opts.colleur ?? planche.meta.colleur ?? "",
  };
}

/**
 * Remplit le gabarit (shell rendu une fois) avec les données d'UNE planche :
 * chaque slot `data-slot` reçoit le HTML de sa section (builders purs de
 * email.ts — même source de vérité que `buildReportContent`) et devient
 * visible ; les sections vides sont masquées (`hidden`).
 *
 * `includeSalle` (défaut true) : les rendus PNG (email + archivage) passent
 * false — la Salle est retirée des images (retouche utilisateur round 18) ;
 * la vue HTML de l'app la garde (elle n'utilise pas ce remplissage).
 */
export function fillReportPage(
  page: HTMLElement,
  data: ColleReportData,
  includeSalle = true,
): void {
  const m = data.meta;
  const sections: Array<[string, string]> = [
    ["head", buildReportHead(m)],
    ["meta", buildReportMetaRows(m, data.colleur, includeSalle)],
    ["programme", buildReportProgramme(data.programme)],
    ["enonce", buildReportEnonce(data.bodyHtml)],
    ["eval", buildReportEval(data.note, data.noteMax, data.rubricRows, data.observationsHtml)],
    ["signature", buildReportSignature(data.colleur)],
  ];
  for (const [name, html] of sections) {
    const slot = page.querySelector<HTMLElement>(`[data-slot="${name}"]`);
    if (!slot) continue;
    slot.innerHTML = html;
    slot.hidden = !html;
  }
}

/** Vide tous les slots du gabarit (entre deux planches). */
export function resetReportPage(page: HTMLElement): void {
  page.querySelectorAll<HTMLElement>("[data-slot]").forEach((slot) => {
    slot.innerHTML = "";
    slot.hidden = true;
  });
}

/** Capture la page (déjà remplie + typée) en PNG (rétine 2×). */
async function capturePage(
  page: HTMLElement,
): Promise<Pick<ColleReportImage, "base64" | "mimeType" | "width" | "height">> {
  const dataUrl = await toPng(page, {
    backgroundColor: REPORT_BG,
    width: REPORT_WIDTH,
    pixelRatio: REPORT_PIXEL_RATIO,
    cacheBust: true,
  });
  return {
    base64: dataUrl.slice(dataUrl.indexOf(",") + 1),
    mimeType: "image/png",
    width: REPORT_WIDTH * REPORT_PIXEL_RATIO,
    height: Math.round(page.getBoundingClientRect().height * REPORT_PIXEL_RATIO),
  };
}

/**
 * Rend UN LOT de planches en images PNG : fragments markdown de TOUTES les
 * planches rendus en parallèle, puis pour chacune le gabarit (rendu une
 * seule fois) est rempli, typé et capturé. Retourne une image par planche
 * (même ordre). `onProgress(done, total)` après chaque capture.
 */
export async function renderReportImages(
  planches: CollePlanche[],
  rubriques: RubriquesParMatiere,
  opts: ColleReportOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<ColleReportImage[]> {
  if (!planches.length) return [];
  const datas = await Promise.all(planches.map((p) => buildReportData(p, rubriques, opts)));

  const mount = document.createElement("div");
  mount.style.cssText = `position:absolute;left:-9999px;top:0;width:${REPORT_WIDTH}px;pointer-events:none;`;
  document.body.appendChild(mount);
  try {
    const page = document.createElement("div");
    page.innerHTML = buildReportPageShell();
    mount.appendChild(page);

    // Section « Printing » des réglages : le CSS typographique (polices,
    // tailles, interligne, titres, listes + customCss) est injecté APRÈS le
    // style du gabarit (dans `.rp`, le dernier bloc `<style>` gagne à
    // spécificité égale) — s'applique aux blocs de contenu markdown (énoncé +
    // observations), jamais au chrome du gabarit. Couvre email ET archivage
    // (l'archivage passe par ce même `renderReportImages`).
    const printStyle = document.createElement("style");
    printStyle.textContent = buildReportPrintCss(printSettings.current);
    page.appendChild(printStyle);

    const images: ColleReportImage[] = [];
    for (let i = 0; i < planches.length; i++) {
      const data = datas[i];
      // PNG (email + archivage) : la Salle est retirée (retouche round 18) —
      // le gabarit HTML de l'app la garde, pas l'image.
      fillReportPage(page, data, false);
      // Un SEUL typeset par planche : les maths `\(…\)` des fragments ne sont
      // converties en SVG qu'ici (l'ancien typeset par fragment est supprimé).
      await typesetMath(page);
      const captured = await capturePage(page);
      images.push({
        ...captured,
        subject: buildReportSubject(data),
        html: buildReportEmailHtml(data),
      });
      resetReportPage(page);
      onProgress?.(i + 1, planches.length);
    }
    return images;
  } finally {
    mount.remove();
  }
}

/**
 * Prépare le DOM du rapport d'UNE planche et retourne l'image prête pour
 * l'envoi (délègue au rendu par lot de `renderReportImages`).
 */
export async function renderColleReportImage(
  planche: CollePlanche,
  rubriques: RubriquesParMatiere,
  opts: ColleReportOptions,
): Promise<ColleReportImage> {
  const images = await renderReportImages([planche], rubriques, opts);
  return images[0];
}

export { buildReportContent, buildReportEmailHtml, buildReportSubject };
export type { ColleReportData };
