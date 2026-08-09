import { expect, test } from "bun:test";
import {
  createPhaseMachine,
  type PhaseDef,
} from "../src/lib/phase-machine";

// Machine du dialogue d'envoi des colles (ColleSendDialog) — alphabet complet
// du flux réel : idle → loading → ready, puis branches préparer/envoyer,
// archiver, preview, erreurs.
type SendPhase =
  | "idle"
  | "loading"
  | "ready"
  | "preparing"
  | "archiving"
  | "sending"
  | "done"
  | "error"
  | "preview";
type SendEvent =
  | "open"
  | "parsed"
  | "failed"
  | "send"
  | "prepared"
  | "sent"
  | "retry"
  | "clear"
  | "archive"
  | "archived"
  | "cancelled"
  | "preview"
  | "closePreview";

const SEND_PHASES: readonly PhaseDef<SendPhase, SendEvent>[] = [
  { name: "idle", on: { open: "loading" } },
  { name: "loading", on: { parsed: "ready", failed: "error" } },
  {
    name: "ready",
    on: { send: "preparing", archive: "archiving", preview: "preview", failed: "error" },
  },
  { name: "preparing", on: { prepared: "sending", cancelled: "ready", failed: "error" } },
  { name: "archiving", on: { archived: "ready", cancelled: "ready", failed: "error" } },
  { name: "sending", on: { sent: "done", failed: "error" } },
  { name: "done", on: { retry: "sending", clear: "ready", failed: "error" } },
  { name: "error", on: {} },
  { name: "preview", on: { closePreview: "ready", failed: "error" } },
];

test("cycle complet de l'envoi (open → … → done)", () => {
  const m = createPhaseMachine(SEND_PHASES, { initial: "idle" });
  expect(m.current).toBe("idle");
  expect(m.send("open")).toBe(true); // idle → loading
  expect(m.current).toBe("loading");
  expect(m.send("parsed")).toBe(true); // loading → ready
  expect(m.current).toBe("ready");
  expect(m.send("send")).toBe(true); // ready → preparing
  expect(m.current).toBe("preparing");
  expect(m.send("prepared")).toBe(true); // preparing → sending
  expect(m.current).toBe("sending");
  expect(m.send("sent")).toBe(true); // sending → done
  expect(m.current).toBe("done");
});

test("événement hors alphabet = ignoré (fini l'état poubelle)", () => {
  const m = createPhaseMachine(SEND_PHASES, { initial: "idle" });
  // `send` (démarrer un envoi) n'est accepté QUE depuis ready.
  expect(m.send("send")).toBe(false);
  expect(m.current).toBe("idle");
  m.send("open");
  // `sent` n'est pas accepté pendant loading.
  expect(m.send("sent")).toBe(false);
  expect(m.current).toBe("loading");
});

test("double-déclenchement protégé : le 2ᵉ événement est ignoré", () => {
  const m = createPhaseMachine(SEND_PHASES, { initial: "idle" });
  m.send("open");
  m.send("parsed");
  expect(m.current).toBe("ready");
  // Double-clic sur Envoyer : le 1er transite, le 2ᵉ est ignoré (préparing
  // n'accepte pas `send`).
  expect(m.send("send")).toBe(true);
  expect(m.send("send")).toBe(false);
  expect(m.current).toBe("preparing");
});

test("branche erreur : chaque phase de travail accepte failed → error", () => {
  // Route (depuis loading) vers chaque phase de travail.
  const route: Record<SendPhase, SendEvent[]> = {
    ready: ["parsed"],
    preparing: ["parsed", "send"],
    archiving: ["parsed", "archive"],
    sending: ["parsed", "send", "prepared"],
    done: ["parsed", "send", "prepared", "sent"],
    idle: [],
    loading: [],
    error: [],
    preview: [],
  };
  for (const from of ["ready", "preparing", "archiving", "sending", "done"] as const) {
    const m = createPhaseMachine(SEND_PHASES, { initial: "idle" });
    m.send("open");
    for (const ev of route[from]) {
      expect(m.send(ev)).toBe(true);
    }
    expect(m.current).toBe(from);
    expect(m.send("failed")).toBe(true);
    expect(m.current).toBe("error");
    // L'état poubelle est absorbant : plus rien n'entre.
    expect(m.send("send")).toBe(false);
    expect(m.send("parsed")).toBe(false);
    expect(m.current).toBe("error");
  }
});

test("branches annulation (preparing/archiving → ready)", () => {
  const m = createPhaseMachine(SEND_PHASES, { initial: "idle" });
  m.send("open");
  m.send("parsed");
  m.send("archive");
  expect(m.current).toBe("archiving");
  expect(m.send("cancelled")).toBe(true);
  expect(m.current).toBe("ready");
});

test("branche preview : fermeture → ready", () => {
  const m = createPhaseMachine(SEND_PHASES, { initial: "idle" });
  m.send("open");
  m.send("parsed");
  m.send("preview");
  expect(m.current).toBe("preview");
  expect(m.send("closePreview")).toBe(true);
  expect(m.current).toBe("ready");
});

test("branche retry (done → sending si échecs, → ready sinon)", () => {
  const m = createPhaseMachine(SEND_PHASES, { initial: "idle" });
  m.send("open");
  m.send("parsed");
  m.send("send");
  m.send("prepared");
  m.send("sent");
  expect(m.current).toBe("done");
  expect(m.send("retry")).toBe(true);
  expect(m.current).toBe("sending");
  m.send("sent");
  expect(m.current).toBe("done");
  expect(m.send("clear")).toBe(true);
  expect(m.current).toBe("ready");
});

test("accepts() : question sans transition", () => {
  const m = createPhaseMachine(SEND_PHASES, { initial: "idle" });
  expect(m.accepts("open")).toBe(true);
  expect(m.accepts("send")).toBe(false);
  m.send("open");
  expect(m.accepts("open")).toBe(false);
  expect(m.accepts("parsed")).toBe(true);
});

test("is(...) : appartenance multiple (busy)", () => {
  const m = createPhaseMachine(SEND_PHASES, { initial: "idle" });
  expect(m.is("sending", "preparing", "archiving")).toBe(false);
  m.send("open");
  m.send("parsed");
  m.send("send");
  expect(m.is("sending", "preparing", "archiving")).toBe(true);
  expect(m.is("ready")).toBe(false);
});

test("reset : transition inconditionnelle (cycle de vie)", () => {
  const m = createPhaseMachine(SEND_PHASES, { initial: "idle" });
  m.send("open");
  m.send("parsed");
  m.send("preview");
  m.reset("idle"); // fermeture du dialogue
  expect(m.current).toBe("idle");
  expect(m.send("open")).toBe(true); // réouverture
  expect(m.current).toBe("loading");
});

test("setup : destination inconnue → erreur immédiate", () => {
  expect(() =>
    createPhaseMachine(
      [
        { name: "idle", on: { open: "loading" } },
        { name: "loading", on: { parsed: "nowhere" } }, // typo
      ],
      { initial: "idle" },
    ),
  ).toThrow(/phase inconnue "nowhere"/);
});

// Machine de l'overlay Print (PrintOverlay) : flux complet réel.
type PrintPhase =
  | "idle"
  | "loading"
  | "ready"
  | "previewing"
  | "exporting"
  | "done"
  | "error";
type PrintEvent =
  | "open"
  | "loaded"
  | "empty"
  | "preview"
  | "previewed"
  | "failed"
  | "export"
  | "exported"
  | "cancelled";

const PRINT_PHASES: readonly PhaseDef<PrintPhase, PrintEvent>[] = [
  { name: "idle", on: { open: "loading" } },
  { name: "loading", on: { loaded: "ready", empty: "error" } },
  { name: "ready", on: { preview: "previewing", export: "exporting" } },
  { name: "previewing", on: { previewed: "ready", failed: "error" } },
  { name: "exporting", on: { exported: "done", cancelled: "ready", failed: "error" } },
  { name: "done", on: {} },
  { name: "error", on: {} },
];

test("PrintOverlay : aperçu puis export annulé puis export réussi", () => {
  const m = createPhaseMachine(PRINT_PHASES, { initial: "idle" });
  m.send("open");
  m.send("loaded");
  expect(m.current).toBe("ready");
  expect(m.send("preview")).toBe(true);
  expect(m.current).toBe("previewing");
  expect(m.send("previewed")).toBe(true);
  expect(m.current).toBe("ready");
  expect(m.send("export")).toBe(true);
  expect(m.current).toBe("exporting");
  expect(m.send("cancelled")).toBe(true); // dialogue de destination annulé
  expect(m.current).toBe("ready");
  expect(m.send("export")).toBe(true);
  expect(m.send("exported")).toBe(true);
  expect(m.current).toBe("done");
});

test("PrintOverlay : planches vides → error, absorbant", () => {
  const m = createPhaseMachine(PRINT_PHASES, { initial: "idle" });
  m.send("open");
  expect(m.send("empty")).toBe(true);
  expect(m.current).toBe("error");
  expect(m.send("preview")).toBe(false);
  expect(m.current).toBe("error");
});

// Machine de rechargement DataFilterGrid : `loading|ready` (la garde
// tooManyReloads reste un filet externe — la machine empêche le chevauchement).
type GridPhase = "idle" | "loading" | "ready";
type GridEvent = "load" | "loaded" | "failed";

const GRID_PHASES: readonly PhaseDef<GridPhase, GridEvent>[] = [
  { name: "idle", on: { load: "loading" } },
  { name: "loading", on: { loaded: "ready", failed: "ready" } },
  { name: "ready", on: { load: "loading" } },
];

test("DataFilterGrid : load pendant un load = ignoré (pas de requête en double)", () => {
  const m = createPhaseMachine(GRID_PHASES, { initial: "idle" });
  expect(m.send("load")).toBe(true);
  expect(m.current).toBe("loading");
  expect(m.send("load")).toBe(false); // notification pendant le chargement
  expect(m.current).toBe("loading");
  expect(m.send("loaded")).toBe(true);
  expect(m.current).toBe("ready");
  expect(m.send("load")).toBe(true);
  expect(m.send("failed")).toBe(true); // erreur → la carte reste prête
  expect(m.current).toBe("ready");
});
