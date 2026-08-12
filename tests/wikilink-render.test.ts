/**
 * Rendu des wikilinks — garde-fou de la RÉGRESSION signalée (« les wikilinks
 * ne sont même plus rendus comme des liens ») : le plugin markdown-it doit
 * produire un ancrage `.wikilink` porteur de sa cible, indépendamment de toute
 * résolution de chemin (celle-ci est post-rendu et exige la racine du vault).
 */
import { expect, test } from "bun:test";
import MarkdownIt from "markdown-it";
import { wikilinkPlugin } from "../src/markdown/wikilinks";

function render(src: string): string {
  const md = new MarkdownIt();
  md.use(wikilinkPlugin);
  return md.render(src);
}

test("[[cible]] devient un <a class=\"wikilink\"> avec sa cible en data-attribut", () => {
  const html = render("voir [[Suites]] pour la suite");
  expect(html).toContain('class="wikilink"');
  expect(html).toContain('data-wikilink-target="Suites"');
});

test("alias et ancre : [[cible|alias]] et [[cible#titre]]", () => {
  expect(render("[[Notes|mes notes]]")).toContain(">mes notes</a>");
  const anchored = render("[[Notes#Définition]]");
  expect(anchored).toContain('data-wikilink-heading="Définition"');
});

test("un lien PDF rect porte la classe pdf-link (routage distinct du wikilink)", () => {
  const html = render("[[cours.pdf#page=3&rect=1,2,3,4]]");
  expect(html).toContain("pdf-link");
  expect(html).toContain('data-pdf-page="3"');
});
