import { expect, test } from "bun:test";
import { isVisibleTreeEntryName, relativePath } from "../src/lib/files";

test("hides all dot-prefixed entries (unix hidden files)", () => {
  for (const name of [".agent", ".vscode", ".github", ".azprose", ".hidden"]) {
    expect(isVisibleTreeEntryName(name)).toBe(false);
  }
});

test("keeps noisy hidden entries filtered", () => {
  for (const name of [".git", ".DS_Store", ".cache", ".env"]) {
    expect(isVisibleTreeEntryName(name)).toBe(false);
  }
});

test("shows regular entries", () => {
  expect(isVisibleTreeEntryName("notes")).toBe(true);
  expect(isVisibleTreeEntryName("readme.md")).toBe(true);
});

test("formats relative paths only inside the selected root", () => {
  expect(relativePath("/notes/project/brief.md", "/notes/project")).toBe("brief.md");
  expect(relativePath("/notes/project-extra/brief.md", "/notes/project")).toBe("brief.md");
  expect(relativePath("C:\\notes\\project\\brief.md", "C:\\notes\\project")).toBe("brief.md");
});
