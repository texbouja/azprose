import { PanelState, type Tab, type TabSource } from "./panel-store";

export type LayoutMode = "main" | "main+side";

export type PanelManagerSession = {
  main: ReturnType<PanelState["toJSON"]>;
  side: ReturnType<PanelState["toJSON"]>;
  layout: LayoutMode;
  splitRatio: number;
};

export class PanelManager {
  main: PanelState;
  side: PanelState;
  layout: LayoutMode = "main";
  splitRatio = 0.55;

  constructor(opts?: {
    onSessionChange?: (data: PanelManagerSession) => void;
    onFileOpen?: (path: string) => void;
    onError?: (title: string, message: string) => void;
  }) {
    const pm = this;
    this.main = new PanelState("main", {
      onFileOpen: opts?.onFileOpen,
      onSessionChange: opts?.onSessionChange ? () => opts.onSessionChange!(pm.toJSON()) : undefined,
    });
    this.side = new PanelState("side", {
      onFileOpen: opts?.onFileOpen,
      onError: opts?.onError,
      onSessionChange: opts?.onSessionChange ? () => opts.onSessionChange!(pm.toJSON()) : undefined,
    });
  }

  get sideVisible(): boolean {
    return this.side.visible;
  }

  set sideVisible(v: boolean) {
    this.side.visible = v;
    this.layout = v ? "main+side" : "main";
  }

  openInMain(path: string, opts?: { preferDraft?: boolean; silent?: boolean; preview?: boolean; sourceType?: TabSource }): Promise<void> {
    return this.main.open(path, opts);
  }

  openInSide(path: string, opts?: { preferDraft?: boolean; silent?: boolean; preview?: boolean; sourceType?: TabSource }): Promise<void> {
    this.side.visible = true;
    this.layout = "main+side";
    return this.side.open(path, opts);
  }

  findTabByPath(path: string): { panel: "main" | "side"; tab: Tab } | null {
    const norm = (p: string) => p.split("/").filter(s => s !== ".").join("/");
    const target = norm(path);
    for (const panel of [this.main, this.side]) {
      const tab = panel.tabs.find(t => norm(t.path) === target);
      if (tab) return { panel: panel.id as "main" | "side", tab };
    }
    return null;
  }

  saveAllDrafts(): void {
    this.main.saveDrafts();
    this.side.saveDrafts();
  }

  toJSON(): PanelManagerSession {
    return {
      main: this.main.toJSON(),
      side: this.side.toJSON(),
      layout: this.layout,
      splitRatio: this.splitRatio,
    };
  }

  fromJSON(data: PanelManagerSession): void {
    this.main.fromJSON(data.main);
    this.side.fromJSON(data.side);
    this.layout = data.layout ?? "main";
    this.splitRatio = data.splitRatio ?? 0.55;
    this.side.visible = data.layout === "main+side";
  }

  async restoreContent(preferDraft?: boolean): Promise<void> {
    await Promise.all([
      this.main.restoreContent(preferDraft),
      this.side.restoreContent(preferDraft),
    ]);
  }
}
