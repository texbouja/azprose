import { expect, test } from "bun:test";

// Bun n'embarque pas de localStorage : polyfill minimal avant tout usage.
(globalThis as Record<string, unknown>).localStorage = (() => {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
  };
})();

import { PanelManager } from "../src/lib/panel-manager";
import { pickOpenTarget } from "../src/lib/panel-store";
import { setSessionScope } from "../src/lib/session";
import { navigate, type NavDeps } from "../src/lib/navigation";

// Tests du REDUCER de navigation (phase 1, idée A) — couvrent les 3
// incohérences historiques du rapport architecture-review :
//   (a) le tab doc (aide intégrée) n'est JAMAIS ré-affecté par une navigation
//       (la garde `kind !== "doc"` de pickOpenTarget est exercée en bout de
//       chaîne, pas seulement par son test unitaire) ;
//   (b) le lien preview↔éditeur s'établit sur l'ÉDITEUR ACTIF (repli
//       `fallbackToActive`) — jamais sur un tab d'outil ni un autre tab main ;
//   (c) jump-to-line garde la boussole : heading prioritaire (scroll immune aux
//       décalages de transclusion), sinon line 1-based → 0-based LIÉE au chemin
//       (un rendu d'un AUTRE document ne scroll plus).
//
// Les lectures FS Tauri échouent sous bun : les fichiers cibles sont TOUJOURS
// seedés dans les panels (dédup → pas de lecture), la logique testée est celle
// qui s'exécute avant toute lecture.

setSessionScope("/test-vault");

interface SeedMain {
  id: string;
  path: string;
  source?: string;
  savedContent?: string;
  preview?: boolean;
  kind?: string;
  renderMode?: string;
}
interface SeedSide {
  id: string;
  path: string;
  kind?: string;
  preview?: boolean;
  renderMode?: string;
}

function seed(
  pm: PanelManager,
  main: SeedMain[],
  side: SeedSide[] = [],
  opts?: { mainActive?: string; sideActive?: string; expanded?: "main" | "side" | null },
) {
  pm.main.tabs = main.map(m => ({
    id: m.id,
    title: m.path.split("/").pop()!,
    path: m.path,
    source: m.source ?? "",
    savedContent: m.savedContent ?? "",
    preview: m.preview,
    kind: m.kind as never,
    renderMode: m.renderMode as never,
  }));
  pm.main.activeTabId = opts?.mainActive ?? main[0]?.id ?? null;
  pm.side.tabs = side.map(s => ({
    id: s.id,
    title: s.path.split("/").pop()!,
    path: s.path,
    source: "",
    savedContent: "",
    preview: s.preview,
    kind: s.kind as never,
    renderMode: s.renderMode as never,
  }));
  pm.side.activeTabId = opts?.sideActive ?? side[0]?.id ?? null;
}

/** Faux NavDeps : espions + réponses déterministes. */
function makeDeps(pm: PanelManager, overrides: Partial<NavDeps> = {}): NavDeps & {
  calls: {
    navPush: string[];
    navPushForward: string[];
    setScrollTarget: (string | null)[];
    setSyncLine: (string | null)[];
    setJumpToLine: number[];
    setEditorModeRaw: number;
    notifyInfo: string[];
    notifyError: { title: string; message: string }[];
  };
} {
  const calls = {
    navPush: [] as string[],
    navPushForward: [] as string[],
    setScrollTarget: [] as (string | null)[],
    setSyncLine: [] as (string | null)[],
    setJumpToLine: [] as number[],
    setEditorModeRaw: 0,
    notifyInfo: [] as string[],
    notifyError: [] as { title: string; message: string }[],
  };
  const base: NavDeps = {
    pm,
    rootPath: () => "/vault",
    activePath: () => pm.main.activePath,
    sideActivePath: () => pm.side.activePath,
    expandedPanel: () => null,
    navPush: (p) => void calls.navPush.push(p),
    navBack: () => null,
    navForwardStep: () => null,
    navPushForward: (p) => void calls.navPushForward.push(p),
    setScrollTarget: (h) => void calls.setScrollTarget.push(h),
    setSyncLine: (l, p) => void calls.setSyncLine.push(p ?? null),
    setJumpToLine: (l) => void calls.setJumpToLine.push(l),
    setEditorModeRaw: () => void calls.setEditorModeRaw++,
    setSideVisible: (v) => { pm.sideVisible = v; },
    notifyError: (title, message) => void calls.notifyError.push({ title, message }),
    notifyInfo: (m) => void calls.notifyInfo.push(m),
    t: (key) => key,
    readText: async () => "",
    trackMtime: async () => {},
    jumpToLine: () => {},
    openDocArticle: async () => {},
    ensureDailyNote: async () => null,
    journalScan: async () => {},
  };
  return { ...base, ...overrides, calls };
}

/** Faux PanelManager minimal (sans FS) pour les chemins qui ouvriraient un
 *  fichier inconnu — le reducer ne lit que quelques membres. */
function minimalFakePm(linkedTabId: string | null = null): PanelManager {
  return {
    main: { activeTabId: "t1", activePath: "/a.md" },
    side: { visible: false, activeTab: undefined, tabs: [] },
    previewLinkedTabId: linkedTabId,
    openInSide: async () => {},
  } as unknown as PanelManager;
}

// ── (a) le tab doc n'est JAMAIS ré-affecté ──

test("pickOpenTarget (garde pure) : le tab doc actif n'est jamais choisi par fallbackToActive", () => {
  const tabs = [
    { id: "s1", path: "/help/index.md", kind: "doc" },
    { id: "s2", path: "/a.md", preview: true },
  ];
  // fallback sur le tab doc actif : garde `!active.kind` → pas de fallback ;
  // la réutilisation d'un preview NON-doc reste possible (s2).
  expect(pickOpenTarget(tabs, "s1", true, true)).toEqual({ id: "s2", isFallback: false });
  // Sans aucun preview réutilisable → NOUVEAU tab (le doc n'est jamais touché).
  expect(pickOpenTarget([{ id: "s1", path: "/help/index.md", kind: "doc" }], "s1", true, true))
    .toEqual({ id: null, isFallback: false });
});

test("(a) tab doc actif : le routage maximisé ne s'applique pas → navigation main, le doc reste actif", async () => {
  const pm = new PanelManager();
  seed(
    pm,
    [{ id: "t1", path: "/a.md" }],
    [
      { id: "s1", path: "/help/index.md", kind: "doc" },
      { id: "s2", path: "/a.md", preview: true, renderMode: "preview" },
    ],
    { sideActive: "s1", expanded: "side" },
  );
  const deps = makeDeps(pm, { expandedPanel: () => "side" });

  await navigate(deps, { type: "open-active", path: "/a.md" });

  // Le routage maximisé exige un tab side de rendu preview/colle/presentation —
  // un tab doc (lecture seule) ne l'est pas → clic sidebar = navigation main.
  expect(pm.side.activeTabId).toBe("s1");
  expect(pm.side.tabs.find(t => t.kind === "doc")!.path).toBe("/help/index.md");
  expect(pm.main.activeTabId).toBe("t1");
  expect(pm.previewLinkedTabId).toBeNull();
});

test("(a) routage maximisé avec preview ACTIF : navigation in-place du tab preview, le doc n'est pas impliqué", async () => {
  const pm = new PanelManager();
  seed(
    pm,
    [{ id: "t1", path: "/a.md" }],
    [
      { id: "s1", path: "/help/index.md", kind: "doc" },
      { id: "s2", path: "/a.md", preview: true, renderMode: "preview" },
    ],
    { sideActive: "s2", expanded: "side" },
  );
  const deps = makeDeps(pm, { expandedPanel: () => "side" });

  await navigate(deps, { type: "open-active", path: "/a.md" });

  expect(pm.side.activeTabId).toBe("s2"); // dédup du chemin → le preview est sélectionné
  expect(pm.side.tabs.find(t => t.kind === "doc")!.path).toBe("/help/index.md");
  expect(pm.previewLinkedTabId).toBe("t1"); // premier lien → éditeur actif
});

test("(a) wikilink : openInSide en fallbackToActive, jamais de ré-affectation du doc actif", async () => {
  const pm = minimalFakePm();
  const opened: Array<{ path: string; opts: unknown }> = [];
  (pm.openInSide as unknown as (p: string, o?: unknown) => Promise<void>) =
    async (p, o) => void opened.push({ path: p, opts: o });
  const deps = makeDeps(pm);

  await navigate(deps, { type: "wikilink-navigate", path: "/b.md" });

  // Le fallbackToActive est bien transmis — c'est la garde de pickOpenTarget
  // (testée pure ci-dessus) qui protège le tab doc, pas un code ad hoc.
  expect(opened).toHaveLength(1);
  expect(opened[0]).toEqual({ path: "/b.md", opts: { preview: true, fallbackToActive: true } });
  expect(pm.previewLinkedTabId).toBe("t1");
});

// ── (b) le lien preview↔éditeur s'établit sur l'éditeur ACTIF ──

test("(b) premier lien : previewLinkedTabId = tab éditeur ACTIF (jamais un tab d'outil)", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }], [{ id: "s1", path: "/a.md", preview: true, renderMode: "preview" }]);
  const deps = makeDeps(pm);

  await navigate(deps, { type: "wikilink-navigate", path: "/a.md" });

  expect(pm.previewLinkedTabId).toBe("t1");
});

test("(b) lien déjà établi : followPreviewNavigation suit (no-op aligné, pas de notification)", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }], [{ id: "s1", path: "/a.md", preview: true, renderMode: "preview" }]);
  pm.previewLinkedTabId = "t1";
  const deps = makeDeps(pm);

  await navigate(deps, { type: "wikilink-navigate", path: "/a.md" });

  expect(pm.previewLinkedTabId).toBe("t1");
  expect(pm.main.activeTabId).toBe("t1");
  expect(deps.calls.notifyInfo).toHaveLength(0);
});

test("(b) back/forward : le lien existant suit (rien n'est re-lié au mauvais éditeur)", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }], [
    { id: "s1", path: "/a.md", preview: true, renderMode: "preview" },
    { id: "s2", path: "/b.md", preview: true, renderMode: "preview" },
  ]);
  pm.previewLinkedTabId = "t1";
  const deps = makeDeps(pm, {
    navBack: () => "/a.md",
    navForwardStep: () => "/a.md",
  });

  await navigate(deps, { type: "preview-back" });
  expect(pm.previewLinkedTabId).toBe("t1");
  expect(deps.calls.navPushForward).toHaveLength(1);

  await navigate(deps, { type: "preview-forward" });
  expect(pm.previewLinkedTabId).toBe("t1");
});

// ── (c) jump-to-file garde la boussole ──

test("(c) heading prioritaire : scroll par heading, PAS de syncLine", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/docs/suites.md" }]);
  const deps = makeDeps(pm);

  await navigate(deps, { type: "jump-to-file", path: "/docs/suites.md", heading: "Propriétés" });

  expect(deps.calls.setScrollTarget).toEqual(["Propriétés"]);
  expect(deps.calls.setSyncLine).toHaveLength(0);
  expect(deps.calls.setJumpToLine).toHaveLength(0);
  expect(deps.calls.setEditorModeRaw).toBe(0);
});

test("(c) line seule : 1-based → 0-based, syncLine LIÉE au chemin normalisé", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/docs/suites.md" }]);
  const deps = makeDeps(pm);

  await navigate(deps, { type: "jump-to-file", path: "/docs/suites.md", line: 3 });

  expect(deps.calls.setJumpToLine).toEqual([2]);
  expect(deps.calls.setEditorModeRaw).toBe(1);
  expect(deps.calls.setSyncLine).toEqual(["/docs/suites.md"]);
  expect(deps.calls.setScrollTarget).toHaveLength(0);
});

test("(c) chemin non normalisé : findTabByPath trouve le tab, syncLine liée au chemin NORMALISÉ", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/docs/suites.md" }]);
  const deps = makeDeps(pm);

  await navigate(deps, { type: "jump-to-file", path: "/docs/./suites.md", line: 1 });

  expect(pm.main.activeTabId).toBe("t1"); // dédup trouvé → select, pas d'openInMain
  expect(deps.calls.setJumpToLine).toEqual([0]);
  expect(deps.calls.setSyncLine).toEqual(["/docs/suites.md"]);
});

test("(c) ni line ni heading : aucune cible de rendu posée", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/docs/suites.md" }]);
  const deps = makeDeps(pm);

  await navigate(deps, { type: "jump-to-file", path: "/docs/suites.md" });

  expect(deps.calls.setScrollTarget).toHaveLength(0);
  expect(deps.calls.setSyncLine).toHaveLength(0);
  expect(deps.calls.setJumpToLine).toHaveLength(0);
  expect(deps.calls.setEditorModeRaw).toBe(0);
});

// ── sagas complémentaires (open-file / open-active / history) ──

test("open-file : image/pdf → side + visibilité ; texte → main", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }], [{ id: "s1", path: "/x.png" }]);
  const deps = makeDeps(pm);

  await navigate(deps, { type: "open-file", path: "/x.png" });
  expect(pm.side.visible).toBe(true);
  expect(pm.side.activeTabId).toBe("s1");
  expect(deps.calls.notifyError).toHaveLength(0);

  await navigate(deps, { type: "open-file", path: "/a.md" });
  expect(pm.main.activeTabId).toBe("t1");
});

test("open-file : format non supporté → notification d'erreur sauf silent", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }]);
  const deps = makeDeps(pm);

  await navigate(deps, { type: "open-file", path: "/a.xyz" });
  expect(deps.calls.notifyError).toHaveLength(1);
  expect(deps.calls.notifyError[0].title).toBe("Format");

  await navigate(deps, { type: "open-file", path: "/a.xyz", opts: { silent: true } });
  expect(deps.calls.notifyError).toHaveLength(1);
});

test("open-active : alt+clic (newTab) → openInMain (texte)", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }]);
  const deps = makeDeps(pm);

  // La lecture FS échoue sous bun (le vrai handler ne passe pas silent) : on
  // capture le rejet — la DÉCISION (path ouvrable → openInMain, pas de
  // notifyError, le main reste le panel ciblé) est ce qui est attesté.
  await expect(navigate(deps, { type: "open-active", path: "/b.md", newTab: true })).rejects.toThrow();
  expect(deps.calls.notifyError).toHaveLength(0);
  expect(pm.main.activeTabId).toBe("t1");
});

test("history back : push-forward de la page courante + navigation du tab preview lié", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }], [
    { id: "s1", path: "/a.md", preview: true, renderMode: "preview" },
    { id: "s2", path: "/b.md", preview: true, renderMode: "preview" },
  ], { sideActive: "s2" });
  pm.previewLinkedTabId = "t1";
  const deps = makeDeps(pm, { navBack: () => "/a.md" });

  await navigate(deps, { type: "preview-back" });

  expect(deps.calls.navPushForward).toEqual(["/b.md"]);
  expect(pm.side.activeTabId).toBe("s1"); // dédup → select du tab /a.md
  expect(pm.side.visible).toBe(true);
});

test("open-help : racine doc déjà ouverte → sélection, pas de ré-ouverture", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }], [{ id: "s1", path: "/vault/.azprose/help/index.md", kind: "doc" }], { sideActive: "s1" });
  const deps = makeDeps(pm, { openDocArticle: async () => { throw new Error("ne doit pas être appelé"); } });

  await navigate(deps, { type: "open-help" });

  expect(pm.side.activeTabId).toBe("s1");
});

test("doc-navigate : délègue à openDocArticle (jamais l'éditeur main)", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }]);
  let called: { path: string; heading?: string } | null = null;
  const deps = makeDeps(pm, {
    openDocArticle: async (p, h) => { called = { path: p, heading: h }; },
  });

  await navigate(deps, { type: "doc-navigate", path: "/help/guide.md", heading: "Liens" });

  expect(called).toEqual({ path: "/help/guide.md", heading: "Liens" });
});
