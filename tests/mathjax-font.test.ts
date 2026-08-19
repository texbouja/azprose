import { describe, expect, test } from "bun:test";
import {
  MATHJAX_FONTS,
  MATHJAX_FONT_DEFAUT,
  MATHJAX_FONT_PATH,
  SCRIPT_CDN_SANS_POLICE,
  configNommePolice,
  nomInterne,
  policeValide,
} from "@/lib/mathjax-font";

/**
 * Le chargement du moteur exige un navigateur ; ce qui est testable ici, c'est
 * la partie qui décide : nom de police, repli, et les chemins qui, faux,
 * feraient disparaître les formules sans le dire.
 */
describe("police mathématique — validation", () => {
  test("les deux polices offertes sont acceptées", () => {
    expect(policeValide("newcm")).toBe("newcm");
    expect(policeValide("fira")).toBe("fira");
  });

  test("toute autre valeur retombe sur le défaut", () => {
    // Une valeur venue d'un `.azprose/config.json` écrit à la main, ou d'une
    // version future qui offrirait plus de polices : mieux vaut composer en
    // New Computer Modern que ne rien composer.
    expect(policeValide("stix2")).toBe(MATHJAX_FONT_DEFAUT);
    expect(policeValide(null)).toBe(MATHJAX_FONT_DEFAUT);
    expect(policeValide(undefined)).toBe(MATHJAX_FONT_DEFAUT);
    expect(policeValide(42)).toBe(MATHJAX_FONT_DEFAUT);
  });

  test("le défaut est la police qui n'a besoin d'aucun actif servi", () => {
    // newcm est embarquée en entier dans `tex-svg.js` : c'est ce qui en fait
    // un repli sûr, y compris si les données de Fira manquaient.
    expect(MATHJAX_FONT_DEFAUT).toBe("newcm");
  });
});

describe("noms attendus par MathJax", () => {
  test("le nom interne porte le préfixe du paquet", () => {
    expect(nomInterne("fira")).toBe("mathjax-fira");
    expect(nomInterne("newcm")).toBe("mathjax-newcm");
  });

  test("le catalogue offert reste limité aux deux polices câblées", () => {
    // Ajouter une entrée sans déposer ses données de glyphes dans `public/`
    // ferait disparaître `\mathbb`, `\mathcal` et consorts.
    expect(MATHJAX_FONTS.map((f) => f.id)).toEqual(["newcm", "fira"]);
  });
});

describe("chemins de chargement", () => {
  test("le chemin des glyphes porte le marqueur que MathJax substitue", () => {
    expect(MATHJAX_FONT_PATH).toContain("%%FONT%%");
    // Le marqueur rend `mathjax-fira` : le suffixe reconstitue le nom du
    // paquet, donc le dossier déposé dans `public/`.
    expect(MATHJAX_FONT_PATH.replace("%%FONT%%", nomInterne("fira")))
      .toBe("/mathjax-fonts/mathjax-fira-font");
  });

  test("les documents imprimés chargent la variante sans police", () => {
    // C'est ce qui permet à `output.font` de décider — et ce qui rend cette
    // ligne obligatoire dans toute configuration d'impression.
    expect(SCRIPT_CDN_SANS_POLICE).toContain("tex-svg-nofont.js");
  });
});

describe("détection de la police dans une configuration de document", () => {
  // C'est cette détection qui décide du script chargé : un document dont la
  // configuration ignore les polices recevrait un moteur SANS police, et
  // sortirait vide. Le repli le rattrape.
  test("une configuration de l'application nomme sa police", () => {
    expect(configNommePolice("window.MathJax = { output: { font: 'mathjax-fira' }, };")).toBe(true);
    expect(configNommePolice("output:{font:'mathjax-newcm'}")).toBe(true);
  });

  test("une configuration qui l'ignore est reconnue comme telle", () => {
    expect(configNommePolice("window.MathJax = { startup: { typeset: true } };")).toBe(false);
    expect(configNommePolice("")).toBe(false);
    expect(configNommePolice(undefined)).toBe(false);
  });

  test("`fontCache` n'est pas une police — il ne doit pas tromper la détection", () => {
    expect(configNommePolice("svg: { fontCache: 'global' }")).toBe(false);
  });
});
