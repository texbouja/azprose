import { describe, expect, test } from "bun:test";
import { sectionMath } from "@/lib/project-config";

/**
 * Le fichier de projet est RELU à chaque ouverture et écrase les stores : une
 * clé omise n'est donc pas « neutre », elle laisse l'ancienne valeur en place
 * et la réimpose. Ces tests fixent la règle qui a manqué le 2026-08-19.
 */
describe("section `math` du fichier de projet", () => {
  test("les quatre clés sont écrites, même aux valeurs par défaut", () => {
    // Le cas exact du défaut signalé : revenir de Fira à New Computer Modern
    // (la valeur PAR DÉFAUT) ne tenait pas au redémarrage.
    expect(sectionMath("", [], "newcm", "large")).toEqual({
      preamble: "",
      packages: [],
      font: "newcm",
      spacing: "large",
    });
  });

  test("un préambule effacé s'écrit comme tel", () => {
    expect(sectionMath("", ["mathtools"], "fira", "small").preamble).toBe("");
  });

  test("des paquets tous décochés s'écrivent comme tels", () => {
    expect(sectionMath("\\R", [], "fira", "medium").packages).toEqual([]);
  });

  test("les valeurs non défaut traversent sans altération", () => {
    expect(sectionMath("\\newcommand{\\R}{\\mathbb{R}}", ["physics"], "fira", "small")).toEqual({
      preamble: "\\newcommand{\\R}{\\mathbb{R}}",
      packages: ["physics"],
      font: "fira",
      spacing: "small",
    });
  });
});
