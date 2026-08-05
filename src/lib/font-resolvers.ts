/**
 * Résolution des familles de polices en chaînes CSS — module PUR (testable
 * sans la chaîne Svelte). Les helpers étaient historiquement dans
 * `stores/markdown-settings.svelte.ts` ; ils en sont extraits pour que les
 * builders de CSS d'impression (`lib/prose-style-css.ts`) et les tests bun
 * n'importent jamais la chaîne `$state`/localStorage.
 *
 * Les clés acceptent des chaînes larges (`string`) — les types union étroits
 * (`BodyFont`, `MonoFont`, `HeadingFont`) vivent dans le store et sont
 * assignables ici par sous-typage structurel.
 */
export function resolveFontFamily(key: string, customName?: string): string {
  switch (key) {
    case "fira-sans":
      return "'Fira Sans', -apple-system, BlinkMacSystemFont, sans-serif";
    case "inter":
      return "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
    case "ubuntu":
      return "'Ubuntu', -apple-system, BlinkMacSystemFont, sans-serif";
    case "ubuntu-condensed":
      return "'Ubuntu Condensed', -apple-system, BlinkMacSystemFont, sans-serif";
    case "custom":
      return customName?.trim()
        ? `'${customName.trim()}', -apple-system, BlinkMacSystemFont, sans-serif`
        : "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    default:
      return "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  }
}

export function resolveMonoFont(key: string): string {
  switch (key) {
    case "fira-code":
      return "'Fira Code', ui-monospace, SFMono-Regular, monospace";
    case "jetbrains-mono":
      return "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace";
    case "ubuntu-mono":
      return "'Ubuntu Mono', ui-monospace, SFMono-Regular, monospace";
    default:
      return "ui-monospace, SFMono-Regular, Menlo, monospace";
  }
}

export function resolveHeadingFont(key: string, customName: string): string {
  if (key === "inherit") return "inherit";
  if (key === "custom") {
    return customName.trim()
      ? `'${customName.trim()}', -apple-system, BlinkMacSystemFont, sans-serif`
      : "inherit";
  }
  return resolveFontFamily(key);
}
