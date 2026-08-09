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
    isPreviewNavMode: () => false,
    unexpandSide: () => {},
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
 *  fichier inconnu — le reducer ne lit que quelques membres. Le contrat du
 *  registre de liens (phase 2 B) est reproduit fidèlement. */
function minimalFakePm(): PanelManager {
  const links = new Map<string, string | null>();
  return {
    main: { activeTabId: "t1", activePath: "/a.md" },
    side: { visible: false, activeTabId: "s1", activeTab: undefined, tabs: [] },
    get previewLinkedTabId() {
      return links.get("s1") ?? null;
    },
    linkedEditorTabId: (s: string) => links.get(s) ?? null,
    linkPreview: (s: string, m: string | null) => void links.set(s, m),
    openInSide: async () => {},
    openInMain: async () => {},
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

test("(a) viewer md maximisé + tab doc actif : NOUVEL onglet viewer (le doc n'est jamais ré-affecté)", async () => {
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

  // Matrice : maximisation CONSERVÉE, ouverture d'un tab viewer (dédup par
  // chemin → s2), le tab doc reste un doc non sélectionné. Aucun lien.
  expect(pm.side.activeTabId).toBe("s2");
  expect(pm.side.tabs.find(t => t.kind === "doc")!.path).toBe("/help/index.md");
  expect(pm.main.activeTabId).toBe("t1");
  expect(pm.previewLinkedTabId).toBeNull();
});

test("(a) viewer md maximisé + preview ACTIF : nouvel onglet viewer (dédup), maximisation conservée, aucun lien", async () => {
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

  // Dédup du chemin → le preview est sélectionné ; l'éditeur n'est PAS lié
  // (le couplage éditeur↔preview ne s'applique qu'aux tabs preview LIÉS).
  expect(pm.side.activeTabId).toBe("s2");
  expect(pm.side.tabs.find(t => t.kind === "doc")!.path).toBe("/help/index.md");
  expect(pm.previewLinkedTabId).toBeNull();
});

test("(a) wikilink HORS mode nav : ouvre un onglet ÉDITEUR (le preview ne navigue pas)", async () => {
  const pm = minimalFakePm();
  const opened: Array<{ path: string; opts: unknown }> = [];
  (pm.openInSide as unknown as (p: string, o?: unknown) => Promise<void>) =
    async (p, o) => void opened.push({ path: p, opts: o });
  const deps = makeDeps(pm);

  await navigate(deps, { type: "wikilink-navigate", path: "/b.md" });

  // Hors mode nav : la cible va à l'ÉDITEUR (openFile → openInMain, texte),
  // jamais au preview — le tab doc n'est pas impliqué (aucun openInSide).
  expect(opened).toHaveLength(0);
  expect(pm.previewLinkedTabId).toBeNull();
});

test("(a) wikilink EN mode nav : openInSide en fallbackToActive, jamais de ré-affectation du doc actif", async () => {
  const pm = minimalFakePm();
  const opened: Array<{ path: string; opts: unknown }> = [];
  (pm.openInSide as unknown as (p: string, o?: unknown) => Promise<void>) =
    async (p, o) => void opened.push({ path: p, opts: o });
  const deps = makeDeps(pm, { isPreviewNavMode: () => true });

  await navigate(deps, { type: "wikilink-navigate", path: "/b.md" });

  // Le fallbackToActive est bien transmis — c'est la garde de pickOpenTarget
  // (testée pure ci-dessus) qui protège le tab doc, pas un code ad hoc. Aucun
  // lien n'est établi en mode nav (l'éditeur ne suit plus — décision utilisateur).
  expect(opened).toHaveLength(1);
  expect(opened[0]).toEqual({ path: "/b.md", opts: { preview: true, fallbackToActive: true } });
  expect(pm.previewLinkedTabId).toBeNull();
});

// ── (b) le lien preview↔éditeur s'établit sur l'éditeur ACTIF ──

test("(b) EN mode nav, première navigation : IN-PLACE dans le preview, AUCUN lien (éditeur détaché)", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }], [{ id: "s1", path: "/a.md", preview: true, renderMode: "preview" }]);
  const deps = makeDeps(pm, { isPreviewNavMode: () => true });

  await navigate(deps, { type: "wikilink-navigate", path: "/a.md" });

  // Le preview affiche la cible (dédup → sélection) mais n'est PAS lié à
  // l'éditeur : le mode nav en fait un navigateur autonome (l'éditeur ne suit
  // plus — ni link, ni follow).
  expect(pm.side.activeTabId).toBe("s1");
  expect(pm.previewLinkedTabId).toBeNull();
  expect(pm.main.activeTabId).toBe("t1");
});

test("(b) HORS mode nav, lien existant : la navigation va à l'ÉDITEUR (jamais un doublon, pas de follow)", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }], [{ id: "s1", path: "/a.md", preview: true, renderMode: "preview" }]);
  pm.linkPreview("s1", "t1");
  const deps = makeDeps(pm);

  await navigate(deps, { type: "wikilink-navigate", path: "/a.md" });

  // Dédup par chemin → le tab main /a.md est sélectionné ; le preview ne
  // navigue pas et l'éditeur lié ne suit rien (pas de notification).
  expect(pm.previewLinkedTabId).toBe("t1");
  expect(pm.main.activeTabId).toBe("t1");
  expect(deps.calls.notifyInfo).toHaveLength(0);
});

test("(b) EN mode nav, lien existant : navigation IN-PLACE du preview, pas de follow ni de notification", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }], [{ id: "s1", path: "/a.md", preview: true, renderMode: "preview" }]);
  pm.linkPreview("s1", "t1");
  const deps = makeDeps(pm, { isPreviewNavMode: () => true });

  await navigate(deps, { type: "wikilink-navigate", path: "/a.md" });

  expect(pm.previewLinkedTabId).toBe("t1");
  expect(pm.side.activeTabId).toBe("s1"); // dédup → le preview affiche la cible
  expect(deps.calls.notifyInfo).toHaveLength(0);
});

test("(b) back/forward : le lien existant suit (rien n'est re-lié au mauvais éditeur)", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }], [
    { id: "s1", path: "/a.md", preview: true, renderMode: "preview" },
    { id: "s2", path: "/b.md", preview: true, renderMode: "preview" },
  ]);
  pm.linkPreview("s1", "t1");
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
  pm.linkPreview("s1", "t1");
  const deps = makeDeps(pm, { navBack: () => "/a.md" });

  await navigate(deps, { type: "preview-back" });

  expect(deps.calls.navPushForward).toEqual(["/b.md"]);
  expect(pm.side.activeTabId).toBe("s1"); // dédup → select du tab /a.md
  expect(pm.side.visible).toBe(true);
});

// ── phase 3 (C) : jump-to-line porte l'id de session du tab preview ────────
// Le dbl-clic preview émet azprose:jump-to-line {path, line, sessionId}. Le
// reducer le transmet à l'util éditeur qui résout le saut via la table de
// liens (phase 2 B) — jamais un doublon créé par une recherche par chemin.
// Sans sessionId, le comportement legacy par chemin reste identique.

test("(c) jump-to-line : sessionId transmis tel quel à l'util éditeur", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }], [{ id: "s1", path: "/a.md", preview: true, renderMode: "preview" }]);
  const received: Array<[number, string | null | undefined, string | null | undefined]> = [];
  const deps = makeDeps(pm, {
    jumpToLine: (line, path, sessionId) => { received.push([line, path, sessionId]); },
  });

  await navigate(deps, { type: "jump-to-line", line: 5, path: "/a.md", sessionId: "s1" });

  expect(received).toEqual([[5, "/a.md", "s1"]]);

  // Sans sessionId → undefined (legacy) — le reducer ne réinvente rien.
  await navigate(deps, { type: "jump-to-line", line: 7, path: "/b.md" });
  expect(received[1]).toEqual([7, "/b.md", undefined]);
});

// ── matrice : bouton « Ouvrir dans l'éditeur » (preview-open-editor) ────────
// Le fichier RENDU par le tab side s'ouvre dans l'éditeur main, DÉDUP (jamais
// de doublon) ; si le side est maximisé, bascule d'abord en 2 panneaux.

test("preview-open-editor : le fichier rendu s'ouvre dans l'éditeur main (dédup → select)", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }], [{ id: "s1", path: "/a.md", preview: true, renderMode: "preview" }]);
  const deps = makeDeps(pm);

  await navigate(deps, { type: "preview-open-editor", path: "/a.md" });

  // Déjà ouvert en main → sélection, jamais de doublon ni de lecture FS.
  expect(pm.main.activeTabId).toBe("t1");
  expect(pm.main.tabs).toHaveLength(1);
});

test("preview-open-editor : non ouvert en main → NOUVEAU tab éditeur + side dé-maximisé", async () => {
  const pm = new PanelManager();
  seed(
    pm,
    [{ id: "t1", path: "/a.md" }, { id: "t2", path: "/b.md" }],
    [{ id: "s1", path: "/b.md", preview: true, renderMode: "preview" }],
    { mainActive: "t1", sideActive: "s1" },
  );
  let unexpanded = 0;
  const deps = makeDeps(pm, {
    expandedPanel: () => "side",
    unexpandSide: () => { unexpanded++; },
  });

  await navigate(deps, { type: "preview-open-editor", path: "/b.md" });

  expect(unexpanded).toBe(1);
  expect(pm.main.activeTabId).toBe("t2"); // dédup par chemin → t2 sélectionné
});

test("preview-open-editor : côté split, aucun unexpand (no-op)", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }], [{ id: "s1", path: "/a.md", preview: true, renderMode: "preview" }]);
  let unexpanded = 0;
  const deps = makeDeps(pm, { unexpandSide: () => { unexpanded++; } });

  await navigate(deps, { type: "preview-open-editor", path: "/a.md" });

  expect(unexpanded).toBe(0);
  expect(pm.main.activeTabId).toBe("t1");
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

// ── phase 1 (suite) : ouvertures d'outils — canal 3 termine par navigate() ──
// Le rapport architecture-review exige les tests : dédup openSpreadsheet,
// pile openDataFilter, openCustom calendar, transition create→upgrade,
// gardes doc (cas du transcript). Les sagas déléguent au PanelManager RÉEL
// (pures) — les assertions vérifient le COMPORTEMENT de session.

test("open-spreadsheet : dédup par spreadsheetId — 2 ouvertures → 1 tab + visibilité side", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }]);
  const deps = makeDeps(pm);

  await navigate(deps, { type: "open-spreadsheet", spreadsheetId: "s1", title: "Notes" });
  await navigate(deps, { type: "open-spreadsheet", spreadsheetId: "s1", title: "Notes" });

  const tabs = pm.side.tabs.filter(t => t.kind === "spreadsheet" && t.spreadsheetId === "s1");
  expect(tabs).toHaveLength(1);
  expect(pm.side.activeTabId).toBe(tabs[0].id);
  expect(pm.side.visible).toBe(true);
});

test("open-spreadsheet : ids différents → 2 tabs", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }]);
  const deps = makeDeps(pm);

  await navigate(deps, { type: "open-spreadsheet", spreadsheetId: "s1", title: "A" });
  await navigate(deps, { type: "open-spreadsheet", spreadsheetId: "s2", title: "B" });

  expect(pm.side.tabs.filter(t => t.kind === "spreadsheet")).toHaveLength(2);
});

test("open-datafilter : dédup par ENSEMBLE trié des ids (ordre indifférent)", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }]);
  const deps = makeDeps(pm);

  await navigate(deps, { type: "open-datafilter", datafilterIds: ["g1", "g2"], title: "Pile" });
  await navigate(deps, { type: "open-datafilter", datafilterIds: ["g2", "g1"], title: "Pile" });
  expect(pm.side.tabs.filter(t => t.kind === "datafilter")).toHaveLength(1);
  expect(pm.side.activeTabId).toBe(pm.side.tabs[0].id);

  await navigate(deps, { type: "open-datafilter", datafilterIds: ["g1", "g3"], title: "Pile" });
  expect(pm.side.tabs.filter(t => t.kind === "datafilter")).toHaveLength(2);
});

test("open-custom : dédup par panelId (calendar)", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }]);
  const deps = makeDeps(pm);

  await navigate(deps, { type: "open-custom", panelId: "calendar", title: "Calendrier" });
  await navigate(deps, { type: "open-custom", panelId: "calendar", title: "Calendrier" });

  const tabs = pm.side.tabs.filter(t => t.kind === "custom" && t.panelId === "calendar");
  expect(tabs).toHaveLength(1);
  expect(pm.side.activeTabId).toBe(tabs[0].id);
});

test("set-spreadsheet-id : transition create→upgrade — le tab create reçoit id + titre", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }], [{ id: "s1", path: "spreadsheet://new", kind: "spreadsheet" }], { sideActive: "s1" });
  const deps = makeDeps(pm);

  await navigate(deps, { type: "set-spreadsheet-id", spreadsheetId: "s42", title: "Créé" });

  const tab = pm.side.tabs.find(t => t.id === "s1")!;
  expect(tab.kind).toBe("spreadsheet");
  expect(tab.spreadsheetId).toBe("s42");
  expect(tab.title).toBe("Créé");
});

test("set-spreadsheet-id : no-op sans tab create (le tab doc reste un doc)", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }], [{ id: "s1", path: "/help/index.md", kind: "doc" }]);
  const deps = makeDeps(pm);

  await navigate(deps, { type: "set-spreadsheet-id", spreadsheetId: "s42", title: "X" });

  const tab = pm.side.tabs.find(t => t.id === "s1")!;
  expect(tab.kind).toBe("doc");
  expect(tab.spreadsheetId).toBeUndefined();
  expect(tab.path).toBe("/help/index.md");
});

test("set-spreadsheet-title : met à jour le titre du tab (no-op si inchangé)", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }], [{ id: "s1", path: "spreadsheet://s1", kind: "spreadsheet" }]);
  pm.side.tabs = pm.side.tabs.map(t => t.id === "s1" ? { ...t, spreadsheetId: "s1", title: "Avant" } : t);
  const deps = makeDeps(pm);

  await navigate(deps, { type: "set-spreadsheet-title", spreadsheetId: "s1", title: "Après" });

  expect(pm.side.tabs.find(t => t.id === "s1")!.title).toBe("Après");
});

test("gardes doc : ouvrir un outil ne ré-affecte JAMAIS le tab doc (aide intégrée)", async () => {
  const pm = new PanelManager();
  seed(
    pm,
    [{ id: "t1", path: "/a.md" }],
    [{ id: "s1", path: "/vault/.azprose/help/index.md", kind: "doc" }],
    { sideActive: "s1" },
  );
  const deps = makeDeps(pm);

  await navigate(deps, { type: "open-spreadsheet", spreadsheetId: "s1", title: "Tableur" });
  await navigate(deps, { type: "open-custom", panelId: "calendar", title: "Calendrier" });

  const doc = pm.side.tabs.find(t => t.kind === "doc")!;
  expect(doc).toBeDefined();
  expect(doc.path).toBe("/vault/.azprose/help/index.md");
  expect(pm.side.tabs.filter(t => t.kind === "doc")).toHaveLength(1);
  // Le tab doc n'est ni sélectionné ni transformé : un outil est actif.
  expect(pm.side.activeTabId).not.toBe("s1");
});
