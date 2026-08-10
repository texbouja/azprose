import { describe, expect, test } from "bun:test";
import { createNavHistoryTabs } from "@/lib/nav-history-tabs";

describe("nav-history-tabs (per-tab preview history — matrice cas 2)", () => {
  test("unknown tab → no history, no anonymous stack", () => {
    const tabs = createNavHistoryTabs();
    expect(tabs.size()).toBe(0);
    expect(tabs.canGoBack("s1")).toBe(false);
    expect(tabs.canGoForward("s1")).toBe(false);
    expect(tabs.back("s1")).toBeNull();
    expect(tabs.forward("s1")).toBeNull();
    // back() materializes a stack? NO — only push() does (browser-like:
    // a back on an empty history is a no-op)
    expect(tabs.size()).toBe(0);
  });

  test("two tabs keep INDEPENDENT stacks (the essence of case 2)", () => {
    const tabs = createNavHistoryTabs();
    tabs.push("/a.md", "s1");
    tabs.push("/b.md", "s1");
    tabs.push("/x.md", "s2"); // second tab, own stack
    expect(tabs.canGoBack("s1")).toBe(true);
    expect(tabs.canGoBack("s2")).toBe(true); // sa propre pile, pas celle de s1
    // back on s1 pops ITS OWN history, s2 untouched
    expect(tabs.back("s1")).toBe("/b.md");
    expect(tabs.back("s2")).toBe("/x.md");
    expect(tabs.back("s1")).toBe("/a.md");
    expect(tabs.back("s1")).toBeNull();
    expect(tabs.back("s2")).toBeNull(); // s2 avait exactement 1 entrée
    expect(tabs.canGoForward("s2")).toBe(false);
    expect(tabs.size()).toBe(2);
  });

  test("forward stack is per-tab too (back/forward never cross tabs)", () => {
    const tabs = createNavHistoryTabs();
    tabs.push("/a.md", "s1");
    tabs.push("/b.md", "s1");
    tabs.push("/a.md", "s2");
    tabs.push("/b.md", "s2");
    // back on s1 → forward s1 gets /b.md
    expect(tabs.back("s1")).toBe("/b.md");
    tabs.pushForward("/b.md", "s1");
    expect(tabs.canGoForward("s1")).toBe(true);
    expect(tabs.canGoForward("s2")).toBe(false);
    // forward on s2 has nothing — the redo list is s1's
    expect(tabs.forward("s2")).toBeNull();
    expect(tabs.forward("s1")).toBe("/b.md");
  });

  test("no tabId → strict no-op (nothing materialized)", () => {
    const tabs = createNavHistoryTabs();
    tabs.push("/a.md", null);
    tabs.push("/a.md", undefined);
    expect(tabs.push("/a.md")).toBeUndefined();
    expect(tabs.back(undefined)).toBeNull();
    expect(tabs.back(null)).toBeNull();
    expect(tabs.forwardStep("/b.md", undefined)).toBeNull();
    expect(tabs.pushForward("/b.md", null)).toBeUndefined();
    expect(tabs.size()).toBe(0);
  });

  test("purge removes ONLY the given tab's stack (case 3)", () => {
    const tabs = createNavHistoryTabs();
    tabs.push("/a.md", "s1");
    tabs.push("/b.md", "s1");
    tabs.push("/x.md", "s2");
    expect(tabs.size()).toBe(2);

    expect(tabs.purge("s1")).toBe(true);
    expect(tabs.size()).toBe(1);
    expect(tabs.canGoBack("s1")).toBe(false);
    expect(tabs.canGoBack("s2")).toBe(true); // s2's history survives

    // purging an already-purged tab → false
    expect(tabs.purge("s1")).toBe(false);
    expect(tabs.purge(undefined)).toBe(false);
  });

  test("reset clears every stack (session restore)", () => {
    const tabs = createNavHistoryTabs();
    tabs.push("/a.md", "s1");
    tabs.push("/x.md", "s2");
    expect(tabs.reset()).toBe(true);
    expect(tabs.size()).toBe(0);
    expect(tabs.canGoBack("s1")).toBe(false);
    expect(tabs.canGoBack("s2")).toBe(false);
    // idempotent
    expect(tabs.reset()).toBe(false);
  });
});
