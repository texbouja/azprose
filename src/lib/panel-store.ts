import { basename, isOpenablePath, isPdfPath, isImagePath } from "@/lib";
import { readMarkdown, writeMarkdown } from "@/lib/files";
import { saveDraft, loadDraft, clearDraft } from "@/lib/session";

export type RenderMode = "raw" | "prose" | "preview" | "presentation";

export type Tab = {
  id: string;
  title: string;
  path: string;
  source: string;
  savedContent: string;
  preview?: boolean;
  renderMode?: RenderMode;
};

export type PanelSessionData = {
  tabs: { path: string; title: string; renderMode?: RenderMode }[];
  activePath: string | null;
};

export type PanelCallbacks = {
  onSessionChange?: (data: PanelSessionData) => void;
  onFileOpen?: (path: string) => void;
  onError?: (title: string, message: string) => void;
};

export class PanelState {
  readonly id: string;
  visible: boolean = true;
  tabs: Tab[] = [];
  activeTabId: string | null = null;
  private cbs: PanelCallbacks;

  constructor(id: string, callbacks: PanelCallbacks = {}) {
    this.id = id;
    this.cbs = callbacks;
  }

  get activeTab(): Tab | undefined {
    return this.tabs.find(t => t.id === this.activeTabId);
  }

  get activePath(): string | null {
    return this.activeTab?.path ?? null;
  }

  get source(): string {
    return this.activeTab?.source ?? "";
  }

  get savedContent(): string {
    return this.activeTab?.savedContent ?? "";
  }

  private notify(): void {
    this.cbs.onSessionChange?.(this.toJSON());
  }

  async open(path: string, opts?: { preferDraft?: boolean; silent?: boolean; preview?: boolean }): Promise<void> {
    if (!isOpenablePath(path)) {
      if (!opts?.silent) {
        this.cbs.onError?.("Format", `unsupported format: ${basename(path)}`);
      }
      return;
    }
    const wantPreview = opts?.preview === true;
    const existing = this.tabs.find(t => t.path === path);
    if (existing) {
      this.activeTabId = existing.id;
      if (!wantPreview && existing.preview) {
        this.tabs = this.tabs.map(t => t.id === existing.id ? { ...t, preview: false } : t);
      }
      this.notify();
      return;
    }

    const reuse = wantPreview ? this.tabs.find(t => t.preview) : undefined;
    const title = basename(path);
    const id = reuse?.id ?? crypto.randomUUID();
    if (reuse) {
      this.tabs = this.tabs.map(t => t.id === id ? { ...t, path, title, source: "", savedContent: "", preview: true } : t);
    } else {
      this.tabs = [...this.tabs, { id, title, path, source: "", savedContent: "", preview: wantPreview }];
    }
    this.activeTabId = id;

    if (!isPdfPath(path) && !isImagePath(path)) {
      try {
        const fileSource = await readMarkdown(path);
        const draft = opts?.preferDraft ? loadDraft(path) : null;
        const content = (draft !== null && draft !== fileSource) ? draft : fileSource;
        this.tabs = this.tabs.map(t => t.id === id ? { ...t, source: content, savedContent: fileSource } : t);
      } catch (err) {
        this.tabs = this.tabs.filter(t => t.id !== id);
        if (this.activeTabId === id) {
          this.activeTabId = this.tabs[this.tabs.length - 1]?.id ?? null;
        }
        if (!opts?.silent) throw err;
        return;
      }
    }

    this.cbs.onFileOpen?.(path);
    this.notify();
  }

  close(tabId: string): void {
    const idx = this.tabs.findIndex(t => t.id === tabId);
    if (idx === -1) return;
    const tab = this.tabs[idx];
    if (!isPdfPath(tab.path) && !isImagePath(tab.path) && tab.source !== tab.savedContent) {
      saveDraft(tab.path, tab.source);
    }
    this.tabs = this.tabs.filter(t => t.id !== tabId);
    if (this.activeTabId === tabId) {
      const next = this.tabs[Math.min(idx, this.tabs.length - 1)];
      this.activeTabId = next?.id ?? null;
    }
    this.notify();
  }

  select(tabId: string): void {
    this.activeTabId = tabId;
    this.notify();
  }

  reorder(from: number, to: number): void {
    const next = [...this.tabs];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    this.tabs = next;
    this.notify();
  }

  setSource(next: string): void {
    const tab = this.activeTab;
    if (!tab) return;
    this.tabs = this.tabs.map(t => t.id === tab.id ? { ...t, source: next } : t);
  }

  setTabSource(tabId: string, next: string): void {
    this.tabs = this.tabs.map(t => t.id === tabId ? { ...t, source: next } : t);
  }

  setRenderMode(tabId: string, mode: RenderMode): void {
    this.tabs = this.tabs.map(t => t.id === tabId ? { ...t, renderMode: mode } : t);
  }

  async save(): Promise<void> {
    const tab = this.activeTab;
    if (!tab || tab.source === tab.savedContent) return;
    try {
      await writeMarkdown(tab.path, tab.source);
      this.tabs = this.tabs.map(t => t.id === tab.id ? { ...t, savedContent: tab.source } : t);
      clearDraft(tab.path);
    } catch (err) {
      console.error(`panel ${this.id}: save failed`, err);
      throw err;
    }
  }

  saveDrafts(): void {
    for (const tab of this.tabs) {
      if (!isPdfPath(tab.path) && !isImagePath(tab.path) && tab.source !== tab.savedContent) {
        saveDraft(tab.path, tab.source);
      }
    }
  }

  toJSON(): PanelSessionData {
    return {
      tabs: this.tabs.map(t => ({ path: t.path, title: t.title, renderMode: t.renderMode })),
      activePath: this.activePath,
    };
  }

  fromJSON(data: PanelSessionData): void {
    this.tabs = data.tabs.map(t => ({
      id: crypto.randomUUID(),
      path: t.path,
      title: t.title,
      source: "",
      savedContent: "",
      renderMode: t.renderMode,
    }));
    if (data.activePath) {
      const tab = this.tabs.find(t => t.path === data.activePath);
      this.activeTabId = tab?.id ?? this.tabs[0]?.id ?? null;
    }
  }

  async restoreContent(preferDraft?: boolean): Promise<void> {
    const toRemove: string[] = [];
    for (const tab of this.tabs) {
      try {
        const fileSource = await readMarkdown(tab.path);
        const draft = preferDraft ? loadDraft(tab.path) : null;
        const content = (draft !== null && draft !== fileSource) ? draft : fileSource;
        this.tabs = this.tabs.map(t => t.id === tab.id ? { ...t, source: content, savedContent: fileSource } : t);
      } catch {
        toRemove.push(tab.id);
      }
    }
    if (toRemove.length > 0) {
      this.tabs = this.tabs.filter(t => !toRemove.includes(t.id));
      if (this.activeTabId && toRemove.includes(this.activeTabId)) {
        this.activeTabId = this.tabs[0]?.id ?? null;
      }
    }
  }
}
