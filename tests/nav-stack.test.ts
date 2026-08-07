import { describe, expect, test } from "bun:test";
import {
  createNavStack,
  navStackBack,
  navStackCanGoBack,
  navStackCanGoForward,
  navStackForward,
  navStackForwardStep,
  navStackPush,
  navStackPushForward,
} from "@/lib/nav-stack";

describe("nav-stack (pure preview navigation history)", () => {
  test("createNavStack starts empty", () => {
    const s = createNavStack();
    expect(navStackCanGoBack(s)).toBe(false);
    expect(navStackCanGoForward(s)).toBe(false);
    expect(s.back).toEqual([]);
    expect(s.forward).toEqual([]);
    expect(s.revision).toBe(0);
  });

  test("push appends to back and clears forward", () => {
    const s = createNavStack();
    navStackPush(s, "a.md");
    navStackPush(s, "b.md");
    expect(s.back).toEqual(["a.md", "b.md"]);
    expect(navStackCanGoBack(s)).toBe(true);
    // a new navigation wipes the forward list
    navStackPushForward(s, "a.md");
    expect(navStackCanGoForward(s)).toBe(true);
    navStackPush(s, "c.md");
    expect(s.forward).toEqual([]);
    expect(s.back).toEqual(["a.md", "b.md", "c.md"]);
  });

  test("consecutive duplicates are skipped (headings in the same file)", () => {
    const s = createNavStack();
    navStackPush(s, "cours.md");
    navStackPush(s, "cours.md");
    navStackPush(s, "cours.md");
    expect(s.back).toEqual(["cours.md"]);
  });

  test("a deduplicated push still clears the forward stack", () => {
    const s = createNavStack();
    navStackPush(s, "x.md");
    navStackPush(s, "y.md");
    // go back → forward gets y.md
    expect(navStackBack(s)).toBe("y.md");
    navStackPushForward(s, "y.md");
    expect(s.forward).toEqual(["y.md"]);
    // new navigation to x.md (same as back top) → forward MUST be cleared
    navStackPush(s, "x.md");
    expect(s.back).toEqual(["x.md"]);
    expect(s.forward).toEqual([]);
  });

  test("non-consecutive revisit creates a new entry (X→Y→X)", () => {
    const s = createNavStack();
    navStackPush(s, "x.md");
    navStackPush(s, "y.md");
    navStackPush(s, "x.md");
    expect(s.back).toEqual(["x.md", "y.md", "x.md"]);
  });

  test("back pops in LIFO order and returns null when empty", () => {
    const s = createNavStack();
    expect(navStackBack(s)).toBeNull();
    navStackPush(s, "a.md");
    navStackPush(s, "b.md");
    expect(navStackBack(s)).toBe("b.md");
    expect(navStackBack(s)).toBe("a.md");
    expect(navStackBack(s)).toBeNull();
    expect(navStackCanGoBack(s)).toBe(false);
  });

  test("forward pops in LIFO order", () => {
    const s = createNavStack();
    expect(navStackForward(s)).toBeNull();
    navStackPushForward(s, "a.md");
    navStackPushForward(s, "b.md");
    expect(navStackForward(s)).toBe("b.md");
    expect(navStackForward(s)).toBe("a.md");
    expect(navStackForward(s)).toBeNull();
  });

  test("full browser trace X→Y→Z, back×2, forward×2 (app flow)", () => {
    const s = createNavStack();
    // X → Y → Z
    navStackPush(s, "x.md");
    navStackPush(s, "y.md");
    navStackPush(s, "z.md");
    expect(s.back).toEqual(["x.md", "y.md", "z.md"]);
    // back → Y
    expect(navStackBack(s)).toBe("z.md");
    navStackPushForward(s, "z.md");
    expect(s.back).toEqual(["x.md", "y.md"]);
    // back → X
    expect(navStackBack(s)).toBe("y.md");
    navStackPushForward(s, "y.md");
    expect(s.back).toEqual(["x.md"]);
    expect(s.forward).toEqual(["z.md", "y.md"]);
    // forward → Y (current page X is already the top of back → deduped,
    // remaining forward entries SURVIVE)
    expect(navStackForwardStep(s, "x.md")).toBe("y.md");
    expect(s.back).toEqual(["x.md"]);
    expect(s.forward).toEqual(["z.md"]);
    // forward → Z (current page Y is pushed back)
    expect(navStackForwardStep(s, "y.md")).toBe("z.md");
    expect(s.back).toEqual(["x.md", "y.md"]);
    expect(s.forward).toEqual([]);
  });

  test("multi-step forward navigation survives (regression: plain navPush cleared forward)", () => {
    const s = createNavStack();
    navStackPush(s, "a.md");
    navStackPush(s, "b.md");
    navStackPush(s, "c.md");
    // back ×2
    expect(navStackBack(s)).toBe("c.md");
    navStackPushForward(s, "c.md");
    expect(navStackBack(s)).toBe("b.md");
    navStackPushForward(s, "b.md");
    expect(s.forward).toEqual(["c.md", "b.md"]);
    // step forward twice — the second step MUST still see c.md
    expect(navStackForwardStep(s, "a.md")).toBe("b.md");
    expect(s.forward).toEqual(["c.md"]);
    expect(navStackForwardStep(s, "b.md")).toBe("c.md");
    expect(s.back).toEqual(["a.md", "b.md"]);
    expect(s.forward).toEqual([]);
  });

  test("revision increments on every mutation", () => {
    const s = createNavStack();
    navStackPush(s, "a.md");          // 1
    navStackPush(s, "b.md");          // 2
    navStackPush(s, "b.md");          // 3 — deduplicated push still bumps
    expect(navStackBack(s)).toBe("b.md"); // 4
    navStackPushForward(s, "b.md");   // 5
    expect(navStackForward(s)).toBe("b.md"); // 6
    expect(s.revision).toBe(6);
  });
});
