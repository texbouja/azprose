/**
 * Pure line-mapping helpers for transclusion-aware editor↔preview sync.
 *
 * A `![[file]]` marker (1 source line) is expanded into N lines before
 * markdown-it renders, so every `data-sline` stamped BELOW the expansion is
 * shifted by (N - 1). These helpers map a rendered line back to its TRUE raw
 * source line by subtracting the cumulative expansion delta of every
 * transclusion range that ends at or before the line.
 *
 * Ranges are expected in the SAME coordinate space as the line being mapped
 * (0-based, ORIGINAL source lines — i.e. body lines shifted by the front
 * matter line count when the document has one). No imports: kept free of
 * svelte/tauri so the helpers are unit-testable under bun.
 */

/** Structural subset of TransclusionRange (startLine inclusive, endLine exclusive). */
export interface TransclusionLineRange {
  startLine: number;
  endLine: number;
}

/**
 * Maps a rendered line back to its raw source line. Lines at or above the
 * first range are unchanged (they predate every expansion). Lines INSIDE a
 * range are also returned unchanged — they belong to the transcluded content
 * and are handled separately (data-transcluded-from/-line).
 */
export function unshiftTransclusionLine(
  line: number,
  ranges: TransclusionLineRange[],
): number {
  let shift = 0;
  for (const r of ranges) {
    if (r.endLine <= line) {
      // Each expansion replaced 1 marker line by (end - start) content lines.
      shift += r.endLine - r.startLine - 1;
    }
  }
  return line - shift;
}

/**
 * Shifts ranges from body coordinates to ORIGINAL source coordinates by
 * adding the front matter line count (a body line maps to bodyLine + fmOffset).
 * Mutates and returns the array.
 */
export function shiftRangesToSource(
  ranges: TransclusionLineRange[],
  fmOffset: number,
): TransclusionLineRange[] {
  if (fmOffset !== 0) {
    for (const r of ranges) {
      r.startLine += fmOffset;
      r.endLine += fmOffset;
    }
  }
  return ranges;
}
