// Light, dependency-free theme token model + CSS renderer. Kept separate from
// theme-generator.ts (which pulls in Shiki) so the runtime theme menu can render the
// crafted catalog and install themes WITHOUT loading any Shiki module.

export interface ThemeTokens {
  bg: string;
  bgRgb: string;
  fg: string;
  muted: string;
  border: string;
  accent: string;
  surface: string;
  surfaceHover: string;
  shadowSoft: string;
  error: string;
  backdrop: string;
  shadowColor: string;
  /** keyed by `--syntax-*` */
  syntax: Record<string, string>;
}

export interface DerivedTheme {
  id: string;
  type: "light" | "dark";
  /** true only if the source theme has enough resources for a coherent UI. */
  complete: boolean;
  tokens: ThemeTokens;
}

/** One entry of the static curated crafted catalog (src/lib/crafted-catalog.json). */
export interface CatalogTheme {
  id: string;
  displayName: string;
  type: "light" | "dark";
  tokens: ThemeTokens;
}

const SYNTAX_KEYS = [
  "--syntax-keyword",
  "--syntax-string",
  "--syntax-number",
  "--syntax-type",
  "--syntax-function",
  "--syntax-operator",
  "--syntax-comment",
  "--syntax-constant",
];

/** Render a derived token set to a `:root[data-theme="id"]` CSS block. */
export function tokensToCSS(id: string, type: "light" | "dark", t: ThemeTokens): string {
  let css = `:root[data-theme="${id}"] {
  --bg: ${t.bg};
  --bg-rgb: ${t.bgRgb};
  --fg: ${t.fg};
  --muted: ${t.muted};
  --border: ${t.border};
  --accent: ${t.accent};
  --surface: ${t.surface};
  --surface-hover: ${t.surfaceHover};
  --shadow-soft: ${t.shadowSoft};
  --color-error: ${t.error};
  --backdrop: ${t.backdrop};
  --shadow-color: ${t.shadowColor};
`;
  for (const key of SYNTAX_KEYS) {
    if (t.syntax[key]) css += `  ${key}: ${t.syntax[key]};\n`;
  }
  css += `  color-scheme: ${type};
}
`;
  return css;
}
