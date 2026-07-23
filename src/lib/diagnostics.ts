// Common diagnostics model shared across compile engines (LaTeX
// and others later). A Diagnostic is engine-neutral so the same console panel
// and editor click-to-jump work for any source, without each engine inventing
// its own shape.

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  message: string;
  /** 1-based line in the source file, when the diagnostic is localized. */
  line?: number | null;
  /** 1-based column, when known. */
  col?: number | null;
  /** Extra hint lines (e.g. lint "hint:" suggestions). */
  hints?: string[];
  /** Origin engine, for multi-engine coexistence ("latex" | …). */
  source?: string;
}

/** Wrap an opaque error (IPC failure, unexpected throw) as one error diagnostic. */
export function errorDiagnostic(message: string, source?: string): Diagnostic {
  return { severity: "error", message, source };
}

/** A diagnostic the editor can navigate to (has a concrete line). */
export function isLocated(d: Diagnostic): d is Diagnostic & { line: number } {
  return d.line != null;
}
