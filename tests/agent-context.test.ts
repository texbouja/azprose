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
  expect(text).toContain("programme_chercher");
  expect(text).toContain("verifier_perimetre");
});

test("instructions : la doctrine est la récupération, plus le chargement intégral", () => {
  // Renversement du 2026-08-19. « Un programme se lit en entier » faisait
  // charger 94 Ko pour une question qui n'en traitait qu'un point — et un
  // résultat d'outil est renvoyé au modèle à CHAQUE tour.
  const text = buildAgentInstructions(ROOT, { programmes: [{ filiere: "MPSI" }] });
  expect(text).not.toContain("en entier");
  expect(text).toContain("cherche la section");
  // Le document complet reste possible, mais sur demande de l'utilisateur.
  expect(text).toContain("azprose_programme_charger");
  expect(text).toMatch(/seulement.*l'utilisateur le demande/s);
});

test("instructions : les contraintes voyagent avec la section, jamais seules", () => {
  // Objection de l'utilisateur : une liste d'interdits portant sur des items
  // invisibles ne s'interprète pas. « Hors programme : la définition des
  // exceptions » ne veut rien dire sans l'item qu'elle restreint.
  const text = buildAgentInstructions(ROOT, { programmes: [{ filiere: "MPSI" }] });
  expect(text).toContain("englobent");
  expect(text).toMatch(/s'interprète pas sans/);
});

test("instructions : le périmètre est ce que les sections énumèrent", () => {
  // Constaté en usage (2026-08-19) : interrogé sur la réduction matricielle,
  // le modèle a exposé la réduction de Jordan, absente du programme MP. Lire
  // les contraintes ne suffit pas — une notion jamais mentionnée n'est
  // interdite par aucune contrainte. Il faut dire de ne pas sortir du lu.
  const text = buildAgentInstructions(ROOT, { programmes: [{ filiere: "MP" }] });
  expect(text).toMatch(/n'ajoute pas une notion/);
  expect(text).toMatch(/pas au programme de cette classe/);
});

test("instructions : la recherche s'appelle avec le seul champ requete", () => {
  // Deux appels rejetés en usage (« JSON parsing failed ») : sur six
  // paramètres, le modèle produisait `"matiere": {}`. Le schéma a été réduit à
  // trois champs ; les instructions montrent en plus l'appel exact attendu,
  // parce qu'un exemple vaut mieux qu'une consigne.
  const text = buildAgentInstructions(ROOT, { programmes: [{ filiere: "MP" }] });
  expect(text).toMatch(/N'envoie que le champ/);
  expect(text).toContain('{"requete": "theoreme convergence dominee"}');
  expect(text).toMatch(/sans accent/);
});

test("instructions : la recherche est bornée aux programmes retenus", () => {
  // Le réglage doit gouverner ce que l'assistant consulte : sans cette borne,
  // une question de mathématiques rendait une section de chimie.
  const text = buildAgentInstructions(ROOT, { programmes: [{ filiere: "MP" }] });
  expect(text).toMatch(/bornée aux programmes retenus/);
  expect(text).toMatch(/azprose_programme_lister/);
});

test("instructions : les adresses de section ne se devinent pas", () => {
  // Les documents portent leur propre numérotation, irrégulière d'une matière
  // à l'autre (4.4.2. en chimie, B2. en SI, a) en maths) : l'adresse des
  // outils est positionnelle et vient d'eux.
  const text = buildAgentInstructions(ROOT, { programmes: [{ filiere: "MPSI" }] });
  expect(text).toContain("azprose_programme_section");
  expect(text).toMatch(/ne se devinent pas/);
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

test("la config ne déclare plus aucune commande de contextualisation", () => {
  // `/ajouter` obligeait l'utilisateur à retenir une syntaxe (filière, code de
  // matière) pour un travail que le modèle fait mieux à partir de la question,
  // et chargeait le programme entier. Le comportement a remplacé la commande.
  const cfg = buildAgentConfig("/appdata/agent-instructions.md") as { command?: Record<string, unknown> };
  expect(cfg.command?.ajouter).toBeUndefined();
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
    "programme_chercher",
    "programme_plan",
    "programme_section",
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

  test("la recherche est nommée avant les outils de repli", () => {
    // L'ordre du texte porte la doctrine : la recherche est la porte d'entrée,
    // le plan et le chargement intégral sont des recours.
    const txt = buildAgentInstructions("/vault", { programmes: [{ filiere: "MPSI" }] });
    expect(txt.indexOf("azprose_programme_chercher")).toBeLessThan(txt.indexOf("azprose_programme_plan"));
    expect(txt.indexOf("azprose_programme_chercher")).toBeLessThan(txt.indexOf("azprose_programme_charger"));
  });
});

describe("vocabulaire des matières", () => {
  const CODES = ["math", "phys", "chim", "info", "scii"];

  test("les instructions énumèrent les codes acceptés et disent le contrat fermé", () => {
    // Le vocabulaire vivait dans le gabarit de `/ajouter` ; la commande étant
    // supprimée, c'est aux instructions de le porter — sinon le modèle
    // improvise avec ce que l'utilisateur a tapé.
    const txt = buildAgentInstructions("/vault", { programmes: [{ filiere: "MPSI" }] });
    for (const c of CODES) expect(txt).toContain(c);
    expect(txt).toMatch(/EXACTEMENT|exactement/i);
  });

  test("les instructions demandent de PROPOSER la correction, pas de deviner", () => {
    const txt = buildAgentInstructions("/vault", {
      programmes: [{ filiere: "MPSI", matiere: "mathematiques", niveau: "1" }],
    });
    for (const c of CODES) expect(txt).toContain(c);
    expect(txt).toMatch(/propose-la à l'utilisateur/i);
  });
});
