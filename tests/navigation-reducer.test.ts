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
import { createPinnedHistory } from "../src/lib/pinned-history";

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
    /** Historique de MONTAGE du pinned slot (Phase D) — pile RÉELLE par format
     *  (le module `@/lib/pinned-history` est pur : on l'utilise tel quel plutôt
     *  qu'un espion, pour tester le comportement de bout en bout). */
    pinnedPush: { format: string; path: string }[];
    setScrollTarget: (string | null)[];
    setSyncLine: (string | null)[];
    setJumpToLine: number[];
    setEditorModeRaw: number;
    notifyInfo: string[];
    notifyError: { title: string; message: string }[];
  };
} {
  const slots = createPinnedHistory();
  const calls = {
    navPush: [] as string[],
    navPushForward: [] as string[],
    pinnedPush: [] as { format: string; path: string }[],
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
    setPreviewNavMode: () => {},
    unexpandSide: () => {},
    navPush: (p) => void calls.navPush.push(p),
    navBack: () => null,
    navForwardStep: () => null,
    navPushForward: (p) => void calls.navPushForward.push(p),
    // Pile de montage RÉELLE (module pur) + trace des push pour les assertions.
    pinnedPush: (f, p) => {
      calls.pinnedPush.push({ format: f ?? "", path: p });
      slots.push(f, p);
    },
    pinnedBack: (f) => slots.back(f),
    pinnedForwardStep: (f, cur) => slots.forwardStep(f, cur),
    pinnedPushForward: (f, p) => slots.pushForward(f, p),
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

test("(a) wikilink HORS mode nav : ouvre un NOUVEAU tab viewer side (jamais l'éditeur main)", async () => {
  const pm = minimalFakePm();
  const opened: Array<{ path: string; opts: unknown }> = [];
  (pm.openInSide as unknown as (p: string, o?: unknown) => Promise<void>) =
    async (p, o) => void opened.push({ path: p, opts: o });
  const deps = makeDeps(pm);

  await navigate(deps, { type: "wikilink-navigate", path: "/b.md", navMode: false });

  // Décision utilisateur : un clic wikilink ouvre un NOUVEAU tab viewer side
  // (forceNew — jamais l'éditeur main, jamais le tab doc), aucun couplage
  // établi (la vue de droite reste indépendante de l'éditeur).
  expect(opened).toHaveLength(1);
  expect(opened[0]).toEqual({ path: "/b.md", opts: { preview: true, forceNew: true, silent: true } });
  expect(pm.previewLinkedTabId).toBeNull();
});

test("(a) wikilink EN mode nav : openInSide en fallbackToActive, jamais de ré-affectation du doc actif", async () => {
  const pm = minimalFakePm();
  const opened: Array<{ path: string; opts: unknown }> = [];
  (pm.openInSide as unknown as (p: string, o?: unknown) => Promise<void>) =
    async (p, o) => void opened.push({ path: p, opts: o });
  // Décision FIGÉE au clic (matrice cas 1) : `navMode` voyage avec l'intention
  // — le reducer ne relit JAMAIS `isPreviewNavMode()` (ici laissée à son défaut
  // `false`, contradictoire : prouve que l'intention fait foi).
  const deps = makeDeps(pm);

  await navigate(deps, { type: "wikilink-navigate", path: "/b.md", navMode: true });

  // Le fallbackToActive est bien transmis — c'est la garde de pickOpenTarget
  // (testée pure ci-dessus) qui protège le tab doc, pas un code ad hoc. Le
  // mode nav libère le couplage du viewer actif (aucun lien établi ici) —
  // décision utilisateur : l'éditeur ne suit plus.
  expect(opened).toHaveLength(1);
  expect(opened[0]).toEqual({ path: "/b.md", opts: { preview: true, fallbackToActive: true } });
  expect(pm.previewLinkedTabId).toBeNull();
});

// ── matrice cas 1 : décision FIGÉE au clic (tabId + navMode dans l'intention)
// L'émetteur lit le mode nav du tab SOURCE au moment du clic ; le reducer
// exécute la décision SANS relire `isPreviewNavMode()` (course asynchrone :
// la résolution de la cible dans le handler peut durer pendant que
// l'utilisateur bascule le mode).

test("cas 1 : navMode figé gouverne — le reducer ne relit JAMAIS isPreviewNavMode()", async () => {
  const pm = minimalFakePm();
  const opened: Array<{ path: string; opts: unknown }> = [];
  (pm.openInSide as unknown as (p: string, o?: unknown) => Promise<void>) =
    async (p, o) => void opened.push({ path: p, opts: o });
  // `isPreviewNavMode` THROWE : si le reducer la lisait (comportement
  // historique), la navigation échouerait — ici elle réussit, preuve que
  // l'intention fait foi.
  const deps = makeDeps(pm, {
    isPreviewNavMode: () => { throw new Error("isPreviewNavMode ne doit pas être relue"); },
  });

  await navigate(deps, { type: "wikilink-navigate", path: "/b.md", tabId: "s1", navMode: true });
  expect(opened).toHaveLength(1);
  expect(opened[0].opts).toEqual({ preview: true, fallbackToActive: true });

  await navigate(deps, { type: "wikilink-navigate", path: "/c.md", tabId: "s1", navMode: false });
  expect(opened).toHaveLength(2);
  expect(opened[1].opts).toEqual({ preview: true, forceNew: true, silent: true });
});

test("cas 1 : le relâchement de couplage cible le tab SOURCE figé (tabId), pas le tab actif courant", async () => {
  const pm = new PanelManager();
  seed(
    pm,
    [{ id: "t1", path: "/a.md" }],
    [
      { id: "s1", path: "/a.md", preview: true, renderMode: "preview" },
      { id: "s2", path: "/b.md", preview: true, renderMode: "preview" },
      { id: "s3", path: "/c.md", preview: true, renderMode: "preview" }, // cible déjà seedée → dédup, pas de lecture FS
    ],
    { sideActive: "s2" }, // au moment où le reducer s'exécute, s1 n'est PLUS actif
  );
  pm.linkPreview("s1", "t1");
  const opened: Array<{ path: string; opts: unknown }> = [];
  const origOpen = pm.openInSide.bind(pm);
  pm.openInSide = (async (p: string, o?: unknown) => {
    opened.push({ path: p, opts: o });
    return origOpen(p, o as never);
  }) as typeof pm.openInSide;
  const deps = makeDeps(pm);

  // Le clic a eu lieu dans s1 (mode nav figé) ; l'utilisateur a basculé sur s2
  // pendant la résolution. La libération du couplage doit viser s1 (tabId),
  // jamais s2.
  await navigate(deps, { type: "wikilink-navigate", path: "/c.md", tabId: "s1", navMode: true });

  expect(pm.linkedEditorTabId("s1")).toBeNull(); // couplage de la SOURCE libéré
  expect(pm.linkedEditorTabId("s2")).toBeNull(); // s2 n'a jamais été couplé
  expect(opened[0].opts).toEqual({ preview: true, fallbackToActive: true });
});

// ── (b) le lien preview↔éditeur s'établit sur l'éditeur ACTIF ──

test("(b) EN mode nav, première navigation : IN-PLACE dans le preview, AUCUN lien (éditeur détaché)", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }], [{ id: "s1", path: "/a.md", preview: true, renderMode: "preview" }]);
  const deps = makeDeps(pm);

  await navigate(deps, { type: "wikilink-navigate", path: "/a.md", navMode: true });

  // Le preview affiche la cible (dédup → sélection) mais n'est PAS lié à
  // l'éditeur : le mode nav en fait un navigateur autonome (l'éditeur ne suit
  // plus — ni link, ni follow).
  expect(pm.side.activeTabId).toBe("s1");
  expect(pm.previewLinkedTabId).toBeNull();
  expect(pm.main.activeTabId).toBe("t1");
});

test("(b) HORS mode nav, lien existant : la cible va au viewer (dédup), l'éditeur ne suit pas", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }], [{ id: "s1", path: "/a.md", preview: true, renderMode: "preview" }]);
  pm.linkPreview("s1", "t1");
  const deps = makeDeps(pm);

  await navigate(deps, { type: "wikilink-navigate", path: "/a.md", navMode: false });

  // Dédup par chemin → le viewer s1 est sélectionné ; l'éditeur t1 n'est PAS
  // sélectionné (la navigation wikilink ne va jamais à l'éditeur). Le couplage
  // s1↔t1 reste cohérent (t1 affiche toujours /a.md), aucune notification.
  expect(pm.side.activeTabId).toBe("s1");
  expect(pm.main.activeTabId).toBe("t1");
  expect(pm.previewLinkedTabId).toBe("t1");
  expect(deps.calls.notifyInfo).toHaveLength(0);
});

test("(b) EN mode nav, lien existant : navigation IN-PLACE du preview + LIBÉRATION du couplage", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }], [{ id: "s1", path: "/a.md", preview: true, renderMode: "preview" }]);
  pm.linkPreview("s1", "t1");
  const deps = makeDeps(pm);

  await navigate(deps, { type: "wikilink-navigate", path: "/a.md", navMode: true });

  // Le mode nav navigue le preview IN-PLACE (dédup → sélection) et LIBÈRE le
  // couplage du viewer actif : l'éditeur lié ne suit plus (décision utilisateur).
  expect(pm.previewLinkedTabId).toBeNull();
  expect(pm.side.activeTabId).toBe("s1");
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

test("(c) jump-to-line : sessionId transmis + COUPLAGE du tab preview au tab éditeur", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }], [{ id: "s1", path: "/a.md", preview: true, renderMode: "preview" }]);
  const received: Array<[number, string | null | undefined, string | null | undefined]> = [];
  const deps = makeDeps(pm, {
    jumpToLine: (line, path, sessionId) => { received.push([line, path, sessionId]); },
  });

  await navigate(deps, { type: "jump-to-line", line: 5, path: "/a.md", sessionId: "s1" });

  expect(received).toEqual([[5, "/a.md", "s1"]]);
  // Double-clic HORS mode nav : le tab preview émetteur est COUPLÉ au tab
  // éditeur qui a reçu le saut (t1) — règle utilisateur.
  expect(pm.previewLinkedTabId).toBe("t1");

  // Sans sessionId → undefined (legacy) — le reducer ne réinvente rien, et le
  // couplage n'est PAS modifié.
  await navigate(deps, { type: "jump-to-line", line: 7, path: "/b.md" });
  expect(received[1]).toEqual([7, "/b.md", undefined]);
  expect(pm.previewLinkedTabId).toBe("t1");
});

test("(c) jump-to-line EN mode nav : aucun couplage — le lien d'un AUTRE viewer est conservé", async () => {
  const pm = new PanelManager();
  seed(
    pm,
    [{ id: "t1", path: "/a.md" }],
    [
      { id: "s1", path: "/a.md", preview: true, renderMode: "preview" },
      { id: "s2", path: "/b.md", preview: true, renderMode: "preview" },
    ],
    { sideActive: "s2" },
  );
  pm.linkPreview("s1", "t1");
  const deps = makeDeps(pm, { isPreviewNavMode: () => true });

  await navigate(deps, { type: "jump-to-line", line: 2, path: "/a.md", sessionId: "s2" });

  // En mode nav, le dbl-clic n'établit AUCUN couplage : s2 n'a pas volé le
  // lien — le couplage s1↔t1 existant est conservé (règle utilisateur).
  expect(pm.linkedEditorTabId("s1")).toBe("t1");
  expect(pm.linkedEditorTabId("s2")).toBeNull();
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

// ── couplage éditeur↔viewer : état par tab, un-couplé-par-éditeur ───────────
// Décision utilisateur : le couplage est EXPLICITE, créé uniquement par le
// bouton preview éditeur / double-clic / « Ouvrir dans l'éditeur » (hors mode
// nav) ; ENTRER en mode nav LIBÈRE le couplage, SORTIR ne re-couple pas ; le
// clic sidebar fait suivre le viewer couplé.

test("linkPreview : un seul viewer couplé par éditeur — coupler s2 à t1 dé-couple s1", () => {
  const pm = new PanelManager();
  pm.linkPreview("s1", "t1");
  pm.linkPreview("s2", "t1");
  expect(pm.linkedEditorTabId("s1")).toBeNull();
  expect(pm.linkedEditorTabId("s2")).toBe("t1");
  // Coupler s1 à un AUTRE éditeur ne touche pas s2.
  pm.linkPreview("s1", "t2");
  expect(pm.linkedEditorTabId("s1")).toBe("t2");
  expect(pm.linkedEditorTabId("s2")).toBe("t1");
});

test("sideTabLinkedTo : reverse lookup du viewer couplé à un éditeur", () => {
  const pm = new PanelManager();
  expect(pm.sideTabLinkedTo("t1")).toBeNull();
  pm.linkPreview("s1", "t1");
  expect(pm.sideTabLinkedTo("t1")).toBe("s1");
  pm.linkPreview("s1", null);
  expect(pm.sideTabLinkedTo("t1")).toBeNull();
});

test("preview-nav-mode : ENTRER libère le couplage ; SORTIR ne re-couple pas", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }], [{ id: "s1", path: "/a.md", preview: true, renderMode: "preview" }]);
  pm.linkPreview("s1", "t1");
  const navMode: Record<string, boolean> = {};
  const deps = makeDeps(pm, { setPreviewNavMode: (tabId, on) => { navMode[tabId] = on; } });

  await navigate(deps, { type: "preview-nav-mode", tabId: "s1", on: true });
  expect(pm.previewLinkedTabId).toBeNull(); // couplage libéré
  expect(navMode["s1"]).toBe(true);

  await navigate(deps, { type: "preview-nav-mode", tabId: "s1", on: false });
  expect(pm.previewLinkedTabId).toBeNull(); // pas de re-couplage
  expect(navMode["s1"]).toBe(false);
});

test("preview-nav-mode : OFF sur un tab sans lien — aucun lien créé", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }], [{ id: "s1", path: "/a.md", preview: true, renderMode: "preview" }]);
  const deps = makeDeps(pm);

  await navigate(deps, { type: "preview-nav-mode", tabId: "s1", on: false });

  expect(pm.previewLinkedTabId).toBeNull();
});

test("preview-open-editor : sessionId → COUPLAGE du tab preview au tab éditeur (hors mode nav)", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }], [{ id: "s1", path: "/a.md", preview: true, renderMode: "preview" }]);
  const deps = makeDeps(pm);

  await navigate(deps, { type: "preview-open-editor", path: "/a.md", sessionId: "s1" });

  // « Ouvrir dans l'éditeur » hors mode nav : le tab preview émetteur est
  // COUPLÉ au tab éditeur qui reçoit (règle utilisateur).
  expect(pm.main.activeTabId).toBe("t1");
  expect(pm.previewLinkedTabId).toBe("t1");
});

test("preview-open-editor : EN mode nav → aucun couplage créé", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }], [{ id: "s1", path: "/a.md", preview: true, renderMode: "preview" }]);
  const deps = makeDeps(pm, { isPreviewNavMode: () => true });

  await navigate(deps, { type: "preview-open-editor", path: "/a.md", sessionId: "s1" });

  expect(pm.main.activeTabId).toBe("t1");
  expect(pm.previewLinkedTabId).toBeNull();
});

test("open-active : clic sidebar → le viewer COUPLÉ suit (repoint vers la cible)", async () => {
  // Fake riche : openInMainActiveTab « ouvre » /b.md (aucune lecture FS), le
  // viewer s1 est couplé à t1 — syncCoupledViewer doit re-pointer s1 vers
  // /b.md (règle utilisateur « le viewer couplé suit »).
  const repointed: string[] = [];
  const pm = {
    main: { activeTabId: "t1", activePath: "/b.md", tabs: [] },
    side: {
      visible: true,
      activeTabId: "s1",
      activeTab: undefined,
      tabs: [{ id: "s1", path: "/a.md", preview: true, renderMode: "preview" }],
      repoint: async (tabId: string, path: string) => {
        repointed.push(`${tabId}→${path}`);
        return { ok: true, parked: false };
      },
    },
    sideTabLinkedTo: (mainId: string) => (mainId === "t1" ? "s1" : null),
    pinnedMainTab: () => null,
    openInMainActiveTab: async () => {},
    trackMtime: async () => {},
  } as unknown as PanelManager;
  const deps = makeDeps(pm);

  await navigate(deps, { type: "open-active", path: "/b.md" });

  expect(repointed).toEqual(["s1→/b.md"]);
});

// ── Phase B : routage par espace (pinned slot du format sinon libre) ─────────
// R3 : le clic sidebar SIMPLE (et les sauts navigateur : TOC/backlinks/tags,
// journal, oxide) cible le tab du BON espace — le PINNED slot du format s'il
// existe (re-point du tab épinglé, jamais de doublon pinned), sinon l'espace
// libre (comportement historique). Alt+clic → espace libre explicite ;
// Alt+Maj+clic → viewer libre side (dédup, jamais l'éditeur ni le pinned).

/** Fake PanelManager « routage par espace » : `pinnedMainTab` retourne le slot
 *  du `format` demandé (ou null) ; `main.repoint`/`main.select` espionnés ;
 *  les replis d'ouverture libre THROW si appelés (le routage pinned doit
 *  absorber la navigation). */
function pinnedRoutingFakePm(opts: { format?: string | null; repointOk?: boolean } = {}) {
  const { format = "md", repointOk = true } = opts;
  const repointed: string[] = [];
  const selected: string[] = [];
  const pm = {
    main: {
      activeTabId: "t1",
      activePath: "/a.md",
      tabs: [],
      repoint: async (id: string, path: string) => {
        repointed.push(`${id}→${path}`);
        return { ok: repointOk, parked: false };
      },
      select: (id: string) => void selected.push(id),
    },
    side: { visible: false, activeTabId: null, activeTab: undefined, tabs: [] },
    pinnedMainTab: (f: string) => (f === format ? { id: "p1", path: "/p.md" } : null),
    sideTabLinkedTo: () => null,
    openInMainActiveTab: async () => { throw new Error("repli libre (openInMainActiveTab) non attendu"); },
    openInMain: async () => { throw new Error("repli libre (openInMain) non attendu"); },
    openInSide: async () => { throw new Error("openInSide non attendu"); },
    trackMtime: async () => {},
  } as unknown as PanelManager;
  return { pm, repointed, selected };
}

test("Phase B : clic sidebar SIMPLE + pinned slot du format → re-point du pinned (jamais l'espace libre)", async () => {
  const { pm, repointed, selected } = pinnedRoutingFakePm({ format: "md" });
  const deps = makeDeps(pm);

  await navigate(deps, { type: "open-active", path: "/b.md" });

  // R3 : le pinned slot absorbe — repoint du tab épinglé + sélection, jamais
  // openInMainActiveTab (l'espace libre ne reçoit pas de doublon du contenu).
  expect(repointed).toEqual(["p1→/b.md"]);
  expect(selected).toEqual(["p1"]);
});

test("Phase B : clic SIMPLE sur un AUTRE format → repli espace libre (slot inexistant)", async () => {
  // Le slot « tex » n'existe pas : le routage pinned n'absorbe pas → repli
  // libre (openInMainActiveTab). Le fake le THROW : le test atteste qu'avec
  // un slot existant le comportement est identique au clic simple libre.
  const { pm, repointed } = pinnedRoutingFakePm({ format: "tex" });
  pm.openInMainActiveTab = async () => {}; // repli libre réel (fake no-op)
  const deps = makeDeps(pm);

  await navigate(deps, { type: "open-active", path: "/b.md" });

  expect(repointed).toEqual([]);
});

test("Phase B : clic SIMPLE + échec de re-point du pinned → repli espace libre (jamais d'erreur muette)", async () => {
  // Fichier illisible : repoint ok:false (tab épinglé laissé intact) → repli
  // libre. Le routage pinned ne doit jamais avaler un échec silencieusement.
  const { pm, repointed } = pinnedRoutingFakePm({ format: "md", repointOk: false });
  pm.openInMainActiveTab = async () => {};
  const deps = makeDeps(pm);

  await navigate(deps, { type: "open-active", path: "/b.md" });

  expect(repointed).toEqual(["p1→/b.md"]);
});

test("Phase B : alt+maj+clic (viewer) → viewer libre side, jamais l'éditeur ni le pinned", async () => {
  const opened: Array<{ path: string; opts: unknown }> = [];
  const pm = {
    main: { activeTabId: "t1", activePath: "/a.md", tabs: [] },
    side: { visible: false, activeTabId: null, activeTab: undefined, tabs: [] },
    pinnedMainTab: () => null,
    openInSide: async (p: string, o?: unknown) => void opened.push({ path: p, opts: o }),
    openInMainActiveTab: async () => { throw new Error("éditeur libre non attendu"); },
    trackMtime: async () => {},
  } as unknown as PanelManager;
  const deps = makeDeps(pm);

  await navigate(deps, { type: "open-active", path: "/b.md", viewer: true });

  // Politique wikilink hors mode nav : NOUVEAU viewer side (forceNew preview),
  // jamais l'éditeur main, jamais le pinned slot.
  expect(opened).toEqual([{ path: "/b.md", opts: { preview: true, forceNew: true } }]);
  expect(pm.sideVisible).toBe(true);
});

test("Phase B : alt+maj+clic avec viewer side du même contenu → dédup (select du viewer existant)", async () => {
  const selected: string[] = [];
  const pm = {
    main: { activeTabId: "t1", activePath: "/a.md", tabs: [] },
    side: {
      visible: false,
      activeTabId: null,
      activeTab: undefined,
      tabs: [{ id: "s1", path: "/b.md", preview: true, renderMode: "preview" }],
      select: (id: string) => void selected.push(id),
    },
    pinnedMainTab: () => null,
    openInSide: async () => { throw new Error("openInSide non attendu (dédup)"); },
    trackMtime: async () => {},
  } as unknown as PanelManager;
  const deps = makeDeps(pm);

  await navigate(deps, { type: "open-active", path: "/b.md", viewer: true });

  expect(selected).toEqual(["s1"]);
});

test("Phase B : jump-to-file (TOC/backlinks/tags) + pinned slot → re-point du pinned", async () => {
  const { pm, repointed, selected } = pinnedRoutingFakePm({ format: "md" });
  (pm as { findTabByPath: unknown }).findTabByPath = () => null;
  const deps = makeDeps(pm);

  await navigate(deps, { type: "jump-to-file", path: "/docs/suites.md", heading: "Propriétés" });

  expect(repointed).toEqual(["p1→/docs/suites.md"]);
  expect(selected).toEqual(["p1"]);
  expect(deps.calls.setScrollTarget).toEqual(["Propriétés"]);
});

test("Phase B : journalDateClick + pinned md → la daily note re-point le pinned (jamais openFile)", async () => {
  const { pm, repointed, selected } = pinnedRoutingFakePm({ format: "md" });
  const deps = makeDeps(pm, { ensureDailyNote: async () => "/daily/2026-08-12.md" });

  await navigate(deps, { type: "journal-date-click", date: "2026-08-12" });

  expect(repointed).toEqual(["p1→/daily/2026-08-12.md"]);
  expect(selected).toEqual(["p1"]);
});

test("Phase B : oxideShowDocument + pinned md → re-point du pinned (jamais openFile)", async () => {
  const { pm, repointed, selected } = pinnedRoutingFakePm({ format: "md" });
  const deps = makeDeps(pm);

  await navigate(deps, { type: "oxide-show-document", path: "/daily/2026-08-12.md" });

  expect(repointed).toEqual(["p1→/daily/2026-08-12.md"]);
  expect(selected).toEqual(["p1"]);
});

test("cas 7 : jump-to-file (TOC/backlinks/tags) → le viewer COUPLÉ suit aussi", async () => {
  // La règle « le viewer couplé suit » vaut pour TOUTES les navigations
  // sidebar : un saut TOC/backlinks/tags (jump-to-file) ouvre l'éditeur ET
  // re-pointe le viewer couplé — même bloc que open-active. Le gating
  // « hors mode nav » est implicite : un viewer en mode nav n'a AUCUN couplage
  // (le toggle l'a libéré), donc syncCoupledViewer ne peut jamais le toucher.
  const repointed: string[] = [];
  const pm = {
    main: { activeTabId: "t1", activePath: "/docs/suites.md", tabs: [] },
    side: {
      visible: true,
      activeTabId: "s1",
      activeTab: undefined,
      tabs: [{ id: "s1", path: "/a.md", preview: true, renderMode: "preview" }],
      repoint: async (tabId: string, path: string) => {
        repointed.push(`${tabId}→${path}`);
        return { ok: true, parked: false };
      },
    },
    findTabByPath: () => null, // pas de tab main existant → openInMain (fake no-op)
    pinnedMainTab: () => null,
    openInMain: async () => {},
    sideTabLinkedTo: (mainId: string) => (mainId === "t1" ? "s1" : null),
    trackMtime: async () => {},
  } as unknown as PanelManager;
  const deps = makeDeps(pm);

  await navigate(deps, { type: "jump-to-file", path: "/docs/suites.md", heading: "Propriétés" });

  expect(repointed).toEqual(["s1→/docs/suites.md"]);
  expect(deps.calls.setScrollTarget).toEqual(["Propriétés"]);
});

// ── TOC : routage viewer (toc-navigate) ─────────────────────────────────────
// Décision utilisateur : le clic TOC remonte la cible dans le VIEWER side —
// JAMAIS l'éditeur main. Le reducer `toc-navigate` réutilise la politique
// wikilink (décision navMode/tabId FIGÉE au clic par l'émetteur — le reducer
// ne relit jamais l'état du mode nav) ; l'aide intégrée reste routée en doc.
// Cible de rendu : heading prioritaire (id immune aux décalages), sinon line
// 1-based → 0-based liée au chemin normalisé (racines de branches).

/** Faux PanelManager d'enregistrement pour toc-navigate : openInMain THROW si
 *  appelé — l'éditeur main ne doit JAMAIS être touché par ce routage. */
function recordingFakePm() {
  const links = new Map<string, string | null>();
  const calls = {
    openInSide: [] as Array<[string, Record<string, unknown> | undefined]>,
    openInMain: [] as string[],
    select: [] as string[],
    link: [] as Array<[string, string | null]>,
  };
  const pm = {
    main: { activeTabId: "t1", activePath: "/a.md", tabs: [] },
    side: {
      visible: false,
      activeTabId: "s1",
      activeTab: undefined,
      activePath: "/a.md",
      tabs: [{ id: "s1", path: "/a.md", preview: true, renderMode: "preview" }],
      select: (id: string) => void calls.select.push("side:" + id),
      repoint: async () => ({ ok: true, parked: false }),
    },
    openInSide: async (p: string, o?: Record<string, unknown>) => { calls.openInSide.push([p, o]); },
    openInMain: async () => { throw new Error("toc-navigate ne doit jamais ouvrir l'éditeur main"); },
    linkPreview: (s: string, m: string | null) => { calls.link.push([s, m]); links.set(s, m); },
    linkedEditorTabId: (s: string) => links.get(s) ?? null,
  } as unknown as PanelManager;
  return { pm, calls };
}

test("toc-navigate EN mode nav (décision figée) : IN-PLACE dans le tab source + historique", async () => {
  const { pm, calls } = recordingFakePm();
  const deps = makeDeps(pm);

  await navigate(deps, {
    type: "toc-navigate", path: "/docs/fiche.md", heading: "Propriétés", tabId: "s1", navMode: true,
  });

  // In-place dans le tab SOURCE figé : openInSide avec fallbackToActive (le
  // tab actif est re-pointé) — JAMAIS openInMain.
  expect(calls.openInSide).toEqual([["/docs/fiche.md", { preview: true, fallbackToActive: true }]]);
  expect(calls.openInMain).toHaveLength(0);
  // Le couplage du tab SOURCE est libéré (le mode nav l'a déjà libéré — idempotent).
  expect(calls.link).toEqual([["s1", null]]);
  // Historique : la page courante est poussée avant le saut (pile du tab side).
  expect(deps.calls.navPush).toEqual(["/a.md"]);
  // Cible de rendu : heading prioritaire, PAS de syncLine.
  expect(deps.calls.setScrollTarget).toEqual(["Propriétés"]);
  expect(deps.calls.setSyncLine).toHaveLength(0);
  expect(deps.calls.setJumpToLine).toHaveLength(0);
  expect(deps.calls.setEditorModeRaw).toBe(0);
});

test("toc-navigate HORS mode nav : NOUVEAU tab viewer side, JAMAIS l'éditeur main", async () => {
  const { pm, calls } = recordingFakePm();
  const deps = makeDeps(pm);

  await navigate(deps, { type: "toc-navigate", path: "/docs/fiche.md", heading: "Définition", tabId: null, navMode: false });

  expect(calls.openInSide).toEqual([["/docs/fiche.md", { preview: true, forceNew: true, silent: true }]]);
  expect(calls.openInMain).toHaveLength(0);
  expect(deps.calls.navPush).toHaveLength(0); // pas de navigation in-place → pas d'historique
  expect(deps.calls.setScrollTarget).toEqual(["Définition"]);
  expect(pm.sideVisible).toBe(true);
});

test("toc-navigate HORS mode nav, cible déjà ouverte en side : dédup → select", async () => {
  const { pm, calls } = recordingFakePm();
  pm.side.tabs = [{ id: "s1", path: "/docs/fiche.md", preview: true, renderMode: "preview" }];
  pm.side.activePath = "/docs/fiche.md";
  const deps = makeDeps(pm);

  await navigate(deps, { type: "toc-navigate", path: "/docs/fiche.md", heading: "Définition", navMode: false });

  expect(calls.select).toEqual(["side:s1"]); // dédup par chemin → sélection, pas de nouvel onglet
  expect(calls.openInSide).toHaveLength(0);
  expect(calls.openInMain).toHaveLength(0);
  expect(deps.calls.setScrollTarget).toEqual(["Définition"]);
});

test("toc-navigate racine de branche (line seule) : syncLine 1-based → 0-based liée au chemin", async () => {
  const { pm, calls } = recordingFakePm();
  const deps = makeDeps(pm);

  await navigate(deps, { type: "toc-navigate", path: "/docs/fiche.md", line: 3, tabId: null, navMode: false });

  expect(deps.calls.setScrollTarget).toHaveLength(0);
  expect(deps.calls.setSyncLine).toEqual(["/docs/fiche.md"]);
  // C'est le VIEWER qui scroll : aucune cible éditeur posée (pas de setJumpToLine,
  // pas de mode éditeur).
  expect(deps.calls.setJumpToLine).toHaveLength(0);
  expect(deps.calls.setEditorModeRaw).toBe(0);
  expect(calls.openInMain).toHaveLength(0);
});

test("toc-navigate : chemin doc → openDocArticle (jamais viewer ni éditeur)", async () => {
  const { pm, calls } = recordingFakePm();
  let docCalled: { path: string; heading?: string } | null = null;
  const deps = makeDeps(pm, {
    openDocArticle: async (p, h) => { docCalled = { path: p, heading: h }; },
  });

  await navigate(deps, {
    type: "toc-navigate", path: "/vault/.azprose/help/guide.md", heading: "Liens", tabId: "s1", navMode: true,
  });

  expect(docCalled).toEqual({ path: "/vault/.azprose/help/guide.md", heading: "Liens" });
  expect(calls.openInSide).toHaveLength(0);
  expect(calls.openInMain).toHaveLength(0);
  expect(deps.calls.setScrollTarget).toHaveLength(0);
  expect(deps.calls.setSyncLine).toHaveLength(0);
});

// ── Phase D : historique de MONTAGE du pinned slot ──────────────────────────

/** Fake PanelManager dont le pinned slot CHANGE de contenu à chaque re-point
 *  (le slot est un tab qui se re-pointe — c'est ce que l'historique suit). */
function pinnedSlotFakePm(opts: { start?: string; fail?: string } = {}) {
  const { start = "/a.md", fail } = opts;
  const slot = { id: "p1", path: start };
  const repointed: string[] = [];
  const pm = {
    main: {
      activeTabId: "t1",
      get activePath() { return slot.path; },
      tabs: [],
      repoint: async (id: string, path: string) => {
        if (fail && path === fail) return { ok: false, parked: false };
        repointed.push(`${id}→${path}`);
        slot.path = path;
        return { ok: true, parked: false };
      },
      select: () => {},
    },
    side: { visible: false, activeTabId: null, activeTab: undefined, tabs: [] },
    pinnedMainTab: (f: string) => (f === "md" ? slot : null),
    sideTabLinkedTo: () => null,
    openInMainActiveTab: async () => { throw new Error("repli libre non attendu"); },
    openInMain: async () => { throw new Error("repli libre non attendu"); },
    openInSide: async () => { throw new Error("openInSide non attendu"); },
    trackMtime: async () => {},
  } as unknown as PanelManager;
  return { pm, slot, repointed };
}

test("Phase D : chaque montage dans le slot empile le contenu QUITTÉ", async () => {
  const { pm, slot } = pinnedSlotFakePm({ start: "/a.md" });
  const deps = makeDeps(pm);

  await navigate(deps, { type: "open-active", path: "/b.md" });
  await navigate(deps, { type: "open-active", path: "/c.md" });

  expect(slot.path).toBe("/c.md");
  expect(deps.calls.pinnedPush).toEqual([
    { format: "md", path: "/a.md" },
    { format: "md", path: "/b.md" },
  ]);
});

test("Phase D : re-monter le MÊME contenu n'empile rien", async () => {
  const { pm } = pinnedSlotFakePm({ start: "/a.md" });
  const deps = makeDeps(pm);

  await navigate(deps, { type: "open-active", path: "/a.md" });

  expect(deps.calls.pinnedPush).toEqual([]);
});

test("Phase D : pinned-back remonte le contenu quitté, pinned-forward redescend", async () => {
  const { pm, slot } = pinnedSlotFakePm({ start: "/a.md" });
  const deps = makeDeps(pm);
  await navigate(deps, { type: "open-active", path: "/b.md" });

  await navigate(deps, { type: "pinned-back", format: "md" });
  expect(slot.path).toBe("/a.md");
  // Le retour n'empile PAS de nouvelle entrée de montage (c'est une navigation
  // d'historique, pas un montage neuf) — sinon la pile grossirait à l'infini.
  expect(deps.calls.pinnedPush).toEqual([{ format: "md", path: "/a.md" }]);

  await navigate(deps, { type: "pinned-forward", format: "md" });
  expect(slot.path).toBe("/b.md");
});

test("Phase D : pinned-back sans pile, ou sans slot épinglé → no-op", async () => {
  const { pm, slot, repointed } = pinnedSlotFakePm({ start: "/a.md" });
  const deps = makeDeps(pm);

  await navigate(deps, { type: "pinned-back", format: "md" });
  expect(repointed).toEqual([]);
  expect(slot.path).toBe("/a.md");

  // Format sans slot épinglé : rien ne se passe (jamais d'erreur).
  await navigate(deps, { type: "pinned-back", format: "tex" });
  expect(repointed).toEqual([]);
});

test("Phase D : échec de re-montage → pile INTACTE (retour re-jouable) + info", async () => {
  const { pm, slot } = pinnedSlotFakePm({ start: "/a.md", fail: "/a.md" });
  const deps = makeDeps(pm);
  await navigate(deps, { type: "open-active", path: "/b.md" }); // pile : [/a.md]

  await navigate(deps, { type: "pinned-back", format: "md" });

  // Le fichier /a.md n'est plus lisible : le slot n'a pas bougé, l'utilisateur
  // est informé, et l'entrée reste dans la pile (rien n'est perdu).
  expect(slot.path).toBe("/b.md");
  expect(deps.calls.notifyInfo).toHaveLength(1);
  await navigate(deps, { type: "pinned-back", format: "md" });
  expect(deps.calls.notifyInfo).toHaveLength(2);
});

test("Phase D : le viewer COMPAGNON suit le slot (D4 — sync structurelle)", async () => {
  const { pm, slot } = pinnedSlotFakePm({ start: "/a.md" });
  const sideRepointed: string[] = [];
  (pm as unknown as { sideTabLinkedTo: (id: string) => string | null }).sideTabLinkedTo = () => "s1";
  (pm as unknown as { side: unknown }).side = {
    visible: false,
    activeTabId: "s1",
    tabs: [{ id: "s1", path: "/a.md", title: "a", source: "", savedContent: "" }],
    repoint: async (id: string, path: string) => {
      sideRepointed.push(`${id}→${path}`);
      return { ok: true, parked: false };
    },
  };
  const deps = makeDeps(pm);

  await navigate(deps, { type: "open-active", path: "/b.md" });

  expect(slot.path).toBe("/b.md");
  expect(sideRepointed).toEqual(["s1→/b.md"]);
});
