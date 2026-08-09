import { describe, expect, it, vi } from "bun:test";
import { DataBus, createOrigin } from "@/lib/data/bus";
import { anyOf, ofType } from "@/lib/data/events";
import {
  runCommand,
  openGrid,
  openGridStack,
  type CommandDeps,
} from "@/lib/data/commands";
import { SqliteGridProvider } from "@/lib/data/providers";

// ── DataBus ─────────────────────────────────────────────────────────────────

describe("DataBus", () => {
  it("delivers only matching events (ofType matcher)", () => {
    const bus = new DataBus();
    const seen: string[] = [];
    bus.subscribe(ofType("cells-changed"), (ev) => seen.push(ev.spreadsheetId));
    bus.emit({ type: "cells-changed", spreadsheetId: "s1", origin: "a" });
    bus.emit({ type: "grid-config-changed", gridId: "g1", origin: "a" });
    expect(seen).toEqual(["s1"]);
  });

  it("skips self events via skipOrigin", () => {
    const bus = new DataBus();
    const origin = createOrigin("test");
    const seen: string[] = [];
    bus.subscribe(
      ofType("cells-changed"),
      (ev) => seen.push(ev.spreadsheetId),
      { skipOrigin: origin },
    );
    bus.emit({ type: "cells-changed", spreadsheetId: "s1", origin });
    bus.emit({ type: "cells-changed", spreadsheetId: "s1", origin: "other" });
    expect(seen).toEqual(["s1"]);
  });

  it("unsubscribes cleanly", () => {
    const bus = new DataBus();
    let n = 0;
    const sub = bus.subscribe(ofType("cells-changed"), () => n++);
    bus.emit({ type: "cells-changed", spreadsheetId: "s1", origin: "a" });
    sub.unsubscribe();
    bus.emit({ type: "cells-changed", spreadsheetId: "s1", origin: "a" });
    expect(n).toBe(1);
  });

  it("subscribeCommands receives only commands", () => {
    const bus = new DataBus();
    const cmds: string[] = [];
    bus.subscribeCommands((cmd) => cmds.push(cmd.type));
    bus.emit({ type: "command:open-spreadsheet", spreadsheetId: "s1" });
    bus.emit({ type: "cells-changed", spreadsheetId: "s1", origin: "a" });
    bus.emit({ type: "command:open-grid-stack", spreadsheetIds: ["s1"] });
    expect(cmds).toEqual(["command:open-spreadsheet", "command:open-grid-stack"]);
  });

  it("createOrigin produces distinct identities per call", () => {
    expect(createOrigin("g")).not.toBe(createOrigin("g"));
  });

  it("anyOf unions multiple typed matchers", () => {
    const bus = new DataBus();
    const seen: string[] = [];
    bus.subscribe(
      anyOf(ofType("cells-changed"), ofType("grid-config-changed")),
      (ev) => {
        if (ev.type === "cells-changed" && ev.spreadsheetId !== "s1") return;
        if (ev.type === "grid-config-changed" && ev.gridId !== "g1") return;
        seen.push(ev.type);
      },
    );
    bus.emit({ type: "cells-changed", spreadsheetId: "s1", origin: "a" });
    bus.emit({ type: "cells-changed", spreadsheetId: "s2", origin: "a" });
    bus.emit({ type: "grid-config-changed", gridId: "g1", origin: "a" });
    bus.emit({ type: "grid-config-changed", gridId: "g2", origin: "a" });
    bus.emit({ type: "command:open-spreadsheet", spreadsheetId: "s1" });
    expect(seen).toEqual(["cells-changed", "grid-config-changed"]);
  });

  it("anyOf respects skipOrigin", () => {
    const bus = new DataBus();
    const origin = createOrigin("test");
    let n = 0;
    bus.subscribe(
      anyOf(ofType("cells-changed"), ofType("grid-config-changed")),
      () => n++,
      { skipOrigin: origin },
    );
    bus.emit({ type: "cells-changed", spreadsheetId: "s1", origin });
    bus.emit({ type: "grid-config-changed", gridId: "g1", origin });
    bus.emit({ type: "grid-config-changed", gridId: "g1", origin: "other" });
    expect(n).toBe(1);
  });
});

// ── Commandes (sagas) ───────────────────────────────────────────────────────

function makeDeps(overrides: Partial<CommandDeps> = {}): CommandDeps {
  return {
    nav: {
      openSpreadsheetInSide: vi.fn(),
      openDataFilterInSide: vi.fn(),
      setSpreadsheetTabTitle: vi.fn(),
      setSpreadsheetTabId: vi.fn(),
    },
    domain: {
      findGridForSpreadsheet: vi.fn(async () => null),
      createGridForSpreadsheet: vi.fn(async () => "dg-new"),
      renameGrid: vi.fn(async () => {}),
      getSpreadsheet: vi.fn(async () => null),
    },
    ...overrides,
  };
}

describe("commands — open-grid", () => {
  it("uses the existing linked grid (no create)", async () => {
    const deps = makeDeps();
    deps.domain.findGridForSpreadsheet = vi.fn(async () => ({ id: "dg-1" }));
    await openGrid("s1", "T", deps);
    expect(deps.domain.createGridForSpreadsheet).not.toHaveBeenCalled();
    expect(deps.nav.openDataFilterInSide).toHaveBeenCalledWith(["dg-1"], "T");
  });

  it("creates the grid from the spreadsheet when no link exists", async () => {
    const deps = makeDeps();
    await openGrid("s1", "Notes", deps);
    expect(deps.domain.createGridForSpreadsheet).toHaveBeenCalledWith(
      "dg-s1",
      "Notes",
      "s1",
    );
    expect(deps.nav.openDataFilterInSide).toHaveBeenCalledWith(
      ["dg-new"],
      "Notes",
    );
  });

  it("falls back to generic names", async () => {
    const deps = makeDeps();
    await openGrid("s1", undefined, deps);
    expect(deps.domain.createGridForSpreadsheet).toHaveBeenCalledWith(
      "dg-s1",
      "Tableau",
      "s1",
    );
    expect(deps.nav.openDataFilterInSide).toHaveBeenCalledWith(
      ["dg-new"],
      "Filtre de données",
    );
  });
});

describe("commands — open-grid-stack", () => {
  it("creates one grid per spreadsheet, named after its own sheet", async () => {
    const deps = makeDeps();
    deps.domain.getSpreadsheet = vi.fn(async (id: string) =>
      id === "s1" ? { name: "Élèves" } : { name: "Colloscope — 2A" },
    );
    await openGridStack(
      { type: "command:open-grid-stack", spreadsheetIds: ["s1", "s2"], name: "Colloscope" },
      deps,
    );
    expect(deps.domain.createGridForSpreadsheet).toHaveBeenCalledTimes(2);
    expect(deps.domain.createGridForSpreadsheet).toHaveBeenCalledWith("dg-s1", "Élèves", "s1");
    expect(deps.domain.createGridForSpreadsheet).toHaveBeenCalledWith("dg-s2", "Colloscope — 2A", "s2");
    expect(deps.nav.openDataFilterInSide).toHaveBeenCalledWith(
      ["dg-new", "dg-new"],
      "Colloscope",
    );
  });

  it("renames stale grids (pre-fix pile-name) to the sheet name", async () => {
    const deps = makeDeps();
    deps.domain.findGridForSpreadsheet = vi.fn(async () => ({ id: "dg-1" }));
    deps.domain.getSpreadsheet = vi.fn(async () => ({ name: "Élèves" }));
    await openGridStack(
      { type: "command:open-grid-stack", spreadsheetIds: ["s1"], name: "Colloscope" },
      deps,
    );
    expect(deps.domain.renameGrid).toHaveBeenCalledWith("dg-1", "Élèves");
    expect(deps.domain.createGridForSpreadsheet).not.toHaveBeenCalled();
  });
});

describe("commands — runCommand dispatch", () => {
  it("routes open-spreadsheet to the navigator", async () => {
    const deps = makeDeps();
    await runCommand({ type: "command:open-spreadsheet", spreadsheetId: "s1", name: "Notes" }, deps);
    expect(deps.nav.openSpreadsheetInSide).toHaveBeenCalledWith("s1", "Notes");
  });

  it("routes set-spreadsheet-id and set-tab-title", async () => {
    const deps = makeDeps();
    await runCommand({ type: "command:set-spreadsheet-id", spreadsheetId: "s1", title: "N" }, deps);
    expect(deps.nav.setSpreadsheetTabId).toHaveBeenCalledWith("s1", "N");
    await runCommand({ type: "command:set-tab-title", spreadsheetId: "s1", title: "R" }, deps);
    expect(deps.nav.setSpreadsheetTabTitle).toHaveBeenCalledWith("s1", "R");
  });

  it("open-spreadsheet-new reads the real name", async () => {
    const deps = makeDeps();
    deps.domain.getSpreadsheet = vi.fn(async () => ({ name: "Notes de cours" }));
    await runCommand({ type: "command:open-spreadsheet-new", spreadsheetId: "s1" }, deps);
    expect(deps.nav.openSpreadsheetInSide).toHaveBeenCalledWith("s1", "Notes de cours");
  });

  it("never throws on domain failure (logged)", async () => {
    const deps = makeDeps();
    deps.domain.findGridForSpreadsheet = vi.fn(async () => {
      throw new Error("boom");
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      runCommand({ type: "command:open-grid", spreadsheetId: "s1" }, deps),
    ).resolves.toBeUndefined();
    log.mockRestore();
  });
});

// ── SqliteGridProvider ──────────────────────────────────────────────────────

function makeProvider() {
  const bus = new DataBus();
  const origin = createOrigin("test-grid");
  const saveCells = vi.fn(async () => {});
  const provider = new SqliteGridProvider({ gridId: "g1", origin, bus, saveCells });
  provider.setSourceSpreadsheetId("s1");
  return { bus, origin, saveCells, provider };
}

describe("SqliteGridProvider", () => {
  it("accumulates edits and flushes them via saveCells", async () => {
    const { bus, saveCells, provider, origin } = makeProvider();
    const notified: string[] = [];
    bus.subscribe(ofType("cells-changed"), (ev) => notified.push(ev.spreadsheetId));
    await provider.exec("update-cell", { id: "r0", column: "c1", value: "x" });
    await provider.exec("update-cell", { id: "r1", column: "c2", value: "y" });
    await provider.flushNow();
    expect(saveCells).toHaveBeenCalledTimes(1);
    expect(saveCells).toHaveBeenCalledWith([
      { row_index: 0, col_index: 1, value: "x" },
      { row_index: 1, col_index: 2, value: "y" },
    ]);
    expect(notified).toEqual(["s1"]);
    expect(origin).toBeTruthy();
  });

  it("deduplicates by equality (phantom update-cell)", async () => {
    const { provider, saveCells } = makeProvider();
    await provider.exec("update-cell", { id: "r0", column: "c1", value: "x" });
    await provider.exec("update-cell", { id: "r0", column: "c1", value: "x" });
    await provider.flushNow();
    expect(saveCells).toHaveBeenCalledTimes(1);
    expect(saveCells.mock.calls[0][0]).toHaveLength(1);
  });

  it("normalizes Date values to ISO date", async () => {
    const { provider, saveCells } = makeProvider();
    await provider.exec("update-cell", { id: "r0", column: "c1", value: new Date("2026-01-07T12:00:00Z") });
    await provider.flushNow();
    expect(saveCells.mock.calls[0][0][0].value).toBe("2026-01-07");
  });

  it("ignores out-of-bounds coordinates", async () => {
    const { provider, saveCells } = makeProvider();
    await provider.exec("update-cell", { id: "row", column: "col", value: "x" });
    await provider.flushNow();
    expect(saveCells).not.toHaveBeenCalled();
  });

  it("respects the suppressed window (grid reload)", async () => {
    const { provider, saveCells } = makeProvider();
    provider.setSuppressed(true);
    await provider.exec("update-cell", { id: "r0", column: "c1", value: "x" });
    await provider.flushNow();
    expect(saveCells).not.toHaveBeenCalled();
  });

  it("does not emit cells-changed without a known source", async () => {
    const bus = new DataBus();
    const provider = new SqliteGridProvider({
      gridId: "g1",
      origin: createOrigin("g"),
      bus,
      saveCells: vi.fn(async () => {}),
    });
    const notified: string[] = [];
    bus.subscribe(ofType("cells-changed"), (ev) => notified.push(ev.spreadsheetId));
    await provider.exec("update-cell", { id: "r0", column: "c1", value: "x" });
    await provider.flushNow();
    expect(notified).toEqual([]);
  });

  it("keeps unsaved edits on IPC failure (retry on next flush)", async () => {
    const saveCells = vi
      .fn()
      .mockRejectedValueOnce(new Error("ipc"))
      .mockResolvedValueOnce(undefined);
    const provider = new SqliteGridProvider({
      gridId: "g1",
      origin: createOrigin("g"),
      bus: new DataBus(),
      saveCells,
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await provider.exec("update-cell", { id: "r0", column: "c1", value: "x" });
    await provider.flushNow();
    expect(saveCells).toHaveBeenCalledTimes(1);
    // Le pending n'est pas vidé après un échec → le flush suivant re-joue.
    await provider.flushNow();
    expect(saveCells).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });

  it("stops accepting edits after destroy", async () => {
    const { provider, saveCells } = makeProvider();
    provider.destroy();
    await provider.exec("update-cell", { id: "r0", column: "c1", value: "x" });
    await provider.flushNow();
    expect(saveCells).not.toHaveBeenCalled();
  });

  it("flush debounce fires after 500 ms", async () => {
    const { provider, saveCells } = makeProvider();
    await provider.exec("update-cell", { id: "r0", column: "c1", value: "x" });
    expect(saveCells).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 550));
    expect(saveCells).toHaveBeenCalledTimes(1);
  });
});
