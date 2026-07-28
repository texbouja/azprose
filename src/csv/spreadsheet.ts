/**
 * CSV spreadsheet helpers — delimiter detection, CSV parsing, serialization.
 * The actual jspreadsheet lifecycle is handled by `Spreadsheet.svelte`.
 */

// ── Helpers ────────────────────────────────────────────────────────────────

export function detectDelimiter(source: string): string {
  const firstLine = source.split("\n")[0] ?? "";
  const tabCount = (firstLine.match(/\t/g) ?? []).length;
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const semicolonCount = (firstLine.match(/;/g) ?? []).length;
  if (tabCount > commaCount && tabCount > semicolonCount) return "\t";
  if (semicolonCount > commaCount) return ";";
  return ",";
}

export function escapeCSVField(value: string, delimiter: string): string {
  const str = String(value);
  if (str.includes(delimiter) || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function dataToCSV(data: (string | number | boolean)[][], delimiter: string): string {
  return data.map((row) => row.map((cell) => escapeCSVField(String(cell ?? ""), delimiter)).join(delimiter)).join("\n");
}
