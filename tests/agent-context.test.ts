/**
 * Tests du contexte d'environnement de l'agent (instructions + config inline).
 * Module PUR — la sonde phase 0c a confirmé que OPENCODE_CONFIG_CONTENT est
 * MERGÉE avec la config globale et que permission ask remonte en ACP.
 */
// @ts-nocheck
import { describe, expect, test } from "bun:test";
import {
  buildAgentConfig,
  buildAgentEnv,
  buildAgentInstructions,
  extractToolDiff,
} from "../src/lib/agent/context";

const ROOT = "/home/prof/vault-boujaida";

test("les instructions situent l'agent : AZprose, vault, rootPath interpolé", () => {
  const text = buildAgentInstructions(ROOT);
  expect(text).toContain("AZprose");
  expect(text).toContain(ROOT);
  expect(text).toContain("vault");
});

// ── R2 : la doctrine « instruction = comportement, outil = donnée » ────────
// Ces tests la rendent NON CONTOURNABLE. Une donnée qui reviendrait se loger
// dans les instructions les ferait rougir.

test("instructions : AUCUNE donnée du vault n'y figure", () => {
  const text = buildAgentInstructions(ROOT);
  // Le préambule et les callouts ne sont plus interpolés : ils sont servis
  // par vault_preambule_math et vault_callouts.
  expect(text).not.toContain("~~~latex");
  expect(text).not.toContain("math.preamble");
  // Plus de catalogue des fichiers .azprose/ en prose (→ outil dédié).
  expect(text).not.toContain("session.json");
  expect(text).not.toContain("csv-cache");
  // Plus de contournement par la ligne de commande : l'accès légitime est
  // un outil, et l'accès texte est refusé par la config.
  expect(text).not.toContain("sqlite3");
});

test("instructions : les outils sont NOMMÉS, avec la consigne de les appeler", () => {
  const text = buildAgentInstructions(ROOT);
  for (const outil of [
    "vault_preambule_math",
    "vault_callouts",
    "vault_donnees_description",
    "base_interroger",
  ]) {
    expect(text).toContain(outil);
  }
  // Un modèle n'appelle un outil que s'il sait qu'il fait autorité.
  expect(text).toContain("fait\nfoi");
});

test("instructions : les conventions d'ÉCRITURE restent (comportement, pas donnée)", () => {
  const text = buildAgentInstructions(ROOT);
  expect(text).toContain("[[wikilinks]]");
  expect(text).toContain("> [!type]");
  expect(text).toContain("MathJax");
});

test("la config déclare les instructions et external_directory: ask", () => {
  const cfg = buildAgentConfig("/appdata/agent-instructions.md") as any;
  expect(cfg.instructions).toEqual(["/appdata/agent-instructions.md"]);
  expect(cfg.permission.external_directory).toBe("ask");
});

test("instructions : les programmes retenus sont NOMMÉS, jamais recopiés", () => {
  const text = buildAgentInstructions(ROOT, {
    programmes: [
      { filiere: "MP / MPI", matiere: "mathematiques", niveau: "2" },
      { filiere: "MPSI", matiere: "mathematiques", niveau: "1" },
    ],
  });
  expect(text).toContain("MP / MPI");
  expect(text).toContain("MPSI");
  expect(text).toContain("programme_charger");
  expect(text).toContain("verifier_perimetre");
  // La consigne « en entier » est ce qui empêche un travail sur extrait, où
  // les mentions limitatives se perdent.
  expect(text).toContain("en entier");
});

test("instructions : plusieurs programmes s'appliquent TOUS, au plus strict", () => {
  // Cas courant : un professeur de seconde année qui veut aussi les limites de
  // la première, ou un polycopié commun à deux filières.
  const text = buildAgentInstructions(ROOT, {
    programmes: [{ filiere: "MP" }, { filiere: "PSI" }],
  });
  expect(text).toContain("s'appliquent TOUS");
  expect(text).toContain("la plus stricte");
});

test("instructions : aucune sélection → aucune mention d'un programme", () => {
  // Ne jamais désigner un document inexistant : sans sélection, la section
  // disparaît entièrement, et l'assistant travaille sans contrainte — état
  // normal, pas panne.
  const text = buildAgentInstructions(ROOT);
  expect(text).not.toContain("Programmes officiels");
  expect(text).not.toContain("programme_charger");
});

test("instructions : une entrée sans filière est ignorée", () => {
  const text = buildAgentInstructions(ROOT, { programmes: [{ filiere: "" }] });
  expect(text).not.toContain("Programmes officiels");
});

test("la config injecte la commande /ajouter (aucun dossier .opencode/ requis)", () => {
  const cfg = buildAgentConfig("/appdata/agent-instructions.md") as any;
  expect(cfg.command.ajouter.template).toContain("$1");
  expect(cfg.command.ajouter.template).toContain("programme_charger");
  // Repli explicite quand rien ne correspond — sinon l'agent invente.
  expect(cfg.command.ajouter.template).toContain("programme_lister");
});

test("la config INTERDIT l'accès texte à data.db (règle, pas supplique)", () => {
  const cfg = buildAgentConfig("/appdata/agent-instructions.md") as any;
  // Lecture ET écriture : ouvrir un fichier SQLite avec un outil texte le
  // corrompt, quel que soit le sens.
  for (const clef of ["read", "edit"] as const) {
    expect(cfg.permission[clef][".azprose/data.db"]).toBe("deny");
    expect(cfg.permission[clef]["**/.azprose/data.db"]).toBe("deny");
  }
});

test("l'env porte OPENCODE_CONFIG_CONTENT en JSON valide", () => {
  const env = buildAgentEnv("/appdata/agent-instructions.md");
  const parsed = JSON.parse(env.OPENCODE_CONFIG_CONTENT);
  expect(parsed.instructions).toEqual(["/appdata/agent-instructions.md"]);
});

test("extractToolDiff lit le bloc content type=diff (forme phase 0c)", () => {
  const params = {
    toolCall: {
      toolCallId: "call_1",
      content: [{ type: "diff", path: "/vault/suites.md", oldText: "# Suites", newText: "# Suites\nExercice BENALI" }],
      rawInput: { diff: "Index: /vault/suites.md\n@@ -1 +1,2 @@\n" },
    },
  };
  const diff = extractToolDiff(params);
  expect(diff?.path).toBe("/vault/suites.md");
  expect(diff?.newText).toContain("BENALI");
  expect(diff?.unified).toContain("Index:");
});

test("extractToolDiff fonctionne aussi sur la forme tool_call_update (content au premier niveau)", () => {
  const diff = extractToolDiff({
    content: [{ type: "diff", path: "/vault/notes/el-moujahid.md", oldText: "", newText: "nouveau" }],
  });
  expect(diff?.path).toBe("/vault/notes/el-moujahid.md");
});

test("extractToolDiff : pas de diff → undefined, jamais d'erreur", () => {
  expect(extractToolDiff({ toolCall: { content: [{ type: "content" }] } })).toBeUndefined();
  expect(extractToolDiff(undefined)).toBeUndefined();
  expect(extractToolDiff(null)).toBeUndefined();
});

describe("noms d'outils exposés au modèle", () => {
  // Le serveur MCP est déclaré sous le nom « azprose » : OpenCode préfixe
  // CHAQUE outil. Nommer un outil sans son préfixe dans les instructions le
  // rend introuvable, et le modèle improvise — observé en usage, il émettait
  // des `<tool_call>` en texte brut, rejetés en « Invalid Tool ».
  const OUTILS = [
    "vault_preambule_math",
    "vault_callouts",
    "vault_donnees_description",
    "base_interroger",
    "programme_lister",
    "programme_charger",
    "verifier_perimetre",
  ];

  test("les instructions ne nomment aucun outil sans le préfixe du serveur", () => {
    const txt = buildAgentInstructions("/vault", {
      programmes: [{ filiere: "MPSI", matiere: "mathematiques", niveau: "1" }],
    });
    for (const o of OUTILS) {
      const sansPrefixe = new RegExp(String.raw`(?<![\w_])${o}(?![\w_])`);
      expect({ outil: o, trouve: sansPrefixe.test(txt) }).toEqual({ outil: o, trouve: false });
    }
  });

  test("la commande /ajouter nomme l'outil tel qu'il est exposé", () => {
    const cfg = buildAgentConfig("/tmp/instructions.md") as {
      command: { ajouter: { template: string } };
    };
    expect(cfg.command.ajouter.template).toContain("azprose_programme_charger");
    expect(cfg.command.ajouter.template).toContain("azprose_programme_lister");
  });

  test("la commande /ajouter passe par l'identifiant, pas par le texte saisi", () => {
    // La matière accentuée tapée par l'utilisateur arrivait telle quelle dans
    // les arguments JSON de l'appel d'outil, et une filière seule désigne
    // plusieurs programmes : le gabarit impose donc de lister puis de charger
    // par `id`.
    const t = (buildAgentConfig("/tmp/i.md") as { command: { ajouter: { template: string } } })
      .command.ajouter.template;
    expect(t).toMatch(/`id`/);
    expect(t.indexOf("azprose_programme_lister")).toBeLessThan(t.indexOf("azprose_programme_charger"));
  });
});

describe("vocabulaire des matières", () => {
  const CODES = ["math", "phys", "chim", "info", "scii"];

  test("la commande /ajouter énumère les codes acceptés", () => {
    const t = (buildAgentConfig("/tmp/i.md") as { command: { ajouter: { template: string } } })
      .command.ajouter.template;
    for (const c of CODES) expect(t).toContain(c);
    // Le contrat est FERMÉ : le gabarit doit le dire, sinon le modèle
    // improvise avec ce que l'utilisateur a tapé.
    expect(t).toMatch(/EXACTEMENT|exactement/);
  });

  test("les instructions demandent de PROPOSER la correction, pas de deviner", () => {
    const txt = buildAgentInstructions("/vault", {
      programmes: [{ filiere: "MPSI", matiere: "mathematiques", niveau: "1" }],
    });
    for (const c of CODES) expect(txt).toContain(c);
    expect(txt).toMatch(/propose-la à l'utilisateur/i);
  });
});
