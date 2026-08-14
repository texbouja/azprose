/**
 * Tests du pipeline « chat » (renderChatMarkdown) — même processus que la
 * preview, allégé. Points critiques : HTML brut ÉCHAPPÉ (html: false —
 * contenu LLM), maths et wikilinks actifs (cohérent avec les instructions
 * données à l'agent), fences Shiki.
 */
// @ts-nocheck
import { expect, test } from "bun:test";
import { renderChatMarkdown } from "../src/markdown/chat-render";

test("markdown de base : gras, listes, code inline", async () => {
  const html = await renderChatMarkdown("Pour **Boujaida** :\n\n- un\n- deux\n\n`x^2`", "latte");
  expect(html).toContain("<strong>Boujaida</strong>");
  expect(html).toContain("<li>un</li>");
  expect(html).toContain("<code>x^2</code>");
});

test("SÉCURITÉ : le HTML brut de l'agent est échappé, jamais interprété", async () => {
  const html = await renderChatMarkdown("Voici : <img src=x onerror=alert(1)> et <script>alert(2)</script>", "latte");
  expect(html).not.toContain("<img");
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;");
});

test("fence de code : coloration Shiki avec langage connu", async () => {
  const html = await renderChatMarkdown("```python\nfor eleve in classe:\n    print(eleve)\n```", "latte");
  // Shiki produit un <pre class="shiki …"> avec des spans colorés.
  expect(html).toContain("shiki");
  expect(html).toContain("for");
});

test("fence sans langage chargé : contenu échappé, jamais interprété", async () => {
  const html = await renderChatMarkdown("```\n<non>\n```", "latte");
  // Shiki gère même le langage « text » : l'échappement est `&#x3C;`.
  expect(html).not.toContain("<non>");
  expect(html).toContain("&#x3C;non");
});

test("maths inline et display : spans mathjax prêts à composer", async () => {
  const html = await renderChatMarkdown("Soit $u_n$ la suite…\n\n$$\\sum_{k=0}^n k^2$$", "latte");
  expect(html).toContain('class="math-inline"');
  expect(html).toContain("\\(u_n\\)");
  expect(html).toContain('class="math-block"');
});

test("wikilinks : rendus en a.wikilink avec la cible en attribut", async () => {
  const html = await renderChatMarkdown("Voir [[notes/el-moujahid|la note de Youssef El Amrani]].", "latte");
  expect(html).toContain('class="wikilink"');
  expect(html).toContain('data-wikilink-target="notes/el-moujahid"');
});

test("fence ```meta : PAS de carte colle dans le chat (écart assumé avec le pipeline document)", async () => {
  const html = await renderChatMarkdown("```meta\ntype: exercices\n```", "latte");
  expect(html).not.toContain("colle-block");
});

test("texte vide → chaîne vide", async () => {
  expect(await renderChatMarkdown("", "latte")).toBe("");
  expect(await renderChatMarkdown("   \n ", "latte")).toBe("");
});
