/**
 * Tests du module des options de configuration de session (ACP v1 « Session
 * Config Options ») — source du sélecteur de modèle. Module PUR : extraction
 * de l'option modèle, liste déclarée, repli saisie libre, groupement.
 */
// @ts-nocheck
import { describe, expect, test } from "bun:test";
import {
  estIdModele,
  grouperParProvider,
  modelesDeOption,
  optionModele,
  type ConfigOption,
} from "../src/lib/agent/config-options";

// Forme réelle mesurée en sonde (2026-08-21, OpenCode 1.18.11) — tranche
// représentative des 29 valeurs ; l'agent déclare AUSSI une option `mode`
// que le sélecteur de modèle doit ignorer.
const ETAT_SONDE: ConfigOption[] = [
  {
    id: "model",
    name: "Model",
    category: "model",
    type: "select",
    currentValue: "opencode/big-pickle",
    options: [
      { value: "opencode/big-pickle", name: "OpenCode/Big Pickle" },
      { value: "opencode/hy3-free", name: "OpenCode/Hy3 Free" },
      { value: "opencode-go/qwen3-coder", name: "OpenCode Go/Qwen3 Coder" },
      { value: "opencode-go/kimi-k2", name: "OpenCode Go/Kimi K2" },
    ],
  },
  {
    id: "mode",
    category: "mode",
    type: "select",
    currentValue: "build",
    options: [
      { value: "build", name: "build" },
      { value: "plan", name: "plan" },
    ],
  },
];

describe("optionModele (extraction de l'option catégorie `model`)", () => {
  test("trouve l'option par sa catégorie, même entourée d'autres options", () => {
    const opt = optionModele(ETAT_SONDE);
    expect(opt?.id).toBe("model");
    expect(opt?.currentValue).toBe("opencode/big-pickle");
  });

  test("replie sur l'id canonique `model` si la catégorie manque", () => {
    // La spec rend la catégorie OPTIONNELLE : un agent qui l'omet ne doit
    // pas priver l'utilisateur du sélecteur.
    const opt = optionModele([{ id: "model", type: "select", currentValue: "a/b", options: [] }]);
    expect(opt?.id).toBe("model");
  });

  test("absente, vide ou non-tableau → null, jamais d'erreur", () => {
    expect(optionModele([])).toBe(null);
    expect(optionModele([{ id: "mode", category: "mode", type: "select" }])).toBe(null);
    expect(optionModele(undefined)).toBe(null);
    expect(optionModele(null)).toBe(null);
  });
});

describe("modelesDeOption (liste déclarée par l'agent)", () => {
  test("mappe valeur→id, calcule le fournisseur et garde le nom de l'agent", () => {
    const modeles = modelesDeOption(optionModele(ETAT_SONDE));
    expect(modeles).toEqual([
      { id: "opencode/big-pickle", provider: "opencode", nom: "OpenCode/Big Pickle" },
      { id: "opencode/hy3-free", provider: "opencode", nom: "OpenCode/Hy3 Free" },
      { id: "opencode-go/qwen3-coder", provider: "opencode-go", nom: "OpenCode Go/Qwen3 Coder" },
      { id: "opencode-go/kimi-k2", provider: "opencode-go", nom: "OpenCode Go/Kimi K2" },
    ]);
  });

  test("traite toute option select (le tri par catégorie est l'affaire d'optionModele)", () => {
    // L'option `mode` est elle-même un select : si on la passe directement,
    // ses valeurs sont traitées comme les autres. Le sélecteur de modèle ne
    // la reçoit jamais car il passe par optionModele().
    expect(modelesDeOption(ETAT_SONDE[1]).map((m) => m.id)).toEqual(["build", "plan"]);
    expect(modelesDeOption({ id: "brave", type: "boolean", currentValue: true })).toEqual([]);
  });

  test("déduplique par identifiant et tolère les valeurs sans nom", () => {
    const opt: ConfigOption = {
      id: "model",
      category: "model",
      type: "select",
      options: [
        { value: "a/x" },
        { value: "a/x", name: "doublon" },
        { value: "", name: "vide" },
        { value: "sans-barre" },
      ],
    };
    const modeles = modelesDeOption(opt);
    expect(modeles.map((m) => m.id)).toEqual(["a/x", "sans-barre"]);
    // Sans « / », l'id entier sert de groupe (autre agent hypothétique).
    expect(modeles[1]).toMatchObject({ provider: "sans-barre", nom: undefined });
  });

  test("option absente ou sans valeurs → liste vide", () => {
    expect(modelesDeOption(null)).toEqual([]);
    expect(modelesDeOption({ id: "model", type: "select" })).toEqual([]);
  });
});

describe("estIdModele (repli saisie libre)", () => {
  test("accepte la forme fournisseur/modèle", () => {
    expect(estIdModele("anthropic/claude-sonnet-4-5")).toBe(true);
    expect(estIdModele("  opencode/hy3-free  ")).toBe(true); // trim toléré
  });
  test("refuse tout ce qui n'a pas exactement un séparateur utilisable", () => {
    expect(estIdModele("big-pickle")).toBe(false);
    expect(estIdModele("/hy3-free")).toBe(false);
    expect(estIdModele("opencode/")).toBe(false);
    expect(estIdModele("deux mots/model")).toBe(false);
    expect(estIdModele("")).toBe(false);
  });
});

test("grouperParProvider conserve l'ordre de première apparition", () => {
  const groupes = grouperParProvider(modelesDeOption(optionModele(ETAT_SONDE)));
  expect([...groupes.keys()]).toEqual(["opencode", "opencode-go"]);
  expect(groupes.get("opencode")!.map((m) => m.id)).toEqual([
    "opencode/big-pickle",
    "opencode/hy3-free",
  ]);
});
