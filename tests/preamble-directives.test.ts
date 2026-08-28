import { describe, expect, test } from "bun:test";
import {
  AZ_MEDIA,
  AZ_PALETTES,
  readDocumentClass,
  readDirective,
  supportsAzDirectives,
  setDirective,
} from "@/latex/preamble-directives";

/**
 * Les deux sélecteurs de la barre d'actions .tex écrivent DANS LE FICHIER. Ce
 * qui est vérifié ici : ils trouvent la directive là où elle est, ne touchent
 * à rien d'autre, et ne se laissent pas prendre par une ligne commentée ni par
 * une occurrence dans le corps du document.
 */
const DOC = [
  "\\documentclass[azbloc]{azdoc}",
  "\\azcolors{nord}",
  "\\azgeometry{print}",
  "\\begin{document}",
  "Texte.",
  "\\end{document}",
  "",
].join("\n");

describe("lecture de la directive", () => {
  test("rend la valeur en place", () => {
    expect(readDirective(DOC, "colors")).toBe("nord");
    expect(readDirective(DOC, "geometry")).toBe("print");
  });

  test("rend null quand la directive est absente", () => {
    expect(readDirective("\\documentclass{azdoc}\n", "colors")).toBeNull();
  });

  test("une ligne COMMENTÉE ne compte pas", () => {
    // Sinon le sélecteur afficherait un réglage que la compilation ignore.
    const s = "\\documentclass{azdoc}\n% \\azcolors{gruv}\n";
    expect(readDirective(s, "colors")).toBeNull();
  });

  test("le commentaire de fin de ligne ne masque pas ce qui le précède", () => {
    const s = "\\documentclass{azdoc}\n\\azcolors{fleet} % la palette\n";
    expect(readDirective(s, "colors")).toBe("fleet");
  });

  test("une occurrence dans le CORPS est hors sujet", () => {
    // `\azcolors` cité dans un exemple de code n'est pas un réglage.
    const s = "\\documentclass{azdoc}\n\\begin{document}\n\\azcolors{gruv}\n";
    expect(readDirective(s, "colors")).toBeNull();
  });

  test("l'argument optionnel n'est pas confondu avec la valeur", () => {
    expect(readDirective("\\documentclass{azdoc}\n\\azcolors[dark]{gruv}\n", "colors"))
      .toBe("gruv");
  });
});

describe("écriture de la directive", () => {
  test("remplace la valeur sans toucher au reste", () => {
    const out = setDirective(DOC, "colors", "catppuccin");
    expect(out).toBe(DOC.replace("{nord}", "{catppuccin}"));
  });

  test("l'argument optionnel SURVIT au changement de palette", () => {
    // C'est lui qui porte `dark` : le perdre ferait repasser le document en
    // mode clair sans que personne ne l'ait demandé.
    const s = "\\documentclass{azdoc}\n\\azcolors[dark]{nord}\n";
    expect(setDirective(s, "colors", "fleet"))
      .toBe("\\documentclass{azdoc}\n\\azcolors[dark]{fleet}\n");
  });

  test("valeur déjà en place : la source est rendue TELLE QUELLE", () => {
    // L'appelant s'appuie dessus pour ne pas marquer un fichier propre comme
    // modifié quand on re-choisit le réglage courant.
    expect(setDirective(DOC, "geometry", "print")).toBe(DOC);
  });

  test("directive absente : insérée après \\documentclass", () => {
    const s = "\\documentclass[azbloc]{azdoc}\n\\usepackage{azmath}\n\\begin{document}\n";
    expect(setDirective(s, "colors", "gruv")).toBe(
      "\\documentclass[azbloc]{azdoc}\n\\azcolors{gruv}\n\\usepackage{azmath}\n\\begin{document}\n",
    );
  });

  test("insérée avant tout \\usepackage, jamais après", () => {
    // azcolor doit être chargé avant les paquets qui lisent ses rôles.
    const out = setDirective(
      "\\documentclass{azdoc}\n\\usepackage{azmath}\n",
      "geometry",
      "tablet",
    );
    expect(out.indexOf("\\azgeometry")).toBeLessThan(out.indexOf("\\usepackage"));
  });

  test("sans \\documentclass, la directive va en tête", () => {
    // Cas d'un fragment inclus, qui n'a pas de classe à lui.
    expect(setDirective("\\section{Un}\n", "geometry", "phone"))
      .toBe("\\azgeometry{phone}\n\\section{Un}\n");
  });

  test("une ligne commentée n'est pas modifiée : la directive est AJOUTÉE", () => {
    const s = "\\documentclass{azdoc}\n% \\azcolors{gruv}\n";
    expect(setDirective(s, "colors", "nord")).toBe(
      "\\documentclass{azdoc}\n\\azcolors{nord}\n% \\azcolors{gruv}\n",
    );
  });

  test("la première occurrence active gagne", () => {
    const s = "\\documentclass{azdoc}\n\\azcolors{nord}\n\\azcolors{gruv}\n";
    expect(setDirective(s, "colors", "fleet")).toBe(
      "\\documentclass{azdoc}\n\\azcolors{fleet}\n\\azcolors{gruv}\n",
    );
  });
});

describe("les listes proposées", () => {
  test("les palettes sont celles livrées dans l'arbre texmf", () => {
    expect([...AZ_PALETTES]).toEqual(
      ["default", "nord", "gruv", "forest", "fleet", "catppuccin"],
    );
  });

  test("les médias sont ceux d'azlayout retenus pour la barre", () => {
    expect([...AZ_MEDIA]).toEqual(
      ["print", "2print", "lsprint", "tablet", "lstablet", "phone", "book"],
    );
  });
});

// ── Classe du document : les sélecteurs n'ont de sens que pour le kit ───────
// `\azcolors` et `\azgeometry` n'existent que dans `azdoc` (et bientôt
// `azdev`/`aznote`). Les proposer ailleurs produirait un document qui ne
// compile plus — d'où le grisage, et d'où cette détection.

describe("classe du document", () => {
  test("forme courante, avec ou sans options", () => {
    expect(readDocumentClass("\\documentclass{azdoc}")).toBe("azdoc");
    expect(readDocumentClass("\\documentclass[azbloc]{azdoc}")).toBe("azdoc");
    expect(readDocumentClass("\\documentclass[12pt,a4paper]{article}")).toBe("article");
  });

  test("l'instruction s'étale sur PLUSIEURS LIGNES", () => {
    expect(readDocumentClass("\\documentclass\n  [azbloc]\n  {azdoc}")).toBe("azdoc");
    expect(readDocumentClass("\\documentclass[\n  azbloc,\n  a4paper\n]{azdoc}")).toBe("azdoc");
  });

  test("continuation par « % » en fin de ligne — la coupure TeX habituelle", () => {
    // C'est le cas qu'un simple `\s*` raterait : le `%` avale le saut de ligne.
    expect(readDocumentClass("\\documentclass%\n[azbloc]{azdoc}")).toBe("azdoc");
    expect(readDocumentClass("\\documentclass[azbloc]% choix du moteur\n{azdoc}")).toBe("azdoc");
    expect(readDocumentClass("\\documentclass% pourquoi\n% encore un commentaire\n{azdoc}")).toBe("azdoc");
  });

  test("espaces autour du nom", () => {
    expect(readDocumentClass("\\documentclass{ azdoc }")).toBe("azdoc");
    expect(readDocumentClass("\\documentclass {azdoc}")).toBe("azdoc");
  });

  test("un \\documentclass COMMENTÉ est ignoré", () => {
    expect(readDocumentClass("% \\documentclass{article}\n\\documentclass{azdoc}")).toBe("azdoc");
    expect(readDocumentClass("% \\documentclass{article}\n")).toBeNull();
  });

  test("rien à trouver : fragment inclus, groupe vide, corps du document", () => {
    expect(readDocumentClass("\\section{Titre}\nDu texte.")).toBeNull();
    expect(readDocumentClass("\\documentclass{}")).toBeNull();
    // Après \begin{document}, ce n'est plus une déclaration mais du texte cité.
    expect(readDocumentClass("\\begin{document}\n\\documentclass{azdoc}")).toBeNull();
  });
});

describe("les sélecteurs sont-ils actifs ?", () => {
  test("actifs pour les classes du kit, y compris celles à venir", () => {
    expect(supportsAzDirectives("\\documentclass[azbloc]{azdoc}")).toBe(true);
    expect(supportsAzDirectives("\\documentclass{azdev}")).toBe(true);
    expect(supportsAzDirectives("\\documentclass{aznote}")).toBe(true);
    expect(supportsAzDirectives(DOC)).toBe(true);
  });

  test("grisés partout ailleurs", () => {
    expect(supportsAzDirectives("\\documentclass{article}")).toBe(false);
    expect(supportsAzDirectives("\\documentclass{azsubdoc}")).toBe(false);
    // Fragment inclus : pas de \documentclass du tout.
    expect(supportsAzDirectives("\\section{Réduction}")).toBe(false);
    expect(supportsAzDirectives("")).toBe(false);
  });

  test("un nom qui COMMENCE par une classe du kit ne compte pas", () => {
    // `azdocx` n'est pas `azdoc` : l'appartenance est exacte, pas un préfixe.
    expect(supportsAzDirectives("\\documentclass{azdocx}")).toBe(false);
  });
});
