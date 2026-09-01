/**
 * Le périmètre du coffre — arbitrage A du 2026-08-31 : un chemin appartient à
 * la session si et seulement s'il est sous la racine ou sous l'un des dossiers
 * invités.
 *
 * C'est la règle d'isolation la plus consommée de l'application (restauration
 * de session, garde d'écriture de `lib/files.ts`) : elle mérite ses propres cas,
 * y compris les dégénérés — c'est un `""` égaré dans un périmètre qui, sans
 * garde, autoriserait le disque entier.
 */
import { expect, test } from "bun:test";
import { estSous, dansPerimetre } from "../src/lib/paths";
import { filtrerAuPerimetre } from "../src/lib/session-restore";

// ── estSous ────────────────────────────────────────────────────────────────

test("un fichier de la racine appartient à la racine", () => {
  expect(estSous("/coffres/MP2/cours/suites.md", "/coffres/MP2")).toBe(true);
});

test("le dossier lui-même appartient à son périmètre", () => {
  expect(estSous("/coffres/MP2", "/coffres/MP2")).toBe(true);
});

test("le PARENT d'un coffre n'est pas dans le coffre", () => {
  // Le point où `folderRelation` ne suffisait pas : elle rend "nested" dans les
  // deux sens, or la relation cherchée ici est orientée.
  expect(estSous("/coffres", "/coffres/MP2")).toBe(false);
});

test("la comparaison se fait par SEGMENTS, pas par préfixe de chaîne", () => {
  expect(estSous("/coffres/MP2-bis/x.md", "/coffres/MP2")).toBe(false);
});

test("un coffre voisin est hors périmètre", () => {
  expect(estSous("/coffres/PC1/cours/x.md", "/coffres/MP2")).toBe(false);
});

test("une barre finale au dossier ne change rien", () => {
  expect(estSous("/coffres/MP2/x.md", "/coffres/MP2/")).toBe(true);
});

test("un dossier VIDE n'autorise rien", () => {
  // Sans ce garde-fou, `"" + "/"` serait un préfixe de tout chemin absolu.
  expect(estSous("/n/importe/quoi", "")).toBe(false);
});

// ── dansPerimetre ──────────────────────────────────────────────────────────

const PERIMETRE = ["/coffres/MP2", "/ailleurs/Colles"];

test("la racine et les invités sont tous deux du contenu légitime", () => {
  expect(dansPerimetre("/coffres/MP2/cours/x.md", PERIMETRE)).toBe(true);
  expect(dansPerimetre("/ailleurs/Colles/planche.md", PERIMETRE)).toBe(true);
});

test("hors racine ET hors invités : refusé", () => {
  expect(dansPerimetre("/coffres/PC1/x.md", PERIMETRE)).toBe(false);
});

test("un périmètre vide n'autorise rien", () => {
  // État « aucun projet ouvert » : la porte de projet est affichée, l'éditeur
  // n'est pas monté — rien ne doit passer.
  expect(dansPerimetre("/coffres/MP2/x.md", [])).toBe(false);
});

// ── filtrerAuPerimetre ─────────────────────────────────────────────────────

test("la restauration écarte les onglets d'un autre coffre", () => {
  const traces: string[] = [];
  const gardes = filtrerAuPerimetre(
    [
      { path: "/coffres/MP2/a.md" },
      { path: "/coffres/PC1/vole.md" },
      { path: "/ailleurs/Colles/b.md" },
    ],
    "onglet(s)",
    PERIMETRE,
    (m) => traces.push(m),
  );
  expect(gardes.map((g) => g.path)).toEqual(["/coffres/MP2/a.md", "/ailleurs/Colles/b.md"]);
  expect(traces).toHaveLength(1);
  expect(traces[0]).toContain("1 onglet(s) écarté(s)");
});

test("aucun écart ne produit aucune trace", () => {
  const traces: string[] = [];
  const gardes = filtrerAuPerimetre(
    [{ path: "/coffres/MP2/a.md" }],
    "onglet(s)",
    PERIMETRE,
    (m) => traces.push(m),
  );
  expect(gardes).toHaveLength(1);
  expect(traces).toEqual([]);
});

test("sans projet ouvert, TOUTE la session est écartée", () => {
  // Le cas que produisait la course de boot : la session lue au scope d'un
  // projet, ouverte dans la fenêtre d'un autre.
  const traces: string[] = [];
  const gardes = filtrerAuPerimetre(
    [{ path: "/coffres/MP2/a.md" }, { path: "/coffres/MP2/b.md" }],
    "onglet(s)",
    [],
    (m) => traces.push(m),
  );
  expect(gardes).toEqual([]);
  expect(traces[0]).toContain("aucun dossier ouvert");
});
