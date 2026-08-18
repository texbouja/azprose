import { describe, expect, test } from "bun:test";
import {
  avertirMaths, contientMaths, MERMAID_MATH_NOTICE, neutraliserMaths, renderMermaidPlaceholder,
} from "@/markdown/mermaid-fence";
import {
  estFlowchart, indexDuJeton, jetonFormule, listerFormules, poserJetons,
  remplissagePour, substituerFormules,
} from "@/markdown/mermaid-math";
import { paletteDepuisStyle, signatureApparence, themeMermaidDepuisScheme } from "@/lib/mermaid-render";

/**
 * Ce qui est testable sans DOM : le porteur de fence et la dérivation de thème.
 * La composition SVG elle-même exige un navigateur (Mermaid mesure du texte) —
 * elle se vérifie dans l'application.
 */
describe("porteur de diagramme mermaid", () => {
  test("porte la source en attribut — c'est la clé de cache", () => {
    const html = renderMermaidPlaceholder("flowchart TD\n  A --> B");
    expect(html).toContain('class="mdv-mermaid"');
    expect(html).toContain("data-mermaid-source=");
  });

  test("la source reste lisible tant que la composition n'a pas eu lieu", () => {
    const html = renderMermaidPlaceholder("flowchart TD\n  A --> B");
    expect(html).toContain("mdv-mermaid__source");
    expect(html).toContain("flowchart TD");
  });

  test("la mention n'apparaît que là où le pont MathJax ne va pas", () => {
    // Depuis le pont, un organigramme compose ses formules avec le préambule :
    // la mention ne concerne plus que les types de diagrammes non couverts.
    const sequence = renderMermaidPlaceholder("sequenceDiagram\n  A->>B: $$x^2$$");
    expect(sequence).toContain("mdv-mermaid__notice");
    expect(sequence).toContain(MERMAID_MATH_NOTICE.slice(0, 30));

    const flowchart = renderMermaidPlaceholder('flowchart TD\n  A["$$x^2$$"] --> B');
    expect(flowchart).not.toContain("mdv-mermaid__notice");
  });

  test("sans $$, aucune mention parasite", () => {
    const html = renderMermaidPlaceholder("flowchart TD\n  A --> B");
    expect(html).not.toContain("mdv-mermaid__notice");
  });

  test("la source est échappée — un fence ne peut pas injecter de HTML", () => {
    const html = renderMermaidPlaceholder('flowchart TD\n  A["<img src=x onerror=alert(1)>"]');
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });

  test("les guillemets de la source ne cassent pas l'attribut", () => {
    const html = renderMermaidPlaceholder('flowchart TD\n  A["El Moujahid"]');
    expect(html).not.toContain('data-mermaid-source="flowchart TD\n  A["');
    expect(html).toContain("&quot;");
  });
});

describe("dérivation du thème mermaid", () => {
  test("suit le color-scheme effectif, pas une liste de thèmes en dur", () => {
    expect(themeMermaidDepuisScheme("dark")).toBe("dark");
    expect(themeMermaidDepuisScheme("light")).toBe("default");
    expect(themeMermaidDepuisScheme("light dark")).toBe("dark");
  });

  test("valeur absente ou inconnue → thème clair (repli sûr)", () => {
    expect(themeMermaidDepuisScheme(null)).toBe("default");
    expect(themeMermaidDepuisScheme(undefined)).toBe("default");
    expect(themeMermaidDepuisScheme("")).toBe("default");
    expect(themeMermaidDepuisScheme("normal")).toBe("default");
  });
});

describe("palette du document", () => {
  /** Faux `CSSStyleDeclaration` : seul `getPropertyValue` est sollicité. */
  const style = (tokens: Record<string, string>) =>
    ({ getPropertyValue: (n: string) => tokens[n] ?? "" }) as unknown as CSSStyleDeclaration;

  const COMPLET = {
    "--bg": "#303446", "--fg": "#c6d0f5", "--muted": "#737994",
    "--border": "#414559", "--accent": "#ca9ee6",
    "--surface": "#292c3c", "--surface-hover": "#51576d",
  };

  test("tokens hexadécimaux → palette exploitable", () => {
    expect(paletteDepuisStyle(style(COMPLET))?.accent).toBe("#ca9ee6");
  });

  test("les espaces des valeurs de tokens sont tolérés", () => {
    const avecEspaces = Object.fromEntries(
      Object.entries(COMPLET).map(([k, v]) => [k, ` ${v} `]),
    );
    expect(paletteDepuisStyle(style(avecEspaces))).not.toBeNull();
  });

  test("un seul token non hexadécimal → aucune palette (repli sur le thème natif)", () => {
    // khroma, le moteur de couleurs de Mermaid, ne sait dériver que de l'hexa :
    // une palette à moitié appliquée serait pire que le thème intégré.
    expect(paletteDepuisStyle(style({ ...COMPLET, "--accent": "rgba(0,0,0,.5)" }))).toBeNull();
    expect(paletteDepuisStyle(style({ ...COMPLET, "--bg": "var(--autre)" }))).toBeNull();
  });

  test("token manquant → aucune palette", () => {
    const { "--muted": _, ...incomplet } = COMPLET;
    expect(paletteDepuisStyle(style(incomplet))).toBeNull();
  });
});

describe("signature d'apparence", () => {
  const base = {
    mode: "dark" as const, fontFamily: "Inter", fontSize: "16px",
    couleurs: null,
  };

  test("deux apparences identiques ont la même signature", () => {
    expect(signatureApparence(base)).toBe(signatureApparence({ ...base }));
  });

  test("un changement de police change la signature (donc invalide le cache)", () => {
    expect(signatureApparence({ ...base, fontFamily: "Georgia" })).not.toBe(signatureApparence(base));
  });

  test("un changement de corps ou de mode change la signature", () => {
    expect(signatureApparence({ ...base, fontSize: "18px" })).not.toBe(signatureApparence(base));
    expect(signatureApparence({ ...base, mode: "default" })).not.toBe(signatureApparence(base));
  });
});

describe("neutralisation des maths dans une source de diagramme", () => {
  test("les délimiteurs partent, le contenu reste tel quel", () => {
    // Mermaid appelle KaTeX dès qu'il voit `$$` : retirer les délimiteurs est
    // le seul moyen de l'en empêcher, aucune option ne le désactive.
    expect(neutraliserMaths('A["$$x^2$$"] --> B')).toBe('A["x^2"] --> B');
  });

  test("plusieurs formules dans une même source", () => {
    expect(neutraliserMaths('A["$$a$$"] --> B["$$b$$"]')).toBe('A["a"] --> B["b"]');
  });

  test("une formule sur plusieurs lignes", () => {
    expect(neutraliserMaths("A[$$\\frac{1}{2}\n+ 3$$]")).toBe("A[\\frac{1}{2}\n+ 3]");
  });

  test("une macro du préambule n'est pas altérée — elle devient du texte", () => {
    expect(neutraliserMaths('A["$$\\R \\abs{x}$$"]')).toBe('A["\\R \\abs{x}"]');
  });

  test("une source sans maths traverse inchangée", () => {
    const src = "flowchart TD\n  A --> B";
    expect(neutraliserMaths(src)).toBe(src);
  });

  test("un $ isolé n'est pas un délimiteur et reste intact", () => {
    expect(neutraliserMaths('A["prix : 12 $"]')).toBe('A["prix : 12 $"]');
  });

  test("la détection reconnaît exactement ce que la neutralisation traite", () => {
    expect(contientMaths('A["$$x$$"]')).toBe(true);
    expect(contientMaths('A["12 $"]')).toBe(false);
    expect(contientMaths("flowchart TD\n A --> B")).toBe(false);
  });
});

describe("pont MathJax — préparation des jetons", () => {
  test("le pont ne vaut que pour les organigrammes", () => {
    expect(estFlowchart("flowchart TD\n A --> B")).toBe(true);
    expect(estFlowchart("graph LR\n A --> B")).toBe(true);
    expect(estFlowchart("sequenceDiagram\n A->>B: x")).toBe(false);
    expect(estFlowchart("stateDiagram-v2\n [*] --> A")).toBe(false);
  });

  test("le type se lit malgré un commentaire ou un front matter en tête", () => {
    expect(estFlowchart("%% un commentaire\nflowchart TD\n A --> B")).toBe(true);
    expect(estFlowchart("---\ntitle: x\n---\nflowchart TD\n A --> B")).toBe(true);
  });

  test("les formules sont extraites dans l'ordre, sans les délimiteurs", () => {
    expect(listerFormules('A["$$x^2$$"] --> B["$$\\R$$"]')).toEqual(["x^2", "\\R"]);
  });

  test("les jetons ne contiennent que lettres et chiffres", () => {
    // Toute ponctuation a un sens dans la grammaire de Mermaid : un jeton qui
    // en contiendrait casserait le diagramme au lieu de le décorer.
    const { source } = poserJetons('A["$$x^2$$"]', [4]);
    const jeton = source.match(/MJX[0-9x]*MJX/)?.[0] ?? "";
    expect(jeton).toMatch(/^[A-Za-z0-9]+$/);
    expect(source).not.toContain("$$");
  });

  test("un jeton se relit et rend son index", () => {
    expect(indexDuJeton(jetonFormule(3, 12))).toBe(3);
    expect(indexDuJeton("MJX")).toBeNull();
    expect(indexDuJeton("A[x]")).toBeNull();
  });

  test("le remplissage approche la largeur visée, jetons fixes déduits", () => {
    // 100 px à 10 px par caractère = 10 caractères, dont 7 déjà pris par
    // « MJX0MJX » : il en reste 3 à ajouter.
    expect(remplissagePour(100, 10, 0)).toBe(3);
    // Une formule minuscule ne doit jamais donner un remplissage négatif.
    expect(remplissagePour(5, 10, 0)).toBe(0);
    // Sans mesure de police exploitable, on ne dimensionne rien.
    expect(remplissagePour(100, 0, 0)).toBe(0);
  });

  test("la substitution remplace chaque jeton par sa formule composée", () => {
    const { source, formules } = poserJetons('A["$$a$$"] --> B["$$b$$"]');
    const svg = `<svg>${source}</svg>`;
    const out = substituerFormules(svg, formules, ["<svg>A</svg>", "<svg>B</svg>"]);
    expect(out).toContain("<svg>A</svg>");
    expect(out).toContain("<svg>B</svg>");
    expect(out).not.toContain("MJX");
  });

  test("une formule dont la composition a échoué garde son jeton", () => {
    // La faire disparaître serait pire : l'auteur ne saurait pas ce qui manque.
    const { source, formules } = poserJetons('A["$$a$$"]');
    const out = substituerFormules(`<svg>${source}</svg>`, formules, [null]);
    expect(out).toContain(formules[0].jeton);
  });
});

describe("mention « pas de maths »", () => {
  test("plus de mention dans un organigramme — le pont s'en charge", () => {
    expect(avertirMaths('flowchart TD\n A["$$x$$"]')).toBe(false);
  });

  test("mention conservée là où le pont ne s'applique pas", () => {
    expect(avertirMaths('sequenceDiagram\n A->>B: $$x$$')).toBe(true);
  });

  test("aucune mention sans maths", () => {
    expect(avertirMaths("flowchart TD\n A --> B")).toBe(false);
    expect(avertirMaths("sequenceDiagram\n A->>B: x")).toBe(false);
  });
});
