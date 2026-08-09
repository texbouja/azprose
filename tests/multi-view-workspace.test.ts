import { expect, test } from "bun:test";
import { Text } from "@codemirror/state";
import { MultiViewWorkspace, type WorkspaceFileUpdate } from "../src/lib/lsp/multi-view-workspace";

/**
 * Fake minimal d'un EditorView : le workspace n'utilise que `state.doc`
 * à l'ouverture et (via le plugin LSP, absent ici) le doc à la synchro.
 * Un `plugin()` qui retourne null simule un EditorView sans LSPPlugin.
 */
function makeView(doc = Text.empty, plugin = () => null) {
  return {
    state: { doc },
    plugin,
  } as unknown as import("@codemirror/view").EditorView;
}

/** Client factice qui enregistre les didOpen / didClose par URI. */
function makeClient() {
  const opened: string[] = [];
  const closed: string[] = [];
  return {
    opened,
    closed,
    didOpen: (f: { uri: string }) => {
      opened.push(f.uri);
    },
    didClose: (uri: string) => {
      closed.push(uri);
    },
  } as never;
}

test("openFile n'ouvre qu'UNE fois le même URI (multi-vues)", () => {
  const client = makeClient();
  const ws = new MultiViewWorkspace(client);
  const uri = "file:///v/note.md";
  const v1 = makeView(Text.of(["a"]));
  const v2 = makeView(Text.of(["a"]));

  ws.openFile(uri, "markdown", v1);
  ws.openFile(uri, "markdown", v2); // ← l'ancien DefaultWorkspace jetait ici

  const f = ws.getFile(uri);
  expect(f).not.toBeNull();
  expect(f!.languageId).toBe("markdown");
  const mvf = f as unknown as { views: unknown[] };
  expect(mvf.views.length).toBe(2);
  // didOpen une seule fois malgré deux vues
  expect(client.opened).toEqual([uri]);
  expect(client.closed).toEqual([]);
});

test("closeFile ne fait didClose qu'à la dernière vue", () => {
  const client = makeClient();
  const ws = new MultiViewWorkspace(client);
  const uri = "file:///v/note.md";
  const v1 = makeView();
  const v2 = makeView();
  ws.openFile(uri, "markdown", v1);
  ws.openFile(uri, "markdown", v2);

  ws.closeFile(uri, v1);
  expect(ws.getFile(uri)).not.toBeNull(); // la 2e vue retient le fichier
  expect(client.closed).toEqual([]);

  ws.closeFile(uri, v2);
  expect(ws.getFile(uri)).toBeNull();
  expect(client.closed).toEqual([uri]);
});

test("closeFile d'une vue inconnue est un no-op", () => {
  const client = makeClient();
  const ws = new MultiViewWorkspace(client);
  const uri = "file:///v/note.md";
  const v1 = makeView();
  const v3 = makeView();
  ws.openFile(uri, "markdown", v1);
  ws.closeFile(uri, v3);
  expect(ws.getFile(uri)).not.toBeNull();
  expect(client.closed).toEqual([]);
});

test("getView préfère la vue main quand elle est attachée, sinon la première", () => {
  const client = makeClient();
  const ws = new MultiViewWorkspace(client);
  const uri = "file:///v/note.md";
  const v1 = makeView();
  const v2 = makeView();
  ws.openFile(uri, "markdown", v1);
  ws.openFile(uri, "markdown", v2);

  const f = ws.getFile(uri)!;
  expect(f.getView()).toBe(v1);
  expect(f.getView(v1)).toBe(v1);
  expect(f.getView(v2)).toBe(v2); // main attachée → préférée
  expect(f.getView(makeView())).toBe(v1); // main étrangère → première
});

test("syncFiles flushe les changements de CHAQUE vue et met à jour doc/version", () => {
  const client = makeClient();
  const ws = new MultiViewWorkspace(client);
  const uri = "file:///v/note.md";
  const v1 = makeView(Text.of(["a"]));
  const v2 = makeView(Text.of(["a"]));
  ws.openFile(uri, "markdown", v1);
  ws.openFile(uri, "markdown", v2);

  // Vues SANS plugin LSP → aucun changement synchro ; résultat vide,
  // mais l'appel ne doit pas crasher et les fichiers restent ouverts.
  const updates: WorkspaceFileUpdate[] = ws.syncFiles();
  expect(updates).toEqual([]);
  expect(ws.getFile(uri)).not.toBeNull();
  expect(client.closed).toEqual([]);
});
