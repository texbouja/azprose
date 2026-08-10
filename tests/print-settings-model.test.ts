/**
 * Tests PUR du modèle de persistance d'impression par type (printing.md §2.4) :
 *   src/printing/core/settings-model.ts — emplacements par type + repli legacy
 *   + merge défensif (`mergeRequest`).
 */
import { describe, expect, it } from "bun:test";
import {
  COLLE_PRINT_STORAGE,
  MD_PRINT_STORAGE,
  mergeRequest,
} from "../src/printing/core/settings-model";
import {
  DEFAULT_PLANCHES_PRINT_REQUEST,
  DEFAULT_PRINT_REQUEST,
} from "../src/lib/print-request";

describe("emplacements par type (printing.md §2.4)", () => {
  it("md : nouveau fichier print/md.json + repli legacy print.json", () => {
    expect(MD_PRINT_STORAGE.file).toBe(".azprose/print/md.json");
    expect(MD_PRINT_STORAGE.legacyFile).toBe(".azprose/print.json");
    expect(MD_PRINT_STORAGE.defaults).toEqual(DEFAULT_PRINT_REQUEST);
  });

  it("colle : nouveau fichier print/colle.json + repli legacy print-planches.json", () => {
    expect(COLLE_PRINT_STORAGE.file).toBe(".azprose/print/colle.json");
    expect(COLLE_PRINT_STORAGE.legacyFile).toBe(".azprose/print-planches.json");
    expect(COLLE_PRINT_STORAGE.defaults).toEqual(DEFAULT_PLANCHES_PRINT_REQUEST);
  });

  it("défauts distincts des deux types (md portrait / colle paysage 2 colonnes)", () => {
    expect(MD_PRINT_STORAGE.defaults.orientation).toBe("portrait");
    expect(COLLE_PRINT_STORAGE.defaults.orientation).toBe("landscape");
    expect(COLLE_PRINT_STORAGE.defaults.columns).toBe(2);
  });
});

describe("mergeRequest (défensif)", () => {
  it("null / non-objet → copie des défauts", () => {
    expect(mergeRequest(null, MD_PRINT_STORAGE.defaults)).toEqual(DEFAULT_PRINT_REQUEST);
    expect(mergeRequest("x" as never, MD_PRINT_STORAGE.defaults)).toEqual(DEFAULT_PRINT_REQUEST);
  });

  it("champs partiels fusionnés sur les défauts", () => {
    const out = mergeRequest({ columns: 3, header: "titre" }, MD_PRINT_STORAGE.defaults);
    expect(out.columns).toBe(3);
    expect(out.header).toBe("titre");
    expect(out.paper).toBe("a4"); // inchangé
    expect(out.margins).toEqual(DEFAULT_PRINT_REQUEST.margins);
  });

  it("marges fusionnées niveau par niveau (pas d'écrasement des autres champs)", () => {
    const out = mergeRequest(
      { margins: { top: 20 } as never },
      MD_PRINT_STORAGE.defaults,
    );
    expect(out.margins.top).toBe(20);
    expect(out.margins.bottom).toBe(DEFAULT_PRINT_REQUEST.margins.bottom);
    expect(out.margins.left).toBe(DEFAULT_PRINT_REQUEST.margins.left);
  });

  it("marges non-objets → défauts (jamais de crash)", () => {
    const out = mergeRequest({ margins: "nope" as never }, MD_PRINT_STORAGE.defaults);
    expect(out.margins).toEqual(DEFAULT_PRINT_REQUEST.margins);
  });

  it("papier custom copié / absent → null", () => {
    const out = mergeRequest(
      { customPaper: { width: 100, height: 200 } } as never,
      MD_PRINT_STORAGE.defaults,
    );
    expect(out.customPaper).toEqual({ width: 100, height: 200 });
    const out2 = mergeRequest({} as never, MD_PRINT_STORAGE.defaults);
    expect(out2.customPaper).toBeNull();
  });

  it("requête legacy de l'ancien print.json relue telle quelle (migration)", () => {
    // Fichier écrit par la version pré-refonte : champs « planches » présents.
    const legacy = { orientation: "landscape", columns: 2, columnGap: 4, margins: { top: 10, bottom: 10, left: 10, right: 10 } };
    const out = mergeRequest(legacy as never, MD_PRINT_STORAGE.defaults);
    expect(out.orientation).toBe("landscape");
    expect(out.columns).toBe(2);
    expect(out.columnGap).toBe(4);
    expect(out.margins).toEqual({ top: 10, bottom: 10, left: 10, right: 10 });
    // Le reste retombe sur les défauts md (template simple, A4…).
    expect(out.template).toBe("simple");
    expect(out.paper).toBe("a4");
  });
});
