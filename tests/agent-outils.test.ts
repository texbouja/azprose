import { describe, expect, test } from "bun:test";
import { cleLibelleOutil, macrosDuPreambule, resumerOutil } from "@/lib/agent/outils";

describe("libellé d'un outil", () => {
  test("nos outils ont un libellé traduit", () => {
    expect(cleLibelleOutil("azprose_programme_chercher")).toBe("agent.tool.progChercher");
    expect(cleLibelleOutil("azprose_vault_preambule_math")).toBe("agent.tool.preambule");
  });

  test("les outils d'OpenCode gardent leur titre natif", () => {
    // Traduire le vocabulaire d'un autre logiciel serait s'engager à le
    // suivre : « read », « bash », « glob » restent tels quels.
    expect(cleLibelleOutil("read")).toBeUndefined();
    expect(cleLibelleOutil("bash")).toBeUndefined();
  });

  test("un outil azprose inconnu ne prétend pas avoir un libellé", () => {
    // Une clé i18n absente afficherait la clé elle-même — pire que le nom brut.
    expect(cleLibelleOutil("azprose_outil_a_venir")).toBeUndefined();
  });
});

describe("résumé d'un résultat", () => {
  // Extrait RÉEL d'une session (tmp/reduc-opencode.txt) : c'est la forme que
  // le panneau reçoit, pas une forme reconstituée.
  const CHERCHER = JSON.stringify({
    trouve: true,
    resultats: [
      {
        chemin: "Réduction des endomorphismes et des matrices carrées › d) Endomorphismes et matrices carrées diagonalisables",
        contexte: null,
        programme: "mathematiques-mp-mpi",
        section: "2.4",
        texte: "### d) Endomorphismes…\n\n- Un endomorphisme…\n",
        contraintes: [
          { genre: "limite", texte: "Dans les exercices pratiques, on se limite à $n = 2$ ou $n = 3$." },
        ],
      },
      { chemin: "Réduction… › i) Polynômes annulateurs", programme: "mathematiques-mp-mpi", section: "2.9", texte: "…", contraintes: [] },
    ],
  });

  test("la recherche rend les adresses en aperçu et les contraintes au corps", () => {
    const r = resumerOutil("azprose_programme_chercher", CHERCHER);
    expect(r.apercu).toBe("§2.4 · §2.9");
    expect(r.corps).toContain("Réduction des endomorphismes");
    expect(r.corps).toContain("limite — Dans les exercices pratiques");
    // Le TEXTE de la section n'est pas repris : il fait des milliers de
    // caractères et c'est la réponse de l'assistant qui en rend compte.
    expect(r.corps).not.toContain("Un endomorphisme…");
  });

  test("un refus porte sa raison, pas son JSON", () => {
    // C'est l'information la plus utile du fil : elle dit pourquoi
    // l'assistant n'a rien obtenu.
    const r = resumerOutil(
      "azprose_programme_chercher",
      JSON.stringify({ trouve: false, raison: "aucun programme retenu ne correspond aux critères." }),
    );
    expect(r.corps).toBe("aucun programme retenu ne correspond aux critères.");
    expect(r.apercu).toBe("✕");
  });

  test("la liste des programmes distingue ceux qui sont retenus", () => {
    // C'est la sélection qui borne la recherche : sans cette marque, une
    // absence de résultat reste inexplicable.
    const r = resumerOutil(
      "azprose_programme_lister",
      JSON.stringify({ programmes: [{ id: "mathematiques-mp-mpi" }, { id: "chim-mpsi" }], retenus: ["mathematiques-mp-mpi"] }),
    );
    expect(r.corps).toContain("◆ mathematiques-mp-mpi");
    expect(r.corps).toContain("◇ chim-mpsi");
  });

  test("le verdict de périmètre tient dans l'aperçu", () => {
    const r = resumerOutil("azprose_verifier_perimetre", JSON.stringify({ statut: "limitrophe", citations: [] }));
    expect(r.apercu).toBe("limitrophe");
  });

  test("le préambule rend ses macros, pas son code", () => {
    const r = resumerOutil("azprose_vault_preambule_math", JSON.stringify({ preambule: "\\def\\R{\\mathbb R}\n\\newcommand\\MN[2][n]{x}\n" }));
    expect(r.corps).toBe("\\R  \\MN");
  });

  test("les outils d'OpenCode gardent leur sortie brute", () => {
    // Le résultat d'un `read` ou d'une requête SQL EST l'information :
    // le résumer la détruirait.
    expect(resumerOutil("read", '{"x":1}')).toEqual({});
    expect(resumerOutil("azprose_base_interroger", '{"lignes":[[1,"a"]]}')).toEqual({});
  });

  test("un corps illisible laisse le brut en place", () => {
    // Mieux vaut du JSON qu'un résumé faux.
    expect(resumerOutil("azprose_programme_chercher", "pas du json")).toEqual({});
    expect(resumerOutil("azprose_programme_chercher", "null")).toEqual({});
  });
});

describe("macros d'un préambule", () => {
  test("reconnaît les quatre formes et ne répète pas", () => {
    const p = "\\def\\R{\\mathbb R}\n\\let\\ds\\displaystyle\n\\newcommand\\GL[2]{x}\n\\def\\R{y}\n";
    expect(macrosDuPreambule(p)).toEqual(["\\R", "\\ds", "\\GL"]);
  });

  test("un préambule vide ne rend rien", () => {
    expect(macrosDuPreambule("")).toEqual([]);
  });
});
