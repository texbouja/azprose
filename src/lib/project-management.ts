import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { pickFolder } from "@/lib/files"; // statique : @/lib/files est déjà chargé en eager (app.svelte)
import { isImagePath, isPdfPath, basename } from "@/lib";
import { exportMarkdownPdf } from "@/lib/pdf-export";
import { folderRelation } from "@/lib/paths";
import { saveDraft } from "@/lib/session";
import { ouvrirCoffre, ajouterInvite, retirerDuPerimetre, racine } from "@/lib/vault.svelte";
import type { PanelManager } from "@/lib/panel-manager";
import type { FileOpsManager } from "@/lib/file-operations.svelte";

// La racine et les dossiers invités ne figurent PLUS dans ces dépendances : ils
// se lisent et se posent par `lib/vault.svelte.ts`, autorité unique. Les passer
// en paramètre, c'était offrir un second chemin d'écriture — celui-là même par
// lequel la racine changeait en cours de vie de la fenêtre.
export interface ProjectManagementDeps {
  pm: PanelManager
  fo: Pick<FileOpsManager, "favorites">
  sideVisible: boolean
  setSideVisible: (v: boolean) => void
  tabs: { path: string; source: string; savedContent: string }[]
  openFileInTab: (path: string, opts?: { silent?: boolean; preferDraft?: boolean; preview?: boolean; sourceType?: "latex" }) => Promise<void>
  findTabByPath: (path: string) => { id: string; panel: string } | undefined
  skipCloseConfirm: { current: boolean }
  saveSessionNow: () => void
  notify: { setLoadError: (err: { title: string; message: string }) => void; setInfo: (msg: string) => void }
  t: (key: string, params?: Record<string, string>) => string
}

export function spawnProjectWindow(folder: string) {
  const label = `azprose-project-${Date.now()}`;
  return new WebviewWindow(label, {
    url: `index.html?root=${encodeURIComponent(folder)}`,
    title: `AZprose — ${basename(folder)}`,
    width: 1280,
    height: 860,
  });
}

export async function handleAddFolder(_ctx: ProjectManagementDeps) {
  const folder = await pickFolder();
  // `ajouterInvite` porte la règle « sans projet ouvert, le dossier DEVIENT le
  // projet » et la persistance des invités (clé scopée) : plus de liste globale
  // à recomposer ici, ni de `setSessionScope` en marge de l'autorité.
  if (folder) ajouterInvite(folder);
}

export async function handleOpenProjectByPath(ctx: ProjectManagementDeps, folder: string) {
  const existing = await invoke<string | null>("find_project_window", { path: folder });
  if (existing) {
    const win = await WebviewWindow.getByLabel(existing);
    if (win) {
      await win.show();
      await win.unminimize();
      await win.setFocus();
      return;
    }
  }

  const courante = racine();
  if (courante) {
    const rel = folderRelation(folder, courante);
    if (rel === "same") return;
    if (rel === "nested") {
      const ok = await confirm(ctx.t("project.warnCloseFolder"), { title: "", kind: "warning" });
      if (!ok) return;
      spawnProjectWindow(folder);
      if (getCurrentWindow().label.startsWith("azprose-project-")) {
        ctx.skipCloseConfirm.current = true;
        await getCurrentWindow().close();
      }
      return;
    }
    // Une fenêtre déjà ouverte sur un projet n'en change JAMAIS : un autre
    // projet ouvre une autre fenêtre (invariant d'immuabilité, cf. vault).
    spawnProjectWindow(folder);
  } else {
    ouvrirCoffre(folder);
  }
}

export async function handleInitProject(ctx: ProjectManagementDeps) {
  const folder = await pickFolder();
  if (!folder) return;
  const name = basename(folder);
  await invoke("add_project", { name, path: folder });
  await handleOpenProjectByPath(ctx, folder);
}

export async function handleCloseFolder(ctx: ProjectManagementDeps, path: string) {
  const folderTabs = ctx.pm.main.tabs.filter((t: { path: string }) => t.path.startsWith(path + "/"));
  const dirtyTabs = folderTabs.filter((t: { path: string; source: string; savedContent: string }) => !isPdfPath(t.path) && !isImagePath(t.path) && t.source !== t.savedContent);
  if (dirtyTabs.length > 0) {
    const ok = await confirm(ctx.t("tabs.closeUnsavedFolder"), { title: "", kind: "warning" });
    if (!ok) return;
  }
  for (const tab of folderTabs) {
    if (!isPdfPath(tab.path) && !isImagePath(tab.path) && tab.source !== tab.savedContent) {
      saveDraft(tab.path, tab.source);
    }
  }
  for (const tab of folderTabs) {
    // R4 (Phase C) : fermer un éditeur épinglé emporte le viewer de sa sphère.
    ctx.pm.closeMainTab(tab.id);
  }
  // Retirer la RACINE ferme le projet et ramène à la porte, au lieu de
  // promouvoir un invité en racine : cette promotion re-scopait tout l'état de
  // la fenêtre (session, brouillons, invités, base) sans que rien ne le dise.
  retirerDuPerimetre(path);
  ctx.saveSessionNow();
}

export async function handleExportPdf(ctx: {
  pm: PanelManager;
  activePath: string | null;
  extFromPath: (p: string) => string | null;
  themeResolved: string;
  notify: { setInfo: (msg: string) => void };
  t: (key: string, params?: Record<string, string>) => string;
}) {
  if (!ctx.activePath || ctx.extFromPath(ctx.activePath) !== "md") return;
  const tab = ctx.pm.main.tabs.find(t => t.id === ctx.pm.main.activeTabId);
  if (!tab || !tab.source) return;
  try {
    const out = await exportMarkdownPdf(tab.source, ctx.themeResolved, tab.path);
    if (out) ctx.notify.setInfo(ctx.t("pdf.exported", { path: out }));
  } catch (err) {
    console.error("PDF export failed:", err);
  }
}
