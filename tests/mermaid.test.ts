import { describe, expect, test } from "bun:test";
import { renderMermaidPlaceholder, MERMAID_MATH_NOTICE } from "@/markdown/mermaid-fence";
import { themeMermaidDepuisScheme } from "@/lib/mermaid-render";

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
