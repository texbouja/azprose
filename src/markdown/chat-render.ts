// Pipeline de rendu « chat » (panneau agent) — processus SIMILAIRE au
// pipeline document (render.ts), allégé de ce qui n'a pas de sens pour du
// texte produit par un LLM en conversation : pas de front matter, pas de
// templating {{}}, pas de transclusion (I/O récursif), pas de fences
// meta/colle, pas de synchronisation de lignes source.
//
// Ce module est volontairement SANS import lourd (colles, doc-template,
// stores à runes) pour rester testable sous `bun test`.
//
// Deux écarts ASSUMÉS avec le pipeline document :
// - `html: false` — le contenu vient d'un modèle externe : tout HTML brut est
//   ÉCHAPPÉ (affiché comme texte), jamais interprété. Le pipeline document
//   garde `html: true` pour la cohérence ProseMark, lui.
// - instance SÉPARÉE du singleton `md` de render.ts : `activeShikiTheme` est
//   un mutable partagé, et le fence renderer document traite ```meta
//   spécialement — un agent peut légitimement produire un tel fence en
//   exemple.

import MarkdownIt from "markdown-it";
import type { RenderRule } from "markdown-it/lib/renderer.mjs";
import mark from "markdown-it-mark";
import taskLists from "markdown-it-task-lists";
import callouts from "markdown-it-obsidian-callouts";
import footnote from "markdown-it-footnote";
import type { Theme } from "@/lib/theme";
import { wikilinkPlugin } from "./wikilinks";
import { mathPlugin } from "./math-plugin";
import { prepareShiki, shikiFence } from "./highlight";

// Icônes de callouts : registre local au chat (les réglages personnalisés du
// vault ne sont pas branchés ici — les icônes par défaut suffisent pour une
// réponse d'agent).
const chatCalloutOptions = { icons: {} as Record<string, string> };

const mdChat = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: false,
  highlight: (code, lang) => shikiFence(code, lang),
});

mdChat.use(taskLists, { enabled: false, label: true });
mdChat.use(mark);
mdChat.use(mathPlugin);
mdChat.use(wikilinkPlugin);
mdChat.use(callouts, chatCalloutOptions);
mdChat.use(footnote);
mdChat.renderer.rules.fence = ((tokens, idx, _options, _env, _self) => {
  const token = tokens[idx];
  const lang = (token.info.trim().split(/\s+/)[0]) || "text";
  return shikiFence(token.content, lang);
}) as RenderRule;

/**
 * Rend un texte de chat (réponse d'agent) en HTML. Asynchrone : charge le
 * thème Shiki courant et les langages détectés, comme le pipeline document.
 * Appelé à chaque chunk pendant le streaming — markdown-it/Shiki une fois
 * chargés restent bien en dessous du millième de seconde sur ces volumes.
 */
export async function renderChatMarkdown(src: string, theme: Theme): Promise<string> {
  if (!src.trim()) return "";
  await prepareShiki(src, theme);
  return mdChat.render(src);
}
