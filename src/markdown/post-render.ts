/**
 * Shared post-render DOM resolution.
 *
 * Steps that apply to ALL markdown renderings (preview, slides, PDF export):
 * - resolveLocalImages  → data: URIs for local images
 * - resolvePdfRectEmbeds → cropped PDF rect images
 * - resolveWikilinkPaths → full-path attributes on wikilinks
 */

import { resolveLocalImages } from "./render";
import { resolvePdfRectEmbeds } from "./pdf-rect-embed";
import { resolveWikilinkPaths } from "./wikilinks";

export interface PostRenderResult {
  /** Paths to images that could not be resolved (broken refs) */
  brokenImages: string[];
}

export interface PostRenderOptions {
  /** Absolute path of the source .md file */
  filePath: string | null;
  /** Vault root path (for wikilink resolution) */
  rootPath?: string | null;
  /** Skip image resolution (e.g. when images are already inlined) */
  skipImages?: boolean;
}

/**
 * Run shared post-render steps on a DOM container.
 * Callers handle callout processing, code decoration, MathJax, etc. separately.
 */
export async function postRenderDom(
  container: HTMLElement,
  opts: PostRenderOptions,
): Promise<PostRenderResult> {
  const { filePath, rootPath } = opts;
  if (!filePath) return { brokenImages: [] };

  const brokenImages = opts.skipImages ? [] : await resolveLocalImages(container, filePath);
  await resolvePdfRectEmbeds(container, filePath, rootPath ?? undefined);
  if (rootPath) await resolveWikilinkPaths(container, rootPath);

  return { brokenImages };
}
