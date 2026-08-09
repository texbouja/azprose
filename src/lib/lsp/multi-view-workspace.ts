import { LSPPlugin, Workspace, type WorkspaceFile } from "@codemirror/lsp-client";
import type { ChangeSet, Text } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

/** The update record returned by `syncFiles` (mirrors the client type). */
export interface WorkspaceFileUpdate {
  file: WorkspaceFile;
  prevDoc: Text;
  changes: ChangeSet;
}

/**
A file that is open in the workspace, possibly held by SEVERAL editor
views at once (e.g. the same document open in the main editor and in
the side panel).
*/
class MultiViewFile implements WorkspaceFile {
  /** The views currently holding this file. */
  views: EditorView[] = [];
  /** Doc corresponding to `version`; mutated by `syncFiles`. */
  doc: Text;
  /** Version of the file; mutated by `syncFiles`. */
  version: number;

  constructor(
    readonly uri: string,
    public languageId: string,
    version: number,
    doc: Text,
    view: EditorView
  ) {
    this.version = version;
    this.doc = doc;
    this.views.push(view);
  }

  /**
  Get an active editor view for this file. When `main` is supplied
  and is one of the views holding the file, it is preferred (used by
  the client when a server-initiated change should land in the
  editor the user is looking at); otherwise the first view wins.
  */
  getView(main?: EditorView): EditorView | null {
    if (main && this.views.includes(main)) return main;
    return this.views[0] ?? null;
  }
}

/**
A workspace that supports MULTIPLE editor views on the same file.

The stock `DefaultWorkspace` throws
`"Default workspace implementation doesn't support multiple views on
the same file"` when `openFile` is called for an already-open URI —
which happens as soon as the same document is mounted in the main
editor AND in the side panel (two live `EditorView`s on one path).

This implementation keeps a view LIST per file instead of a single
view:
- `openFile` adds the view to the existing file, or creates the file
  and sends `didOpen` only on first open.
- `closeFile` removes the view; `didClose` fires only when the LAST
  view goes away.
- `syncFiles` walks every view of every file and flushes each view's
  `unsyncedChanges` exactly like the default workspace does for its
  single view. When two views of the same file changed between syncs
  the second update's `prevDoc` is the doc after the first view's
  changes; the shared ContentStore keeps the views in phase in
  practice, and the client falls back to full-doc sync for small
  documents anyway.
*/
export class MultiViewWorkspace extends Workspace {
  files: MultiViewFile[] = [];
  private fileVersions = Object.create(null) as Record<string, number>;

  private nextFileVersion(uri: string): number {
    return (this.fileVersions[uri] = (this.fileVersions[uri] ?? -1) + 1);
  }

  syncFiles(): WorkspaceFileUpdate[] {
    const result: WorkspaceFileUpdate[] = [];
    for (const file of this.files) {
      for (const view of file.views) {
        const plugin = LSPPlugin.get(view);
        if (!plugin) continue;
        const changes = plugin.unsyncedChanges;
        if (!changes.empty) {
          result.push({ changes, file, prevDoc: file.doc });
          file.doc = view.state.doc;
          file.version = this.nextFileVersion(file.uri);
          plugin.clear();
        }
      }
    }
    return result;
  }

  openFile(uri: string, languageId: string, view: EditorView): void {
    const existing = this.getFile(uri) as MultiViewFile | null;
    if (existing) {
      // Another view on the same file: just attach it. No didOpen —
      // the server already knows about the document.
      existing.languageId = languageId;
      if (!existing.views.includes(view)) existing.views.push(view);
      return;
    }
    const file = new MultiViewFile(
      uri,
      languageId,
      this.nextFileVersion(uri),
      view.state.doc,
      view
    );
    this.files.push(file);
    this.client.didOpen(file);
  }

  closeFile(uri: string, view: EditorView): void {
    const file = this.getFile(uri) as MultiViewFile | null;
    if (!file) return;
    const index = file.views.indexOf(view);
    if (index > -1) file.views.splice(index, 1);
    if (file.views.length === 0) {
      this.files = this.files.filter((f) => f !== file);
      this.client.didClose(uri);
    }
  }
}
