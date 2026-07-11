import type { Diagnostic } from "@/lib/diagnostics";

export interface TypstBuildState {
  compiling: boolean;
  exporting: boolean;
  viewerPdfPath: string | null;
}

export interface TypstPreviewResult {
  pages_svg: string[];
  diagnostics: Diagnostic[];
  pages: number;
}

export interface TypstSpanPosition {
  line: number;
  col: number;
}

export interface TypstForwardTarget {
  page: number;
  x: number;
  y: number;
}
