/**
 * Moteur de gabarit à variables `{{…}}` — module PUR (testable sans DOM ni
 * Tauri), détaché des colles pour devenir le moteur CENTRAL des rendus de
 * documents (handouts). `src/colles/report-layout.ts` en est le premier
 * consommateur (gabarit configurable du rapport de colle) ; les layouts par
 * type de document (cours, exercices, devoir, …) l'utiliseront aussi.
 *
 * Sémantiques (décisions utilisateur) :
 *  - VARIABLE NON RENSEIGNÉE (inconnue ou vide) → INVISIBLE : rien n'est
 *    rendu. Un document imprimé ne doit jamais montrer de littéral `{{…}}`.
 *    Seuls les blocs mal formés (tag non fermé) et `{{else}}` orphelin restent
 *    visibles tels quels, pour signaler une erreur de syntaxe du template.
 *  - Échappement STRICT : les valeurs de variables texte passent par
 *    `escHtml` au remplacement ; seules les variables « html » (résultat
 *    `raw: true` — blocs composés, fragments markdown rendus) sont insérées
 *    brutes.
 *  - CONDITIONNELLES ET BOUCLES : `{{#if var}}…{{/if}}`,
 *    `{{#unless var}}…{{/unless}}` et `{{#each name}}…{{/each}}`
 *    (imbricables, `{{else}}` pour la branche alternative) — une variable est
 *    « vide » si elle se résout en "" ou en espaces ; une condition/collection
 *    NON RENSEIGNÉE est traitée comme vide (branche `{{else}}`, ou rien).
 *    Exemple : `{{#if salle}} · {{salle}}{{/if}}` n'affiche le séparateur
 *    « · » que si la salle est renseignée ;
 *    `{{#each rubriques}}{{label}} : {{value}}\n{{else}}—{{/each}}` liste les
 *    items ou affiche « — » si aucun.
 */

// ── Types ────────────────────────────────────────────────────────────────────

/** Résultat de la résolution d'une variable de template. */
export type ResolveResult = { value: string; raw: boolean } | null;

/** Résolveur d'UN item d'un bloc `{{#each}}` (contexte de l'item). */
export interface EachItem {
  resolve: (name: string) => ResolveResult;
}

/** Contexte d'un bloc `{{#each name}}` : les items à itérer. */
export interface EachContext {
  items: EachItem[];
}

/** Résolveur de blocs `{{#each}}` : name → items (ou null si inconnu). */
export type ResolveEach = (name: string) => EachContext | null;

/** Signature d'un résolveur de variable (retourne null si inconnue). */
export type TemplateResolve = (name: string) => ResolveResult;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Échappe un texte brut avant insertion dans le HTML. */
export function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Moteur (blocs + variables) ───────────────────────────────────────────────

const BLOCK_OPEN = /\{\{#(if|unless|each)\s+([a-zA-Z0-9_.:]+)\}\}/;
const BLOCK_CLOSE = /\{\{\/(if|unless|each)\}\}/;
const ELSE_TAG = "{{else}}";
const BLOCK_ELSE = /\{\{else\}\}/;
const VAR_TOKEN = /\{\{([a-zA-Z0-9_.:@]+)\}\}/g;

/**
 * Recherche, depuis `from`, la fermeture `{{/kind}}` du bloc ouvert (avec
 * prise en compte de l'imbrication — un `{{/autre}}` ou un `{{else}}`
 * imbriqué ne ferment rien) et le premier `{{else}}` au niveau 0.
 * Renvoie { closeStart, closeEnd } (positions du tag de fermeture) et
 * elsePos (début du tag `{{else}}`, ou null). Si le tag de fermeture est de
 * kind incohérent ou absent : closeStart = -1 (bloc mal formé → le bloc
 * reste littéral).
 */
function findBlockEnd(
  text: string,
  from: number,
  kind: string,
): { closeStart: number; closeEnd: number; elsePos: number | null } {
  let subDepth = 0;
  let pos = from;
  let elsePos: number | null = null;
  while (pos < text.length) {
    const rest = text.slice(pos);
    const open = BLOCK_OPEN.exec(rest);
    const close = BLOCK_CLOSE.exec(rest);
    const els = BLOCK_ELSE.exec(rest);
    const cands: Array<{ i: number; t: "open" | "close" | "else"; l: number; k?: string }> = [];
    if (open) cands.push({ i: open.index, t: "open", l: open[0].length });
    if (close) cands.push({ i: close.index, t: "close", l: close[0].length, k: close[1] });
    if (els) cands.push({ i: els.index, t: "else", l: els[0].length });
    if (!cands.length) break;
    cands.sort((a, b) => a.i - b.i);
    const c = cands[0];
    if (c.t === "open") {
      subDepth++;
    } else if (c.t === "close") {
      if (subDepth === 0) {
        if (c.k !== kind) break; // kind incohérent → bloc non fermé proprement
        return { closeStart: pos + c.i, closeEnd: pos + c.i + c.l, elsePos };
      }
      subDepth--;
    } else if (subDepth === 0 && elsePos === null) {
      elsePos = pos + c.i; // DÉBUT du tag {{else}}
    }
    pos += c.i + c.l;
  }
  return { closeStart: -1, closeEnd: -1, elsePos };
}

/**
 * Traite les blocs du template (`{{#if}}`, `{{#unless}}`, `{{#each}}`,
 * `{{else}}` — tous imbricables) de façon RÉCURSIVE : le corps d'un bloc
 * conservé est re-rendu avec son propre résolveur (l'item pour `{{#each}}`),
 * donc un `{{#if value}}` DANS un `{{#each rubriques}}` évalue `value` sur
 * l'item courant, et un `{{#each}}` DANS un `{{#if}}` fonctionne aussi.
 *
 * Sémantiques (identiques aux variables) :
 *  - une variable est « vide » si elle se résout en "" ou en espaces ;
 *  - condition ou each NON RENSEIGNÉ (resolve → null) → traité comme VIDE
 *    (branche `{{else}}`, ou rien) — jamais de contenu littéral en sortie ;
 *  - bloc non fermé / mal formé → littéral (erreur de syntaxe du template) ;
 *  - `{{#each name}}A{{else}}B{{/each}}` : A par item, B si zéro item.
 */
function renderBlocks(
  text: string,
  resolve: TemplateResolve,
  resolveEach: ResolveEach | undefined,
  depth: number,
): string {
  if (depth > 30) return text;
  let out = "";
  let pos = 0;
  while (pos < text.length) {
    const rest = text.slice(pos);
    const open = BLOCK_OPEN.exec(rest);
    if (!open) {
      out += rest;
      break;
    }
    out += rest.slice(0, open.index);
    const [, kind, name] = open;
    const openEnd = pos + open.index + open[0].length;
    const scan = findBlockEnd(text, openEnd, kind);
    if (scan.closeStart === -1) {
      // non fermé → le tag d'ouverture est littéral, on continue après
      out += open[0];
      pos = openEnd;
      continue;
    }
    const thenText = text.slice(openEnd, scan.elsePos ?? scan.closeStart);
    const elseText =
      scan.elsePos !== null
        ? text.slice(scan.elsePos + ELSE_TAG.length, scan.closeStart)
        : "";
    let body: string;
    if (kind === "if" || kind === "unless") {
      const r = resolve(name);
      const nonEmpty = r !== null && r.value.trim() !== "";
      const wantThen = kind === "if" ? nonEmpty : !nonEmpty;
      body = renderTemplate(wantThen ? thenText : elseText, resolve, resolveEach, depth + 1);
    } else {
      const ctx = resolveEach?.(name);
      const items = ctx?.items ?? [];
      // Chaque item est rendu avec SON résolveur, avec repli sur le résolveur
      // PARENT pour les variables hors item (contexte externe — un
      // `{{#if salle}}` dans un `{{#each rubriques}}` reste valide).
      body =
        items.length === 0
          ? renderTemplate(elseText, resolve, resolveEach, depth + 1)
          : items
              .map((item) =>
                renderTemplate(
                  thenText,
                  (n) => item.resolve(n) ?? resolve(n),
                  undefined,
                  depth + 1,
                ),
              )
              .join("");
    }
    out += body;
    pos = scan.closeEnd;
  }
  return out;
}

/**
 * Rend UN TEMPLATE : d'abord les blocs (`{{#if}}`/`{{#unless}}`/`{{#each}}` +
 * `{{else}}`), puis la substitution des variables restantes (`{{name}}`) :
 * valeurs texte échappées, variables html brutes, variable NON RENSEIGNÉE →
 * invisible (""), texte libre verbatim. `resolveEach` alimente `{{#each}}`
 * (facultatif — sans lui, un bloc `{{#each}}` est traité comme vide).
 */
function renderTemplate(
  text: string,
  resolve: TemplateResolve,
  resolveEach: ResolveEach | undefined,
  depth: number,
): string {
  const blocks = renderBlocks(text, resolve, resolveEach, depth);
  return blocks.replace(VAR_TOKEN, (full, name: string) => {
    const r = resolve(name);
    if (!r) {
      // `{{else}}` ORPHELIN (hors bloc) = syntaxe de bloc mal formée → reste
      // visible (erreur à corriger), contrairement aux variables inconnues.
      return name === "else" ? full : "";
    }
    return r.raw ? r.value : escHtml(r.value);
  });
}

/**
 * REND UN TEMPLATE de gabarit (entrée publique du moteur) : blocs
 * conditionnels (`{{#if}}`/`{{#unless}}`/`{{#each}}` + `{{else}}`,
 * imbricables) puis variables `{{name}}` — valeurs texte échappées,
 * variables html brutes, variable NON RENSEIGNÉE → invisible (""), texte
 * libre verbatim. `resolveEach` fournit les items de `{{#each}}` (facultatif).
 */
export function renderTemplateText(
  text: string,
  resolve: TemplateResolve,
  resolveEach?: ResolveEach,
): string {
  return renderTemplate(text, resolve, resolveEach, 0);
}
