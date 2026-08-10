/**
 * Moteur de gabarit du rapport de colle (layout.ts) — module PUR.
 *
 * Contrat testé :
 *  - ORDRE FIXE des 5 zones ; template VIDE → zone masquée ;
 *  - échappement STRICT des variables texte, insertion brute des variables
 *    html ; variable non renseignée (inconnue) → INVISIBLE ("" rendu) ;
 *  - `includeEval`/`includeSalle` coupent les variables (contexte de rendu) ;
 *  - `meta:*` fournissent des `<dt>/<dd>` composés ;
 *  - CSS = REPORT_PAGE_CSS + customCss + fichiers CSS (ordre) ; `includeCss:
 *    false` → sans bloc `<style>` ;
 *  - normalizeReportLayout complète un layout partiel/hérité.
 */
import {
  DEFAULT_REPORT_LAYOUT,
  normalizeReportLayout,
  renderReportLayout,
  renderReportLayoutCss,
  renderReportSlotHtml,
  renderReportZone,
  resolveReportVar,
  REPORT_PAGE_CSS,
  REPORT_VARS,
  buildReportEval,
  buildReportEnonce,
  buildReportMetaRows,
  buildReportProgramme,
  escHtml,
  type ColleReportData,
  type ReportEachContext,
} from "@/printing/colle/layout";

const base: ColleReportData = {
  meta: {
    matiere: "maths",
    eleve: "Ahmed El Moujahid",
    date: "2026-01-07",
    creneau: "09:00-10:00",
    salle: "B12",
    classe: "MPSI 1",
    groupe: "G1",
  },
  programme: "Chapitre 4 : suites",
  bodyHtml: "<p>Exercice 1 : calculer <code>u_5</code>.</p>",
  rubricRows: [
    { label: "Maîtrise du cours", value: 8.5, maxScore: 10 },
    { label: "Clarté", value: 7, maxScore: 10 },
  ],
  note: 15.5,
  noteMax: 20,
  observationsHtml: "<p>Très bon travail.</p>",
  colleur: "M. Boujaida",
};

// ── renderReportZone (substitution + échappement) ───────────────────────────

describe("renderReportZone", () => {
  it("substitue les variables texte ÉCHAPPÉES, insère les variables html brutes", () => {
    const resolve = (name: string) => {
      if (name === "matiere") return { value: "<img x>", raw: false };
      if (name === "corps") return { value: "<div>HTML</div>", raw: true };
      return null;
    };
    expect(renderReportZone("{{matiere}}", resolve)).toBe("&lt;img x&gt;");
    expect(renderReportZone("{{corps}}", resolve)).toBe("<div>HTML</div>");
  });

  it("une variable NON RENSEIGNÉE (inconnue) est INVISIBLE (rien rendu)", () => {
    expect(renderReportZone("a {{inconnu}} b", () => null)).toBe("a  b");
    expect(renderReportZone("{{inconnu}}", () => null)).toBe("");
  });

  it("laisse le texte libre (hors variables) intact", () => {
    const resolve = () => ({ value: "X", raw: false });
    expect(renderReportZone("Bonjour {{matiere}} !", resolve)).toBe("Bonjour X !");
  });
});

// ── renderReportZone : blocs conditionnels {{#if}} / {{#unless}} ────────────

describe("renderReportZone — conditionnelles", () => {
  const res = (name: string) => {
    if (name === "salle") return { value: "B12", raw: false };
    if (name === "vide") return { value: "", raw: false };
    if (name === "espaces") return { value: "   ", raw: false };
    return null;
  };

  it("{{#if var}} insère un séparateur SEULEMENT si la variable est remplie", () => {
    expect(renderReportZone("{{#if salle}} · {{salle}}{{/if}}", res)).toBe(" · B12");
    expect(renderReportZone("{{#if vide}} · {{vide}}{{/if}}", res)).toBe("");
  });

  it("une valeur composée d'espaces est considérée vide", () => {
    expect(renderReportZone("{{#if espaces}}X{{/if}}", res)).toBe("");
  });

  it("{{#unless var}} : le contenu si la variable est vide", () => {
    expect(renderReportZone("{{#unless salle}}Salle inconnue{{/unless}}", res)).toBe("");
    expect(renderReportZone("{{#unless vide}}Salle inconnue{{/unless}}", res)).toBe("Salle inconnue");
  });

  it("imbrication : les blocs internes sont résolus en premier", () => {
    const tmpl = "{{#if salle}}{{#if vide}}A{{/if}}B{{/if}}";
    expect(renderReportZone(tmpl, res)).toBe("B");
  });

  it("condition INCONNUE → traitée comme vide (if: rien/else, unless: contenu)", () => {
    expect(renderReportZone("{{#if salle}}a{{/if}}", res)).toBe("a");
    expect(renderReportZone("{{#if inconnu}}a{{/if}}", res)).toBe("");
    expect(renderReportZone("{{#if inconnu}}a{{else}}b{{/if}}", res)).toBe("b");
    expect(renderReportZone("{{#unless inconnu}}a{{/unless}}", res)).toBe("a");
  });

  it("bloc non fermé → littéral", () => {
    expect(renderReportZone("{{#if salle}}a", res)).toBe("{{#if salle}}a");
  });

  it("le contenu conservé subit la substitution de variables", () => {
    expect(renderReportZone("{{#if salle}}<strong>{{salle}}</strong>{{/if}}", res))
      .toBe("<strong>B12</strong>");
    expect(renderReportZone("{{#if vide}}<strong>{{salle}}</strong>{{/if}}", res)).toBe("");
  });

  it("variables html (raw:true) : le bloc teste la valeur, pas le HTML", () => {
    const raw = (name: string) => name === "metaRow:classe"
      ? { value: "<dt>Classe</dt><dd>MPSI 1</dd>", raw: true }
      : null;
    expect(renderReportZone("{{#if metaRow:classe}}ok{{/if}}", raw)).toBe("ok");
  });
});

// ── renderReportZone : blocs {{#each}} + {{else}} ────────────────────────────

describe("renderReportZone — {{#each}} et {{else}}", () => {
  const res = (name: string) => {
    if (name === "salle") return { value: "B12", raw: false };
    if (name === "vide") return { value: "", raw: false };
    return null;
  };
  const each = (name: string): ReportEachContext | null => {
    if (name === "liste") {
      return {
        items: [
          { resolve: (n) => (n === "v" ? { value: "un", raw: false } : null) },
          { resolve: (n) => (n === "v" ? { value: "deux", raw: false } : null) },
        ],
      };
    }
    if (name === "vide") return { items: [] };
    return null;
  };
  const render = (t: string) => renderReportZone(t, res, each);

  it("{{#each liste}} répète le corps pour chaque item, avec le résolveur de l'item", () => {
    expect(render("{{#each liste}}<{{v}}>{{/each}}")).toBe("<un><deux>");
  });

  it("{{else}} : segment alternatif si l'itération est VIDE (0 item)", () => {
    expect(render("{{#each liste}}<{{v}}>{{else}}aucune{{/each}}")).toBe("<un><deux>");
    expect(render("{{#each vide}}<{{v}}>{{else}}aucune{{/each}}")).toBe("aucune");
  });

  it("{{else}} sur {{#if}} : contenu alternatif si la variable est vide", () => {
    expect(render("{{#if salle}}A{{else}}B{{/if}}")).toBe("A");
    expect(render("{{#if vide}}A{{else}}B{{/if}}")).toBe("B");
    expect(render("{{#if inconnu}}A{{else}}B{{/if}}")).toBe("B");
  });

  it("{{else}} sur {{#unless}} : contenu alternatif si la variable est remplie", () => {
    expect(render("{{#unless salle}}A{{else}}B{{/unless}}")).toBe("B");
    expect(render("{{#unless vide}}A{{else}}B{{/unless}}")).toBe("A");
  });

  it("imbrication mixte : {{#each}} dans {{#if}}, et {{#if}} dans {{#each}} (item)", () => {
    expect(render("{{#if salle}}{{#each liste}}<{{v}}>{{/each}}{{/if}}")).toBe("<un><deux>");
    expect(render("{{#each liste}}{{#if vide}}X{{else}}<{{v}}>{{/if}}{{/each}}"))
      .toBe("<un><deux>");
  });

  it("{{#each}} INCONNU (resolveEach → null) → traité comme itération VIDE", () => {
    expect(render("{{#each inconnu}}x{{/each}}")).toBe("");
    expect(render("{{#each inconnu}}x{{else}}y{{/each}}")).toBe("y");
  });

  it("{{else}} ORPHELIN (hors bloc) → littéral conservé (syntaxe de bloc mal formée)", () => {
    expect(render("a {{else}} b")).toBe("a {{else}} b");
    // Une variable inconnue, elle, est invisible (pas un mot réservé).
    expect(render("a {{inconnu}} b")).toBe("a  b");
  });

  it("les valeurs d'item suivent l'échappement du moteur (texte échappé, raw:true brut)", () => {
    const hostile = (name: string): ReportEachContext | null =>
      name === "liste"
        ? { items: [{ resolve: () => ({ value: "<img x>", raw: false }) }] }
        : null;
    expect(renderReportZone("{{#each liste}}{{v}}{{/each}}", res, hostile))
      .toBe("&lt;img x&gt;");
    const rawEach = (name: string): ReportEachContext | null =>
      name === "liste"
        ? { items: [{ resolve: () => ({ value: "<b>html</b>", raw: true }) }] }
        : null;
    expect(renderReportZone("{{#each liste}}{{v}}{{/each}}", res, rawEach))
      .toBe("<b>html</b>");
  });

  it("sans resolveEach, un {{#each}} est traité comme itération vide (invisible)", () => {
    expect(renderReportZone("{{#each liste}}x{{/each}}", res)).toBe("");
    expect(renderReportZone("{{#each liste}}x{{else}}y{{/each}}", res)).toBe("y");
  });
});

// ── resolveReportVar ────────────────────────────────────────────────────────

describe("resolveReportVar", () => {
  it("résout les variables texte brutes (échappement au remplacement)", () => {
    expect(resolveReportVar("matiere", base)?.value).toBe("maths");
    expect(resolveReportVar("eleve", base)?.value).toBe("Ahmed El Moujahid");
    expect(resolveReportVar("programme", base)?.value).toBe("Chapitre 4 : suites");
    expect(resolveReportVar("note", base)?.value).toBe("15,5");
    expect(resolveReportVar("noteMax", base)?.value).toBe("20");
    expect(resolveReportVar("dateIso", base)?.value).toBe("2026-01-07");
  });

  it("résout les variables html (blocs composés et fragments verbatim)", () => {
    expect(resolveReportVar("blocProg", base)?.raw).toBe(true);
    expect(resolveReportVar("blocProg", base)?.value).toContain("Chapitre 4 : suites");
    expect(resolveReportVar("blocEnonce", base)?.value).toContain("Exercice 1");
    expect(resolveReportVar("bodyHtml", base)?.value).toBe(base.bodyHtml);
    expect(resolveReportVar("blocEval", base)?.value).toContain("15,5");
    expect(resolveReportVar("rubriques", base)?.value).toContain("8,5 / 10");
    expect(resolveReportVar("observations", base)?.value).toContain("Très bon travail.");
  });

  it("meta.<champ> (et l'alias meta:<champ>) donne la valeur BRUTE échappée, dans toutes les zones", () => {
    expect(resolveReportVar("meta.eleve", base)).toEqual({ value: "Ahmed El Moujahid", raw: false });
    expect(resolveReportVar("meta:eleve", base)).toEqual({ value: "Ahmed El Moujahid", raw: false });
    expect(resolveReportVar("meta.matiere", base)?.value).toBe("maths");
    expect(resolveReportVar("meta.classe", base)?.value).toBe("MPSI 1");
    expect(resolveReportVar("meta.groupe", base)?.value).toBe("G1");
    expect(resolveReportVar("meta.creneau", base)?.value).toBe("09:00-10:00");
    expect(resolveReportVar("meta.programme", base)?.value).toBe("Chapitre 4 : suites");
    expect(resolveReportVar("meta.note", base)?.value).toBe("15,5");
    expect(resolveReportVar("meta.noteMax", base)?.value).toBe("20");
    expect(resolveReportVar("meta.dateIso", base)?.value).toBe("2026-01-07");
    expect(resolveReportVar("meta.date", base)?.value).toContain("janv.");
    expect(resolveReportVar("meta.inconnu", base)).toBeNull();
  });

  it("metaRow:<champ> produit une ligne <dt>/<dd> précomposée ('- si valeur absente)", () => {
    const r = resolveReportVar("metaRow:classe", base);
    expect(r?.raw).toBe(true);
    expect(r?.value).toBe("<dt>Classe</dt><dd>MPSI 1</dd>");
    expect(resolveReportVar("metaRow:inconnu", base)).toBeNull();
    expect(resolveReportVar("metaRow:groupe", { ...base, meta: {} })?.value).toBe("");
  });

  it("includeSalle:false vide {{salle}}, {{meta.salle}} ET {{metaRow:salle}}", () => {
    expect(resolveReportVar("salle", base, { includeSalle: false })?.value).toBe("");
    expect(resolveReportVar("salle", base)?.value).toBe("B12");
    expect(resolveReportVar("meta.salle", base, { includeSalle: false })?.value).toBe("");
    expect(resolveReportVar("metaRow:salle", base, { includeSalle: false })?.value).toBe("");
  });

  it("champs génériques du catalogue document (centre, ville, filiere, …)", () => {
    const doc = {
      ...base,
      meta: {
        ...base.meta,
        centre: "Centre Al Khawarizmi",
        ville: "Casablanca",
        filiere: "MPSI",
        session: "2025-2026",
        duree: "2h",
        document: "Polycopié n°4",
        theme: "Suites numériques",
        origine: "Banque CCP",
        auteur: "K. Boujaida",
        email: "k.boujaida@example.ma",
        website: "boujaida.example.ma",
        preauteur: "Pr.",
        type: "colle",
      },
    };
    // `{{champ}}` nu : résolu seulement si la planche porte la clé.
    expect(resolveReportVar("centre", doc)?.value).toBe("Centre Al Khawarizmi");
    expect(resolveReportVar("ville", doc)?.value).toBe("Casablanca");
    expect(resolveReportVar("filiere", doc)?.value).toBe("MPSI");
    expect(resolveReportVar("session", doc)?.value).toBe("2025-2026");
    expect(resolveReportVar("duree", doc)?.value).toBe("2h");
    expect(resolveReportVar("document", doc)?.value).toBe("Polycopié n°4");
    expect(resolveReportVar("theme", doc)?.value).toBe("Suites numériques");
    expect(resolveReportVar("origine", doc)?.value).toBe("Banque CCP");
    expect(resolveReportVar("auteur", doc)?.value).toBe("K. Boujaida");
    expect(resolveReportVar("email", doc)?.value).toBe("k.boujaida@example.ma");
    expect(resolveReportVar("website", doc)?.value).toBe("boujaida.example.ma");
    expect(resolveReportVar("preauteur", doc)?.value).toBe("Pr.");
    expect(resolveReportVar("type", doc)?.value).toBe("colle");
    // clé ABSENTE → inconnue (null), pas « vide ».
    expect(resolveReportVar("centre", base)).toBeNull();
    expect(resolveReportVar("website", base)).toBeNull();
    // meta.<champ> / metaRow:<champ> fonctionnent pour le catalogue aussi.
    expect(resolveReportVar("meta.centre", doc)?.value).toBe("Centre Al Khawarizmi");
    expect(resolveReportVar("metaRow:centre", doc)).toEqual({
      value: "<dt>Centre</dt><dd>Centre Al Khawarizmi</dd>",
      raw: true,
    });
    expect(resolveReportVar("metaRow:ville", doc)?.value).toBe("<dt>Ville</dt><dd>Casablanca</dd>");
    expect(resolveReportVar("metaRow:website", doc)?.value).toBe(
      "<dt>Site web</dt><dd>boujaida.example.ma</dd>",
    );
  });

  it("clés libres hors catalogue et valeurs complexes (tableau joint, objet ignoré)", () => {
    const doc = {
      ...base,
      meta: {
        ...base.meta,
        "couleur tableau": "rouge",
        chapitres: ["suites", "limites"],
        notes: { rub1: 4, rub2: 5 },
      },
    };
    expect(resolveReportVar("couleur tableau", doc)?.value).toBe("rouge");
    expect(resolveReportVar("chapitres", doc)?.value).toBe("suites · limites");
    expect(resolveReportVar("meta.chapitres", doc)?.value).toBe("suites · limites");
    expect(resolveReportVar("notes", doc)?.value).toBe("");
    // clé libre ABSENTE → inconnue.
    expect(resolveReportVar("couleur tableau", base)).toBeNull();
    expect(resolveReportVar("meta.notes", doc)?.value).toBe("");
  });
});

// ── renderReportSlotHtml (zones du gabarit) ─────────────────────────────────

describe("renderReportSlotHtml", () => {
  it("le layout PAR DÉFAUT rend le gabarit historique (parité)", () => {
    const head = renderReportSlotHtml("head", base);
    expect(head).toContain("maths — Ahmed El Moujahid");
    expect(head).toContain("mer. 7 janv.");
    const meta = renderReportSlotHtml("meta", base);
    expect(meta).toContain("MPSI 1");
    expect(meta).toContain("B12");
    expect(meta).toContain("M. Boujaida");
    const corps = renderReportSlotHtml("corps", base);
    expect(corps).toContain("Programme");
    expect(corps).toContain("Exercice 1");
    const evalHtml = renderReportSlotHtml("eval", base);
    expect(evalHtml).toContain("15,5");
    expect(evalHtml).toContain("Observations");
  });

  it("template VIDE → zone masquée ('' et rien rendu)", () => {
    const empty = { template: "", class: "" };
    const layout = {
      titre: empty, sousTitre: empty, metadonnees: empty, corps: empty, evaluation: empty,
      customCss: "", cssFiles: [],
    };
    expect(renderReportSlotHtml("head", base, layout)).toBe("");
    expect(renderReportSlotHtml("meta", base, layout)).toBe("");
    expect(renderReportSlotHtml("corps", base, layout)).toBe("");
    expect(renderReportSlotHtml("eval", base, layout)).toBe("");
  });

  it("includeEval:false → la zone Évaluation est coupée même si le template la mentionne", () => {
    const layout = {
      ...DEFAULT_REPORT_LAYOUT,
      evaluation: { template: "{{blocEval}}", class: "" },
    };
    expect(renderReportSlotHtml("eval", base, layout, { includeEval: false })).toBe("");
  });

  it("la classe supplémentaire de zone est appliquée (head/corps)", () => {
    const layout = {
      ...DEFAULT_REPORT_LAYOUT,
      titre: { template: "{{titre}}", class: "titre-bleu" },
      corps: { template: "{{blocEnonce}}", class: "corps-etroit" },
    };
    expect(renderReportSlotHtml("head", base, layout)).toContain('class="rp-title titre-bleu"');
    expect(renderReportSlotHtml("corps", base, layout)).toContain('class="corps-etroit"');
  });

  it("le programme est une VARIABLE : il peut vivre dans n'importe quelle zone", () => {
    const layout = {
      ...DEFAULT_REPORT_LAYOUT,
      corps: { template: "{{programme}}", class: "" },
    };
    const corps = renderReportSlotHtml("corps", base, layout);
    expect(corps).toContain("Chapitre 4 : suites");
    expect(corps).not.toContain("Exercice 1");
  });

  it("le titre peut être composé des atomes meta ({{meta.eleve}})", () => {
    // Demande utilisateur : « définir le titre comme étant {{meta.eleve}} ».
    const layout = {
      ...DEFAULT_REPORT_LAYOUT,
      titre: { template: "{{meta.eleve}} — {{meta.classe}}", class: "" },
      sousTitre: { template: "{{meta.matiere}} · {{meta.date}}", class: "" },
    };
    const head = renderReportSlotHtml("head", base, layout);
    expect(head).toContain("Ahmed El Moujahid — MPSI 1");
    expect(head).toContain("maths · mer. 7 janv.");
    // La matière reste échappée (texte brut, pas de dt/dd).
    const hostile = { ...base, meta: { ...base.meta, matiere: "<x>" } };
    const t2 = renderReportSlotHtml("head", hostile, { ...layout, titre: { template: "{{meta.matiere}}", class: "" } });
    expect(t2).toContain("&lt;x&gt;");
    expect(t2).not.toContain("<dt>");
  });

  it("{{#each rubriques}} dans une zone itère les lignes de rubrique (e2e, label/value/maxScore)", () => {
    const layout = {
      ...DEFAULT_REPORT_LAYOUT,
      evaluation: {
        template: "{{#each rubriques}}{{label}} : {{value}}/{{maxScore}}\n{{else}}—{{/each}}",
        class: "",
      },
    };
    const html = renderReportSlotHtml("eval", base, layout);
    expect(html).toContain("Maîtrise du cours : 8,5/10");
    expect(html).toContain("Clarté : 7/10");
    expect(html).not.toContain("—");
  });

  it("{{#each rubriques}}{{else}} : itération vide → segment alternatif (aucune note)", () => {
    const layout = {
      ...DEFAULT_REPORT_LAYOUT,
      evaluation: { template: "{{#each rubriques}}X{{else}}—{{/each}}", class: "" },
    };
    const sansNote = { ...base, rubricRows: [], note: null, observationsHtml: "" };
    const html = renderReportSlotHtml("eval", sansNote, layout);
    expect(html).toContain("—");
    expect(html).not.toContain("X");
  });

  it("{{#each rubriques}} est disponible dans TOUTES les zones (agnostique, comme les variables)", () => {
    const layout = {
      ...DEFAULT_REPORT_LAYOUT,
      titre: { template: "{{#each rubriques}}[{{label}}]{{/each}}", class: "" },
    };
    const head = renderReportSlotHtml("head", base, layout);
    expect(head).toContain("[Maîtrise du cours][Clarté]");
  });
});

// ── renderReportLayoutCss ───────────────────────────────────────────────────

describe("renderReportLayoutCss", () => {
  it("= REPORT_PAGE_CSS + customCss + fichiers CSS, dans cet ordre", () => {
    const css = renderReportLayoutCss({
      ...DEFAULT_REPORT_LAYOUT,
      customCss: ".rp-card{border-radius:0;}",
      cssFiles: [{ name: "tete.css", content: ".rp-head{background:#000;}" }],
    });
    expect(css.startsWith(REPORT_PAGE_CSS)).toBe(true);
    expect(css.indexOf("border-radius:0")).toBeGreaterThan(css.indexOf(REPORT_PAGE_CSS));
    expect(css.indexOf("tete.css")).toBeGreaterThan(css.indexOf("border-radius:0"));
    expect(css.indexOf(".rp-head{background:#000;}")).toBeGreaterThan(css.indexOf("tete.css"));
  });

  it("ignore les fichiers CSS vides", () => {
    const css = renderReportLayoutCss({
      ...DEFAULT_REPORT_LAYOUT,
      cssFiles: [{ name: "vide.css", content: "   " }],
    });
    expect(css).toBe(REPORT_PAGE_CSS);
  });
});

// ── renderReportLayout (page complète) ──────────────────────────────────────

describe("renderReportLayout", () => {
  it("compose la page : shell + head + body (meta, corps, eval)", () => {
    const html = renderReportLayout(base);
    expect(html).toContain('<div class="rp">');
    expect(html).toContain('<div class="rp-card">');
    expect(html).toContain('<style>');
    expect(html).toContain("maths — Ahmed El Moujahid");
    expect(html).toContain("Chapitre 4 : suites");
    expect(html).toContain("15,5");
    // Ordre des zones dans le body : meta, corps, eval.
    const bodyIdx = html.indexOf('<div class="rp-body">');
    expect(html.indexOf("MPSI 1")).toBeGreaterThan(bodyIdx);
    expect(html.indexOf("Exercice 1")).toBeGreaterThan(html.indexOf("MPSI 1"));
    expect(html.indexOf("Très bon travail.")).toBeGreaterThan(html.indexOf("Exercice 1"));
  });

  it("includeCss:false → aucun bloc <style> (le document d'impression assemble son head)", () => {
    const html = renderReportLayout(base, DEFAULT_REPORT_LAYOUT, {}, { includeCss: false });
    expect(html).not.toContain("<style>");
  });

  it("includeEval:false → pas de zone évaluation (feuille d'examen / planches PDF)", () => {
    const html = renderReportLayout(base, DEFAULT_REPORT_LAYOUT, { includeEval: false });
    expect(html).not.toContain("15,5");
    expect(html).not.toContain("Observations");
  });

  it("template vide partout → page vide (structure sans contenu)", () => {
    const empty = { template: "", class: "" };
    const html = renderReportLayout(base, {
      titre: empty, sousTitre: empty, metadonnees: empty, corps: empty, evaluation: empty,
      customCss: "", cssFiles: [],
    });
    expect(html).not.toContain("maths");
    expect(html).not.toContain("Exercice 1");
  });
});

// ── normalizeReportLayout ───────────────────────────────────────────────────

describe("normalizeReportLayout", () => {
  it("complète un layout PARTIEL (zones manquantes → défaut) sans casser les zones présentes", () => {
    const norm = normalizeReportLayout({
      corps: { template: "{{blocEnonce}}", class: "x" },
      customCss: ".x{}",
    });
    expect(norm.corps.template).toBe("{{blocEnonce}}");
    expect(norm.corps.class).toBe("x");
    expect(norm.customCss).toBe(".x{}");
    expect(norm.titre.template).toBe(DEFAULT_REPORT_LAYOUT.titre.template);
    expect(norm.evaluation.template).toBe(DEFAULT_REPORT_LAYOUT.evaluation.template);
    expect(Array.isArray(norm.cssFiles)).toBe(true);
  });

  it("layout hérité : une zone sans champ class → '' et cssFiles absent → []", () => {
    const norm = normalizeReportLayout({
      titre: { template: "{{titre}}" } as never,
    });
    expect(norm.titre.class).toBe("");
    expect(norm.cssFiles).toEqual([]);
  });

  it("null/undefined → layout par défaut", () => {
    expect(normalizeReportLayout(null)).toBe(DEFAULT_REPORT_LAYOUT);
    expect(normalizeReportLayout(undefined)).toBe(DEFAULT_REPORT_LAYOUT);
  });
});

// ── Catalogue de variables ──────────────────────────────────────────────────

describe("REPORT_VARS (catalogue)", () => {
  it("couvre toutes les variables résolues par le moteur (noms canoniques)", () => {
    const names = new Set(REPORT_VARS.map((v) => v.name));
    for (const n of ["titre", "matiere", "eleve", "classe", "groupe", "creneau",
      "salle", "sousTitre", "date", "dateIso",
      "metaRow:date", "metaRow:creneau", "metaRow:salle", "metaRow:classe",
      "metaRow:groupe", "metaRow:colleur",
      "programme", "blocProg", "blocEnonce", "bodyHtml", "blocEval", "note", "noteMax",
      "rubriques", "observations", "colleur"]) {
      expect(names.has(n), n).toBe(true);
    }
  });

  it("règle d'or : PAS de préfixe technique dans le catalogue (alias meta.* exclus)", () => {
    for (const v of REPORT_VARS) {
      expect(v.name.startsWith("meta."), v.name).toBe(false);
      expect(v.name.startsWith("meta:"), v.name).toBe(false);
    }
  });

  it("les alias meta.* restent résolus par le moteur (rétro-compat)", () => {
    expect(resolveReportVar("meta.eleve", base)?.value).toBe("Ahmed El Moujahid");
    expect(resolveReportVar("meta:eleve", base)?.value).toBe("Ahmed El Moujahid");
  });

  it("chaque zone a au moins une variable recommandée", () => {
    const zones = new Set(REPORT_VARS.flatMap((v) => v.zones));
    expect(zones.has("titre")).toBe(true);
    expect(zones.has("sousTitre")).toBe(true);
    expect(zones.has("metadonnees")).toBe(true);
    expect(zones.has("corps")).toBe(true);
    expect(zones.has("evaluation")).toBe(true);
  });
});

// ── Builders rétro-compat (les blocs composés du catalogue) ─────────────────

describe("builders rétro-compat", () => {
  it("buildReportProgramme : '' si absent, sinon label + contenu échappé", () => {
    expect(buildReportProgramme("  ")).toBe("");
    expect(buildReportProgramme("<b>x</b>")).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("buildReportEnonce : '' si absent, sinon titre + boîte verbatim", () => {
    expect(buildReportEnonce("   ")).toBe("");
    const e = buildReportEnonce("<mjx-container>m</mjx-container>");
    expect(e).toContain("Énoncé");
    expect(e).toContain("<mjx-container>m</mjx-container>");
  });

  it("buildReportMetaRows : includeSalle=false omet la Salle", () => {
    const avec = buildReportMetaRows(base.meta, base.colleur);
    expect(avec).toContain("B12");
    const sans = buildReportMetaRows(base.meta, base.colleur, false);
    expect(sans).not.toContain("B12");
    expect(sans).toContain("MPSI 1");
  });

  it("buildReportEval : note + rubriques + observations, omis si rien", () => {
    const e = buildReportEval(15.5, 20, base.rubricRows, base.observationsHtml);
    expect(e).toContain("15,5");
    expect(e).toContain("8,5 / 10");
    expect(e).toContain("Très bon travail.");
    expect(buildReportEval(null, 20, [], "")).toBe("");
  });
});
