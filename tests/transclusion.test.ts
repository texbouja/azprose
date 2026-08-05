import { describe, expect, test } from "bun:test";

// Le module est testé avec un FAUX fs injecté (DI) — jamais `mock.module`
// (process-global dans bun < 1.4 : il remplacerait `@tauri-apps/plugin-fs`
// pour TOUS les autres fichiers de test du même run).

import {
  resolveTransclusions,
  type TransclusionFs,
} from "../src/markdown/transclusion";

const NOTE = `/vault/note.md`;

/** Faux fs : Map chemin → contenu (readFile rejette si absent, comme Tauri). */
function makeFs(seed: Record<string, string>): TransclusionFs {
  const files = new Map(Object.entries(seed));
  return {
    async readText(path) {
      const raw = files.get(path);
      if (raw === undefined) throw new Error("ENOENT: " + path);
      return raw;
    },
    async exists(path) {
      return files.has(path);
    },
  };
}

const FICHE = `# Fiche\n\n## Partie 01\n\nContenu un.\n\n## Partie 02\n\nContenu deux.\n`;

describe("resolveTransclusions — plusieurs transclusions du MÊME fichier", () => {
  test("même fichier, sections différentes → TOUTES incluses (régression du `resolved` dedup)", async () => {
    const fs = makeFs({ [NOTE]: "", "/vault/fiche.md": FICHE });
    const src = `![[fiche.md#Partie 01]]\n\n![[fiche.md#Partie 02]]\n`;
    const out = await resolveTransclusions(src, NOTE, 0, new Set(), undefined, undefined, fs);
    expect(out).toContain("Contenu un.");
    expect(out).toContain("Contenu deux.");
    expect(out).not.toContain("![[");
  });

  test("même fichier, même section deux fois → les DEUX occurrences incluses", async () => {
    const fs = makeFs({ [NOTE]: "", "/vault/fiche.md": FICHE });
    const src = `![[fiche.md#Partie 01]]\n\n![[fiche.md#Partie 01]]\n`;
    const out = await resolveTransclusions(src, NOTE, 0, new Set(), undefined, undefined, fs);
    expect(out.match(/Contenu un\./g)?.length).toBe(2);
    expect(out).not.toContain("![[");
  });

  test("même fichier complet deux fois → inclus deux fois", async () => {
    const fs = makeFs({ [NOTE]: "", "/vault/fiche.md": FICHE });
    const src = `![[fiche.md]]\n\n![[fiche.md]]\n`;
    const out = await resolveTransclusions(src, NOTE, 0, new Set(), undefined, undefined, fs);
    expect(out.match(/## Partie 01/g)?.length).toBe(2);
    expect(out).not.toContain("![[");
  });

  test("fichiers différents → inclus (ordre source)", async () => {
    const fs = makeFs({
      [NOTE]: "",
      "/vault/fiche.md": FICHE,
      "/vault/other.md": `## Autre\n\nAutre contenu.\n`,
    });
    const src = `![[fiche.md#Partie 01]]\n\n![[other.md#Autre]]\n`;
    const out = await resolveTransclusions(src, NOTE, 0, new Set(), undefined, undefined, fs);
    expect(out).toContain("Contenu un.");
    expect(out).toContain("Autre contenu.");
    expect(out).not.toContain("![[");
  });

  test("ranges : une entrée PAR occurrence, aux bonnes positions", async () => {
    const fs = makeFs({ [NOTE]: "", "/vault/fiche.md": FICHE });
    const src = `![[fiche.md#Partie 01]]\n\n![[fiche.md#Partie 02]]\n`;
    const ranges: Array<{ startLine: number; endLine: number; filePath: string }> = [];
    await resolveTransclusions(src, NOTE, 0, new Set(), undefined, ranges, fs);
    expect(ranges).toHaveLength(2);
    expect(ranges[0].filePath).toBe("/vault/fiche.md");
    expect(ranges[0].startLine).toBe(0);
    expect(ranges[1].startLine).toBeGreaterThan(ranges[0].endLine);
  });

  test("cycle A→B→A : placeholder au lieu d'une boucle infinie", async () => {
    const fs = makeFs({
      "/vault/a.md": `![[b.md]]\n`,
      "/vault/b.md": `![[a.md]]\n`,
      [NOTE]: "",
    });
    const out = await resolveTransclusions(`![[a.md]]`, NOTE, 0, new Set(), undefined, undefined, fs);
    expect(out).toContain("cycle:");
    expect(out).not.toContain("![[");
  });

  test("fichier absent → placeholder visible", async () => {
    const fs = makeFs({ [NOTE]: "" });
    const out = await resolveTransclusions(`![[absent.md]]`, NOTE, 0, new Set(), undefined, undefined, fs);
    expect(out).toContain("transclusion: absent.md not found");
  });

  test("rootPath défini + fichier trouvé en relatif → PAS de repli vault (régression arguments inversés)", async () => {
    // `fileExists(absTarget, fs)` (arguments inversés) faisait toujours `false`
    // → avec rootPath défini, TOUT passait par `getFileIndex` (repli vault),
    // même quand le fichier résolvait directement en relatif (perf : walk du
    // vault complet par transclusion ; exactitude : mauvais fichier si un
    // homonyme existe ailleurs). Ici le fichier existe en relatif : le repli
    // vault (index injecté qui THROW) ne doit JAMAIS être appelé.
    const fs = makeFs({ [NOTE]: "", "/vault/fiche.md": FICHE });
    const out = await resolveTransclusions(
      `![[fiche.md#Partie 01]]`,
      NOTE,
      0,
      new Set(),
      "/vault", // rootPath défini — force la branche fallback si fileExists ment
      undefined,
      fs,
      () => { throw new Error("vault fallback should not run"); },
    );
    expect(out).toContain("Contenu un.");
    expect(out).not.toContain("![[");
  });

  test("fichier PAS trouvé en relatif + rootPath → repli vault par basename (vault fallback fonctionnel)", async () => {
    // Le repli vault est un filet pour les transclusions qui ne résolvent pas
    // en relatif au fichier courant (ex. `![[page]]` vers une note du vault).
    const fs = makeFs({ [NOTE]: "", "/vault/notes/fiche.md": FICHE });
    const index = new Map([["fiche", "/vault/notes/fiche.md"]]);
    const out = await resolveTransclusions(
      `![[fiche.md#Partie 02]]`,
      NOTE, // /vault/note.md → relatif = /vault/fiche.md, absent
      0,
      new Set(),
      "/vault",
      undefined,
      fs,
      () => Promise.resolve(index),
    );
    expect(out).toContain("Contenu deux.");
    expect(out).not.toContain("![[");
  });
});
