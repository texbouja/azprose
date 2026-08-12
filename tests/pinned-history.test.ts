/**
 * Phase D — historique de MONTAGE du pinned slot (module PUR, aucune rune).
 * Piles PAR FORMAT : le slot est défini par son format (au plus un éditeur
 * épinglé par format), l'historique appartient au slot, pas au tab.
 */
import { expect, test } from "bun:test";
import { createPinnedHistory } from "../src/lib/pinned-history";

test("pile vide : aucun retour possible, back/forward rendent null", () => {
  const h = createPinnedHistory();
  expect(h.canGoBack("md")).toBe(false);
  expect(h.canGoForward("md")).toBe(false);
  expect(h.back("md")).toBeNull();
  expect(h.forwardStep("md", "/a.md")).toBeNull();
  // Aucune pile n'est matérialisée par une simple lecture.
  expect(h.size()).toBe(0);
});

test("montages successifs : le retour remonte les contenus quittés, en ordre inverse", () => {
  const h = createPinnedHistory();
  // Le slot monte /a.md → /b.md → /c.md (on empile le contenu QUITTÉ).
  h.push("md", "/a.md");
  h.push("md", "/b.md");
  expect(h.canGoBack("md")).toBe(true);

  expect(h.back("md")).toBe("/b.md");
  expect(h.back("md")).toBe("/a.md");
  expect(h.back("md")).toBeNull();
});

test("retour puis avance : le forward redescend, multi-crans", () => {
  const h = createPinnedHistory();
  h.push("md", "/a.md");
  h.push("md", "/b.md");

  // Retour depuis /c.md : on remonte /b.md et /c.md part sur le forward.
  expect(h.back("md")).toBe("/b.md");
  h.pushForward("md", "/c.md");
  expect(h.back("md")).toBe("/a.md");
  h.pushForward("md", "/b.md");

  // Avance : on redescend /b.md puis /c.md (le reste du forward survit au
  // premier cran — c'est tout l'objet de forwardStep).
  expect(h.forwardStep("md", "/a.md")).toBe("/b.md");
  expect(h.canGoForward("md")).toBe(true);
  expect(h.forwardStep("md", "/b.md")).toBe("/c.md");
  expect(h.canGoForward("md")).toBe(false);
  // Le back a été reconstitué au passage.
  expect(h.back("md")).toBe("/b.md");
});

test("un nouveau montage invalide le forward (sémantique navigateur)", () => {
  const h = createPinnedHistory();
  h.push("md", "/a.md");
  h.back("md");
  h.pushForward("md", "/b.md");
  expect(h.canGoForward("md")).toBe(true);

  h.push("md", "/a.md"); // montage d'un nouveau contenu
  expect(h.canGoForward("md")).toBe(false);
});

test("piles ISOLÉES par format : md et tex ne partagent rien", () => {
  const h = createPinnedHistory();
  h.push("md", "/note.md");
  h.push("tex", "/main.tex");

  expect(h.size()).toBe(2);
  expect(h.back("md")).toBe("/note.md");
  expect(h.canGoBack("md")).toBe(false);
  // La pile tex est intacte.
  expect(h.canGoBack("tex")).toBe(true);
  expect(h.back("tex")).toBe("/main.tex");
});

test("sans format (aucun slot) : toutes les opérations sont des no-op sûrs", () => {
  const h = createPinnedHistory();
  h.push(null, "/a.md");
  h.pushForward(undefined, "/b.md");
  expect(h.size()).toBe(0);
  expect(h.back(null)).toBeNull();
  expect(h.forwardStep(undefined, "/a.md")).toBeNull();
  expect(h.canGoBack(null)).toBe(false);
  expect(h.purge(null)).toBe(false);
});

test("purge : la pile d'un format meurt avec son épingle ; reset vide tout", () => {
  const h = createPinnedHistory();
  h.push("md", "/a.md");
  h.push("tex", "/main.tex");

  expect(h.purge("md")).toBe(true);
  expect(h.canGoBack("md")).toBe(false);
  expect(h.canGoBack("tex")).toBe(true);
  expect(h.purge("md")).toBe(false); // déjà purgée

  expect(h.reset()).toBe(true);
  expect(h.size()).toBe(0);
  expect(h.reset()).toBe(false);
});
