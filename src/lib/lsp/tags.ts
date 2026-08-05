/**
 * Tags — tous les tags du vault, via `workspace/symbol`.
 *
 * La brique LSP : markdown-oxide expose les tags comme des symboles
 * workspace (`SymbolKind::CONSTANT`, nom `#tag`, position réelle) — c'est la
 * méthode DOCUMENTÉE officiellement (« Find all references to a tag by typing
 * the tag name into workspace symbols », oxide.md). Une requête `workspace/symbol`
 * avec query `"#"` (tous les noms de tags commencent par `#`) liste donc tous
 * les tags du vault en une seule requête, et une query `#nom` retournerait
 * toutes les notes contenant ce tag. Les alias frontmatter sont
 * `SymbolKind::FILE` (vault/mod.rs `to_symbol_informations`) — le filtre
 * Constant les exclut d'office.
 *
 * DI : la fonction de requête LSP est INJECTÉE (le réel est
 * `requestMarkdownOxide` de ./markdown-oxide) — ce module reste PUR pour les
 * tests bun (markdown-oxide.ts charge des stores svelte, incompatibles).
 */
import { fromFileUri, type LspRequest } from "./backlinks";

/**
 * SymbolKind.Constant = 14 (spécification LSP). Attention : Variable = 13,
 * Constant = 14 — ne pas confondre. markdown-oxide mappe les tags sur
 * `SymbolKind::CONSTANT` (vault/mod.rs).
 */
export const SYMBOL_KIND_CONSTANT = 14;

export interface TagNote {
  /** Chemin absolu du fichier contenant le tag. */
  path: string;
  /** Ligne de la première occurrence (1-based, prête pour le jump). */
  line: number;
}

export interface TagEntry {
  /** Nom du tag sans le `#` (ex. "projet"). */
  tag: string;
  /** Notes distinctes contenant le tag (dédupliquées par fichier). */
  notes: TagNote[];
}

interface LspSymbol {
  name: string;
  kind: number;
  location: {
    uri: string;
    range: { start: { line: number; character: number } };
  };
}

/** `#tag` → `tag` (normalisation du nom de symbole). */
export function normalizeTag(name: string): string {
  return name.startsWith("#") ? name.slice(1) : name;
}

/** Occurence brute d'un tag (une par symbole Constant retourné). */
export interface TagOccurrence {
  tag: string;
  path: string;
  line: number;
}

/**
 * Convertit le résultat LSP `SymbolInformation | SymbolInformation[] | null`
 * en occurrences de tags : ne garde QUE les symboles `SymbolKind::Constant`
 * (les fichiers/headings/blocs — et les ALIAS frontmatter, kind FILE — sont
 * ignorés), normalise le nom et décale la ligne en 1-based.
 */
export function parseTagSymbols(
  result: LspSymbol | LspSymbol[] | null,
): TagOccurrence[] {
  const symbols = Array.isArray(result) ? result : result ? [result] : [];
  const out: TagOccurrence[] = [];
  for (const sym of symbols) {
    if (sym.kind !== SYMBOL_KIND_CONSTANT) continue;
    const tag = normalizeTag(sym.name);
    if (!tag) continue;
    out.push({
      tag,
      path: fromFileUri(sym.location.uri),
      line: sym.location.range.start.line + 1,
    });
  }
  return out;
}

/**
 * Agrège les occurrences en entrées par tag : une note distincte par tag
 * (dédupliquée par fichier — un tag répété dans le même fichier ne compte
 * qu'une fois, la ligne de la PREMIÈRE occurrence est conservée). Tri par nom
 * de tag (insensible à la casse, stable), puis par chemin.
 */
export function aggregateTags(occurrences: TagOccurrence[]): TagEntry[] {
  const byTag = new Map<string, Map<string, number>>();
  for (const { tag, path, line } of occurrences) {
    let notes = byTag.get(tag);
    if (!notes) {
      notes = new Map();
      byTag.set(tag, notes);
    }
    if (!notes.has(path)) notes.set(path, line);
  }
  return [...byTag.entries()]
    .map(([tag, notes]) => ({
      tag,
      notes: [...notes.entries()]
        .map(([path, line]) => ({ path, line }))
        .sort((a, b) => a.path.localeCompare(b.path)),
    }))
    .sort(
      (a, b) =>
        a.tag.localeCompare(b.tag, undefined, { sensitivity: "base" }) ||
        a.tag.localeCompare(b.tag),
    );
}

/**
 * Tri par FRÉQUENCE décroissante (nombre de notes distinctes), départagé par
 * le nom de tag (insensible à la casse, stable) — l'ordre d'affichage des tags
 * dans la vue. `aggregateTags` reste alphabétique (forme canonique) ; ce tri
 * est une VUE de présentation. Ne mute pas l'entrée.
 */
export function sortTagsByFrequency(entries: TagEntry[]): TagEntry[] {
  return [...entries].sort(
    (a, b) =>
      b.notes.length - a.notes.length ||
      a.tag.localeCompare(b.tag, undefined, { sensitivity: "base" }) ||
      a.tag.localeCompare(b.tag),
  );
}

/**
 * Interroge markdown-oxide : TOUS les tags du vault. La query `"#"` matche
 * chaque symbole dont le nom commence par `#` — c'est-à-dire précisément les
 * tags (les fichiers/headings ont d'autres noms). Rejette si le serveur n'est
 * pas démarré ou en cas de timeout.
 */
export async function fetchVaultTags(
  request: LspRequest,
  timeoutMs = 8000,
): Promise<TagEntry[]> {
  const result = await request<LspSymbol | LspSymbol[] | null>(
    "workspace/symbol",
    { query: "#" },
    timeoutMs,
  );
  return aggregateTags(parseTagSymbols(result));
}
