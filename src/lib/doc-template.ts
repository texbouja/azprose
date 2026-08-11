/**
 * Templating du corps markdown et des gabarits d'impression à partir des
 * métadonnées YAML (front-matter et fences) — module PUR.
 *
 * Le moteur de syntaxe vit dans `handout-layout.ts` (blocs `{{#if}}`,
 * `{{#unless}}`, `{{#each}}`, `{{else}}`, variables `{{name}}` — facture
 * Handlebars, sans le moindre emprunt d'implémentation à Templater). Ce
 * module fournit les RÉSOLVEURS YAML et l'application au corps du document.
 *
 * Règles (décisions utilisateur) :
 *  - Résolution AU RENDU : le front-matter est re-parse et le corps re-templaté
 *    à chaque rendu — jamais d'écriture dans la source .md.
 *  - `type` → null (commutateur de comportement, jamais une variable
 *    d'affichage) ; variable absente/null/objet → null (invisible) ;
 *    booléen `true` → "true" ; `false` → null ; scalaire → String ;
 *    tableau → joint « · » ; chemins `{{chapitres.0}}`, `{{auteur.nom}}`.
 *  - Les fences de code (``` et ~~~) sont SAUTÉS : le code reste verbatim.
 *  - Transclusions : les `{{var}}` d'un texte transclu se résolvent d'abord
 *    avec le front-matter du FICHIER MAÎTRE, en repli (variable absente ou
 *    vide) avec celui du FICHIER TRANSCLU (`templateDocSource`).
 */
import { parseFrontMatter } from "./front-matter";
import { displayYamlValue } from "./doc-meta";
import {
  renderTemplateText,
  type EachContext,
  type ResolveEach,
  type ResolveResult,
  type TemplateResolve,
} from "./handout-layout";

// ── Résolution ──────────────────────────────────────────────────────────────

/**
 * Résout un chemin `a.b.c` dans un dictionnaire structuré : tableaux par
 * index (`chapitres.0`), objets par clé propre (`auteur.nom`). Retourne
 * undefined si un segment est introuvable.
 */
function lookupPath(values: Record<string, unknown>, name: string): unknown {
  const parts = name.split(".");
  if (parts[0] === "") return undefined;
  let cur: unknown = Object.prototype.hasOwnProperty.call(values, parts[0])
    ? values[parts[0]]
    : undefined;
  for (let i = 1; i < parts.length; i++) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(parts[i]);
      cur = Number.isInteger(idx) && idx >= 0 && idx < cur.length ? cur[idx] : undefined;
    } else if (typeof cur === "object") {
      const rec = cur as Record<string, unknown>;
      cur = Object.prototype.hasOwnProperty.call(rec, parts[i]) ? rec[parts[i]] : undefined;
    } else {
      return undefined;
    }
  }
  return cur;
}

/**
 * Résout UNE variable `{{name}}` depuis les valeurs YAML structurées.
 * `type` (et ses chemins) → null : commutateur logique, jamais affiché.
 */
export function resolveDocVar(name: string, values: Record<string, unknown>): ResolveResult | null {
  if (!name || name.split(".")[0] === "type") return null;
  return displayYamlValue(lookupPath(values, name));
}

/**
 * Résout un bloc `{{#each name}}` depuis un tableau YAML. Chaque item résout
 * `{{this}}`/`{{.}}` sur sa valeur (scalaire, ou chemin dans un objet) ; les
 * autres variables retombent sur le résolveur parent (contexte externe).
 */
export function resolveDocEach(name: string, values: Record<string, unknown>): EachContext | null {
  const arr = lookupPath(values, name);
  if (!Array.isArray(arr)) return null;
  return {
    items: arr.map((item) => ({
      resolve: (n: string): ResolveResult | null => {
        if (n === "this" || n === ".") return displayYamlValue(item);
        if (item !== null && typeof item === "object") {
          return displayYamlValue(lookupPath(item as Record<string, unknown>, n));
        }
        return null;
      },
    })),
  };
}

// ── Application au corps markdown (fences sautées) ──────────────────────────

/**
 * Applique `render` aux segments HORS fences de code (``` et ~~~, ouverture
 * quelconque, fermeture = même marque seule en fin de ligne). Les blocs
 * `{{#if}}…{{/if}}` multi-lignes fonctionnent : les segments hors fences
 * sont rendus entiers (jamais ligne à ligne). Fence non fermée → verbatim.
 */
export function templateOutsideFences(text: string, render: (seg: string) => string): string {
  const re = /^[ \t]*(`{3,}|~{3,})([^\n]*)$/gm;
  let out = "";
  let segStart = 0;
  let inFence = false;
  let fenceMark = "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const mark = m[1];
    const rest = m[2].trim();
    if (!inFence) {
      out += render(text.slice(segStart, m.index));
      inFence = true;
      fenceMark = mark;
      segStart = m.index; // la copie verbatim part de la ligne d'ouverture
    } else if (mark === fenceMark && rest === "") {
      out += text.slice(segStart, re.lastIndex);
      inFence = false;
      segStart = re.lastIndex;
    }
  }
  out += inFence ? text.slice(segStart) : render(text.slice(segStart));
  return out;
}

/**
 * Rend le corps d'un document avec ses propres valeurs YAML (front-matter
 * OU fence) : blocs conditionnels, boucles et variables, hors fences de code.
 */
export function renderBodyTemplates(body: string, values: Record<string, unknown>): string {
  const resolve: TemplateResolve = (name) => resolveDocVar(name, values);
  const resolveEach: ResolveEach = (name) => resolveDocEach(name, values);
  return templateOutsideFences(body, (seg) => renderTemplateText(seg, resolve, resolveEach));
}

// ── Transclusions (portée maître puis transclu) ─────────────────────────────

/**
 * Chaîne de repli : la variable du FICHIER MAÎTRE prime si elle est présente
 * et non vide ; sinon celle du fichier transclu (le contexte courant passe
 * en premier dans `resolveDocVar`).
 */
function chainResolver(
  master: Record<string, unknown>,
  own: Record<string, unknown>,
): { resolve: TemplateResolve; resolveEach: ResolveEach } {
  return {
    resolve: (name) => {
      const masterResolved = resolveDocVar(name, master);
      if (masterResolved && masterResolved.value.trim() !== "") return masterResolved;
      return resolveDocVar(name, own);
    },
    resolveEach: (name) => {
      const masterArr = lookupPath(master, name);
      if (Array.isArray(masterArr) && masterArr.length > 0) {
        return resolveDocEach(name, master);
      }
      const ownArr = lookupPath(own, name);
      return Array.isArray(ownArr) && ownArr.length > 0 ? resolveDocEach(name, own) : null;
    },
  };
}

/**
 * Template le contenu d'un fichier transclu pour le hook de transclusion :
 * le front-matter du fichier maître prime, celui du fichier transclu sert de
 * repli (variables absentes ou vides). Le front-matter du transclu est
 * conservé intact (jamais rendu, jamais modifié).
 */
export function templateDocSource(source: string, rootValues: Record<string, unknown>): string {
  const fm = parseFrontMatter(source);
  const { resolve, resolveEach } = chainResolver(rootValues, fm.values);
  const templated = templateOutsideFences(fm.body, (seg) =>
    renderTemplateText(seg, resolve, resolveEach),
  );
  return source.slice(0, source.length - fm.body.length) + templated;
}
