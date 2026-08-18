import { describe, expect, test } from "bun:test";
import {
  contientMaths, MERMAID_MATH_NOTICE, neutraliserMaths, renderMermaidPlaceholder,
} from "@/markdown/mermaid-fence";
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

  test("une source contenant $$ porte la mention « pas de maths »", () => {
    const html = renderMermaidPlaceholder('flowchart TD\n  A["$$x^2$$"] --> B');
    expect(html).toContain("mdv-mermaid__notice");
    expect(html).toContain(MERMAID_MATH_NOTICE.slice(0, 30));
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
