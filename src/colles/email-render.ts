/**
 * Rendu des rapports de colles pour email — capture en IMAGE PNG via headless
 * Chrome (round 19 — remplace html-to-image, décisions utilisateur round 10 +
 * round 19) et GABARIT réutilisé (décision utilisateur round 15).
 *
 * Le corps de l'email est une image PNG : affichage identique sur tous les
 * clients, garantie totale. (L'option SVG — `toSvg` — a été RETIRÉE au round 16
 * : html-to-image encapsule le HTML dans un `<foreignObject>` illisible hors
 * navigateur, et les rendus étaient gonflés de styles inlinés.) Depuis le
 * round 19, html-to-image est SUPPRIMÉ : le document HTML auto-suffisant
 * (`assembleReportImageHtml` dans email.ts — MathJax CDN, CSS embarqué,
 * lifecycle script) est confié à la commande Rust `render_report_png`, qui
 * ouvre headless Chrome, attend le marqueur `azprose-report-ready` (typeset
 * MathJax terminé), capture la page à l'échelle rétine 2× et retourne le PNG
 * en base64 — plus de DOM monté dans l'app, plus de clone de styles, plus de
 * layout hors écran.
 *
 * Les fragments markdown de TOUTES les planches sont rendus en parallèle au
 * début (`buildReportData`), puis chaque planche est assemblée en document
 * autonome et capturée séquentiellement. Un seul typeset MathJax par planche,
 * fait par le navigateur headless au chargement (plus de typeset dans l'app).
 */
import {
  renderMarkdown,
  stripAutoCalloutTitles,
  makeCalloutsCollapsible,
  postRenderDom,
} from "@/markdown";
import { invoke } from "@tauri-apps/api/core";
import { printSettings } from "@/stores/markdown-settings.svelte";
import { mathJaxPreamble } from "@/stores/mathjax-preamble.svelte";
import { buildReportPrintCss } from "@/lib/prose-style-css";
import { buildMathJaxConfig } from "@/lib/pdf-export";
import { rubriquesFor, sumMaxScore, sumNotes } from "./rubrics";
import type { CollePlanche, RubriquesParMatiere } from "./types";
import {
  assembleReportImageHtml,
  buildReportEmailHtml,
  buildReportSubject,
  type ColleReportData,
} from "./email";
import { DEFAULT_REPORT_LAYOUT } from "./report-layout";

export interface ColleReportOptions {
  theme: string;
  filePath: string | null;
  rootPath?: string | null;
  /** Nom du colleur pour la signature (repli meta.colleur). */
  colleur?: string;
}

/**
 * Levé quand une boucle de rendu est ANNULÉE par l'utilisateur (AbortSignal
 * branché sur le bouton « Annuler » / la fermeture du dialogue). L'appelant
 * le distingue d'une vraie erreur (retour silencieux à la phase prête, pas de
 * message d'échec).
 */
export class ReportRenderCancelled extends Error {
  constructor() {
    super("Rendu annulé");
    this.name = "ReportRenderCancelled";
  }
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

/** Retour de la commande Rust `render_report_png` (serde camelCase). */
interface ReportPng {
  base64: string;
  width: number;
  height: number;
}

/**
 * Rend un fragment markdown (énoncé ou observations) : renvoie son innerHTML
 * une fois la pipeline passée (callouts, images locales). Détaché du DOM —
 * PAS de typeset ici : les maths `\(…\)` brutes sont typées par MathJax dans
 * le navigateur headless, au chargement du document autonome.
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

/** Assemble le document autonome d'UNE planche (MathJax + CSS + lifecycle). */
function assembleReportHtml(data: ColleReportData): string {
  return assembleReportImageHtml(data, {
    mathjaxConfig: buildMathJaxConfig(),
    preamble: mathJaxPreamble.current,
    printCss: buildReportPrintCss(printSettings.current),
    layout: printSettings.current.layout ?? DEFAULT_REPORT_LAYOUT,
  });
}

/**
 * Rend UN LOT de planches en images PNG : fragments markdown de TOUTES les
 * planches rendus en parallèle, puis pour chacune le document autonome est
 * assemblé et capturé par headless Chrome (commande Rust `render_report_png`).
 * Retourne une image par planche (même ordre). `onProgress(done, total)`
 * après chaque capture.
 *
 * `signal` (optionnel) : si l'utilisateur annule, la boucle lève
 * `ReportRenderCancelled` ENTRE deux captures (la capture en cours n'est pas
 * interrompue — elle est atomique côté Rust).
 */
export async function renderReportImages(
  planches: CollePlanche[],
  rubriques: RubriquesParMatiere,
  opts: ColleReportOptions,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<ColleReportImage[]> {
  if (!planches.length) return [];
  const datas = await Promise.all(planches.map((p) => buildReportData(p, rubriques, opts)));

  const images: ColleReportImage[] = [];
  for (let i = 0; i < planches.length; i++) {
    if (signal?.aborted) throw new ReportRenderCancelled();
    const data = datas[i];
    // PNG (email + archivage) : la Salle est retirée dans `assembleReportImageHtml`
    // (includeSalle false — retouche round 18) — le gabarit HTML de l'app la
    // garde, pas l'image. Un SEUL typeset par planche, fait par le navigateur
    // headless au chargement (marqueur `azprose-report-ready`).
    const captured = await invoke<ReportPng>("render_report_png", {
      html: assembleReportHtml(data),
      rootPath: opts.rootPath ?? null,
    });
    images.push({
      base64: captured.base64,
      mimeType: "image/png",
      width: captured.width,
      height: captured.height,
      subject: buildReportSubject(data),
      html: buildReportEmailHtml(data),
    });
    onProgress?.(i + 1, planches.length);
  }
  return images;
}

/**
 * Prépare l'image du rapport d'UNE planche et retourne l'image prête pour
 * l'envoi (délègue au rendu par lot de `renderReportImages`).
 */
export async function renderColleReportImage(
  planche: CollePlanche,
  rubriques: RubriquesParMatiere,
  opts: ColleReportOptions,
  signal?: AbortSignal,
): Promise<ColleReportImage> {
  const images = await renderReportImages([planche], rubriques, opts, undefined, signal);
  return images[0];
}

export { buildReportEmailHtml, buildReportSubject };
export type { ColleReportData };
