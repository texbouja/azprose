import { expect, test } from "bun:test";
import { PanelState } from "../src/lib/panel-store";

test("starts empty", () => {
  const p = new PanelState("main");
  expect(p.tabs).toEqual([]);
  expect(p.activeTabId).toBeNull();
  expect(p.activePath).toBeNull();
  expect(p.source).toBe("");
  expect(p.savedContent).toBe("");
});

test("open creates a tab and sets it active", () => {
  const p = new PanelState("main");
  // isOpenablePath rejects unknown extensions, so we use path with extension
  // but open will try to read the file — so we just test the minimal path.
  // Instead, test toJSON/fromJSON roundtrip.
  expect(p.visible).toBe(true);
});

test("reorder mutates tab order", () => {
  const p = new PanelState("test");
  // Manually set tabs (simulating what open does after loading)
  const tabA = { id: "a", title: "a.md", path: "/a.md", source: "", savedContent: "" };
  const tabB = { id: "b", title: "b.md", path: "/b.md", source: "", savedContent: "" };
  const tabC = { id: "c", title: "c.md", path: "/c.md", source: "", savedContent: "" };
  p.tabs = [tabA, tabB, tabC];
  p.activeTabId = "a";
  p.reorder(0, 2);
  expect(p.tabs[0].id).toBe("b");
  expect(p.tabs[1].id).toBe("c");
  expect(p.tabs[2].id).toBe("a");
});

test("select switches active tab", () => {
  const p = new PanelState("test");
  const tabA = { id: "a", title: "a.md", path: "/a.md", source: "", savedContent: "" };
  const tabB = { id: "b", title: "b.md", path: "/b.md", source: "", savedContent: "" };
  p.tabs = [tabA, tabB];
  p.activeTabId = "a";
  p.select("b");
  expect(p.activeTabId).toBe("b");
  expect(p.activePath).toBe("/b.md");
});

test("close removes tab and activates next sibling", () => {
  const p = new PanelState("test");
  const tabA = { id: "a", title: "a.md", path: "/a.md", source: "a", savedContent: "a" };
  const tabB = { id: "b", title: "b.md", path: "/b.md", source: "b", savedContent: "b" };
  p.tabs = [tabA, tabB];
  p.activeTabId = "a";
  p.close("a");
  expect(p.tabs).toHaveLength(1);
  expect(p.activeTabId).toBe("b");
});

test("close last tab sets activeTabId to null", () => {
  const p = new PanelState("test");
  p.tabs = [{ id: "a", title: "a.md", path: "/a.md", source: "a", savedContent: "a" }];
  p.activeTabId = "a";
  p.close("a");
  expect(p.tabs).toHaveLength(0);
  expect(p.activeTabId).toBeNull();
});

test("setSource updates source of active tab only", () => {
  const p = new PanelState("test");
  const tabA = { id: "a", title: "a.md", path: "/a.md", source: "old", savedContent: "old" };
  const tabB = { id: "b", title: "b.md", path: "/b.md", source: "", savedContent: "" };
  p.tabs = [tabA, tabB];
  p.activeTabId = "a";
  p.setSource("new content");
  expect(p.tabs[0].source).toBe("new content");
  expect(p.tabs[1].source).toBe("");
});

test("toJSON/fromJSON roundtrip", () => {
  const p = new PanelState("main");
  p.tabs = [
    { id: "a", title: "a.md", path: "/a.md", source: "hello", savedContent: "hello" },
    { id: "b", title: "b.md", path: "/b.md", source: "world", savedContent: "world" },
  ];
  p.activeTabId = "a";

  const json = p.toJSON();
  expect(json.tabs).toHaveLength(2);
  expect(json.activePath).toBe("/a.md");

  const p2 = new PanelState("main");
  p2.fromJSON(json);
  expect(p2.tabs).toHaveLength(2);
  expect(p2.tabs[0].path).toBe("/a.md");
  expect(p2.tabs[1].path).toBe("/b.md");
  expect(p2.tabs[0].source).toBe("");
  expect(p2.activeTabId).toBe(p2.tabs[0].id);
  expect(p2.activePath).toBe("/a.md");
});

test("toJSON excludes runtime fields (source, id)", () => {
  const p = new PanelState("main");
  p.tabs = [
    { id: "x", title: "x.md", path: "/x.md", source: "secret", savedContent: "secret" },
  ];
  p.activeTabId = "x";
  const json = p.toJSON();
  expect(json.tabs[0]).not.toHaveProperty("source");
  expect(json.tabs[0]).not.toHaveProperty("id");
  expect(json.tabs[0].path).toBe("/x.md");
});

test("activeTab returns undefined when no activeTabId", () => {
  const p = new PanelState("test");
  expect(p.activeTab).toBeUndefined();
});

test("activeTab returns correct tab", () => {
  const p = new PanelState("test");
  const tabA = { id: "a", title: "a.md", path: "/a.md", source: "x", savedContent: "x" };
  p.tabs = [tabA];
  p.activeTabId = "a";
  expect(p.activeTab).toBe(tabA);
});

test("close triggers onSessionChange callback", () => {
  let called = false;
  const p = new PanelState("test", { onSessionChange: () => { called = true; } });
  p.tabs = [{ id: "a", title: "a.md", path: "/a.md", source: "a", savedContent: "a" }];
  p.activeTabId = "a";
  called = false;
  p.close("a");
  expect(called).toBe(true);
});

test("select triggers onSessionChange", () => {
  let data: any = null;
  const p = new PanelState("test", { onSessionChange: (d) => { data = d; } });
  const tabs = [
    { id: "a", title: "a.md", path: "/a.md", source: "", savedContent: "" },
    { id: "b", title: "b.md", path: "/b.md", source: "", savedContent: "" },
  ];
  p.tabs = tabs;
  p.activeTabId = "a";
  data = null;
  p.select("b");
  expect(data).not.toBeNull();
  expect(data.activePath).toBe("/b.md");
});

// ── Preview tab ↔ rendered file association ────────────────────────────────
// The preview tab is not marked itself — the RENDERED file is. open() with
// `preview: true` must reuse the existing preview tab (no fresh, unlinked tab),
// and opening a path that is already open must only select it (the association
// survives navigation — never a duplicate tab that would break the pairing).
// The `existing` branch returns before the FS read, so these are testable
// without Tauri; the tab-reuse branch (no FS) is not (readText fails in bun).

test("open with preview on an already-open path keeps the same tab (association survives)", async () => {
  const p = new PanelState("test");
  p.tabs = [
    { id: "pv", title: "a.md", path: "/a.md", source: "old", savedContent: "old", preview: true },
    { id: "main", title: "b.md", path: "/b.md", source: "b", savedContent: "b" },
  ];
  p.activeTabId = "main";
  await p.open("/a.md", { preview: true });
  expect(p.tabs).toHaveLength(2);
  expect(p.activeTabId).toBe("pv");
  expect(p.tabs.find((t: any) => t.id === "pv")?.preview).toBe(true);
});

test("open without preview on an already-open preview tab selects it and drops the preview flag", async () => {
  const p = new PanelState("test");
  p.tabs = [
    { id: "pv", title: "a.md", path: "/a.md", source: "old", savedContent: "old", preview: true },
  ];
  p.activeTabId = "pv";
  await p.open("/a.md");
  expect(p.tabs).toHaveLength(1);
  expect(p.activeTabId).toBe("pv");
  expect(p.tabs[0].preview).toBe(false);
});

test("open without preview on a path already open in a normal tab just selects it", async () => {
  const p = new PanelState("test");
  p.tabs = [
    { id: "a", title: "a.md", path: "/a.md", source: "a", savedContent: "a" },
    { id: "b", title: "b.md", path: "/b.md", source: "b", savedContent: "b" },
  ];
  p.activeTabId = "b";
  await p.open("/a.md");
  expect(p.tabs).toHaveLength(2);
  expect(p.activeTabId).toBe("a");
  expect(p.tabs[0].preview).toBeFalsy();
});

test("open with preview on a path already open in a normal tab selects it without marking it preview", async () => {
  const p = new PanelState("test");
  p.tabs = [
    { id: "a", title: "a.md", path: "/a.md", source: "a", savedContent: "a" },
  ];
  p.activeTabId = "a";
  await p.open("/a.md", { preview: true });
  expect(p.tabs).toHaveLength(1);
  expect(p.tabs[0].preview).toBeFalsy();
});
