import { expect, test } from "bun:test";
import { BUILTIN_THEMES, THEME_GROUPS } from "../src/lib/theme";

// Catalogue des thèmes — garde-fou contre la dérive entre BUILTIN_THEMES (la liste
// canonique) et THEME_GROUPS (ce que le menu affiche). Ajouté en phase 1.1 de la
// refonte UI (suppression des thèmes crafted, builtins seuls — R4).

test("BUILTIN_THEMES contient exactement 9 identifiants, ni mono ni mono-dark", () => {
  expect(BUILTIN_THEMES.length).toBe(9);
  expect(BUILTIN_THEMES).not.toContain("mono");
  expect(BUILTIN_THEMES).not.toContain("mono-dark");
});

test("tout thème de BUILTIN_THEMES apparaît dans un groupe du menu", () => {
  const choiceValues = new Set(THEME_GROUPS.flatMap((g) => g.choices.map((c) => c.value)));
  for (const id of BUILTIN_THEMES) {
    expect(choiceValues.has(id)).toBe(true);
  }
});

test("tout choix du menu (hors system) pointe vers un thème existant", () => {
  const builtinSet = new Set<string>(BUILTIN_THEMES);
  for (const group of THEME_GROUPS) {
    for (const choice of group.choices) {
      if (choice.value === "system") continue;
      expect(builtinSet.has(choice.value)).toBe(true);
    }
  }
});

test("THEME_GROUPS ne contient plus de groupe crafted", () => {
  expect(THEME_GROUPS.some((g) => g.label === "crafted")).toBe(false);
});
