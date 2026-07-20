import type { IconData } from "./icons";
import {
  BookOpen,
  CircleHelp,
  Code2,
  Columns2,
  Download,
  Eye,
  FileDown,
  FilePlus2,
  FileText,
  FolderPlus,
  Info,
  Monitor,
  Moon,
  PanelBottom,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Save,
  Settings,
  Sparkles,
  Star,
  Sun,
  Undo2,
} from "./icons";
import { basename, dirname } from "./paths-utils";
import { setThemeMode, setTransparency, THEME_CHOICES, THEME_HINTS, type ThemeMode } from "./theme";
import type { Translate } from "./i18n";

export type CommandCategory =
  | "recent"
  | "file"
  | "latex"
  | "typst"
  | "markdown"
  | "view"
  | "theme"
  | "help";

export type Command = {
  id: string;
  label: string;
  hint?: string;
  shortcut?: string;
  icon?: IconData;
  category?: CommandCategory;
  keywords?: string[];
  action: () => void | Promise<void>;
};

export type CommandActions = {
  newFile: () => void;
  openFolder: () => void | Promise<void>;
  save: () => void;
  toggleSidebar: () => void;
  showHelp: () => void;
  showWelcome: () => void;
  showAbout: () => void;
  loadDemo: () => void;
  undoFileOp: () => void | Promise<void>;
  checkForUpdates: () => void | Promise<void>;

  toggleFullscreen: () => void | Promise<void>;
  openRecent: (path: string) => void;
  recentFiles: readonly string[];
  hasActivePath: boolean;
  sidebarOpen: boolean;

  toggleFavorite: () => void;
  currentFilePath: string | null;

  // oxide: daily note commands
  oxidToday: () => void;
  oxidYesterday: () => void;
  oxidTomorrow: () => void;
  oxidJump: () => void;
  isMdActive: boolean;

  // pdf export
  exportPdf: () => void;

  // Typst/LaTeX clean
  typstClean: () => void;
  typstCleanAll: () => void;
  latexCleanAux: () => void;
  latexCleanAuxAndOutput: () => void;
  latexCleanAll: () => void;
  isTypstActive: boolean;
  isLatexActive: boolean;

  // Markdown editor modes
  setEditorMode: (mode: "raw" | "prose" | "preview") => void;
  startPresentation: () => void;
  editorMode: string;

  // LaTeX actions
  latexBuild: () => void;
  latexViewPdf: () => void;

  // Typst actions
  typstBuild: () => void;
  typstLiveView: () => void;
  typstViewPdf: () => void;

  // View actions
  toggleConsole: () => void;
  toggleViewPanel: () => void;
  toggleTitlebar: () => void;
  openSettings: () => void;
};

const THEME_ICONS: Record<string, IconData> = {
  system: Monitor,
  latte: Sun,
  mono: Sun,
  "mono-dark": Moon,
  frappe: Moon,
  macchiato: Moon,
  mocha: Moon,
  "skarline-fleet-dark":   Moon,
  "skarline-fleet-purple": Moon,
  "skarline-fleet-light":  Sun,
  "skarline-xcode-dark":   Moon,
  "skarline-xcode-light":  Sun,
};

const THEME_COMMANDS: Array<{ mode: ThemeMode; label: string; hint: string; icon: IconData }> =
  THEME_CHOICES.map((theme) => ({
    mode: theme.value,
    label: theme.label,
    hint: THEME_HINTS[theme.value],
    icon: THEME_ICONS[theme.value],
  }));

export const CATEGORY_ORDER: CommandCategory[] = [
  "recent",
  "file",
  "latex",
  "typst",
  "markdown",
  "view",
  "theme",
  "help",
];

const defaultT: Translate = (key, vars) => {
  if (vars) {
    return key.replace(/\{(\w+)\}/g, (_, name: string) =>
      Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : `{${name}}`,
    );
  }
  return key;
};

export function buildCommands(actions: CommandActions, t: Translate = defaultT): Command[] {
  const recent = actions.recentFiles.slice(0, 5).map(
    (path): Command => ({
      id: `recent-${path}`,
      label: basename(path),
      hint: t("command.recentHint", { dir: dirname(path) }),
      icon: FileText,
      category: "recent",
      keywords: ["recent", "history", "open", "file"],
      action: () => actions.openRecent(path),
    }),
  );

  return [
    // ── Recent ──────────────────────────────────────────────
    ...recent,
    // ── Files ───────────────────────────────────────────────
    {
      id: "open-folder",
      label: t("command.openProject"),
      hint: t("command.openProjectHint"),
      shortcut: "⌘⇧O",
      icon: FolderPlus,
      category: "file",
      keywords: ["folder", "workspace", "library", "notes", "project"],
      action: actions.openFolder,
    },
    {
      id: "new",
      label: t("app.newFile"),
      hint: t("command.newFileHint"),
      shortcut: "⌘N",
      icon: FilePlus2,
      category: "file",
      keywords: ["new", "blank", "draft", "untitled"],
      action: actions.newFile,
    },
    {
      id: "save",
      label: t("command.save"),
      hint: actions.hasActivePath ? t("command.saveHintReady") : t("command.saveHintEmpty"),
      shortcut: "⌘S",
      icon: Save,
      category: "file",
      keywords: ["save", "write", "disk"],
      action: actions.save,
    },
    {
      id: "undo-file-op",
      label: t("command.undoFileOp"),
      hint: t("command.undoFileOpHint"),
      shortcut: "⌘⌥Z",
      icon: Undo2,
      category: "file",
      keywords: ["undo", "move", "rename", "file action"],
      action: actions.undoFileOp,
    },
    {
      id: "toggle-favorite",
      label: t("command.toggleFavorite"),
      hint: actions.currentFilePath ? t("command.toggleFavoriteHint") : t("command.toggleFavoriteHintEmpty"),
      icon: Star,
      category: "file",
      keywords: ["favorite", "star", "bookmark", "pin"],
      action: actions.toggleFavorite,
    },
    // ── LaTeX (shown when .tex active) ──────────────────────
    ...(actions.isLatexActive ? [
      {
        id: "latex-build",
        label: t("command.latexBuild"),
        hint: t("command.latexBuildHint"),
        shortcut: "⌘⌥B",
        icon: FileDown,
        category: "latex" as CommandCategory,
        keywords: ["latex", "build", "compile", "pdf"],
        action: actions.latexBuild,
      },
      {
        id: "latex-view-pdf",
        label: t("command.latexViewPdf"),
        hint: t("command.latexViewPdfHint"),
        icon: Eye,
        category: "latex" as CommandCategory,
        keywords: ["latex", "view", "pdf", "viewer"],
        action: actions.latexViewPdf,
      },
      {
        id: "latex-clean-aux",
        label: t("command.latexCleanAux"),
        hint: t("command.latexCleanAuxHint"),
        icon: FileDown,
        category: "latex" as CommandCategory,
        keywords: ["latex", "clean", "aux", "auxiliary"],
        action: actions.latexCleanAux,
      },
      {
        id: "latex-clean-aux-and-output",
        label: t("command.latexCleanAuxAndOutput"),
        hint: t("command.latexCleanAuxAndOutputHint"),
        icon: FileDown,
        category: "latex" as CommandCategory,
        keywords: ["latex", "clean", "aux", "output", "pdf"],
        action: actions.latexCleanAuxAndOutput,
      },
      {
        id: "latex-clean-all",
        label: t("command.latexCleanAll"),
        hint: t("command.latexCleanAllHint"),
        icon: FileDown,
        category: "latex" as CommandCategory,
        keywords: ["latex", "clean", "all"],
        action: actions.latexCleanAll,
      },
    ] : []),
    // ── Typst (shown when .typ active) ──────────────────────
    ...(actions.isTypstActive ? [
      {
        id: "typst-live",
        label: t("command.typstLive"),
        hint: t("command.typstLiveHint"),
        icon: Eye,
        category: "typst" as CommandCategory,
        keywords: ["typst", "live", "preview", "svg"],
        action: actions.typstLiveView,
      },
      {
        id: "typst-build",
        label: t("command.typstBuild"),
        hint: t("command.typstBuildHint"),
        shortcut: "⌘⌥B",
        icon: FileDown,
        category: "typst" as CommandCategory,
        keywords: ["typst", "build", "compile", "pdf"],
        action: actions.typstBuild,
      },
      {
        id: "typst-view-pdf",
        label: t("command.typstViewPdf"),
        hint: t("command.typstViewPdfHint"),
        icon: Eye,
        category: "typst" as CommandCategory,
        keywords: ["typst", "view", "pdf", "viewer"],
        action: actions.typstViewPdf,
      },
      {
        id: "typst-clean",
        label: t("command.typstClean"),
        hint: t("command.typstCleanHint"),
        icon: FileDown,
        category: "typst" as CommandCategory,
        keywords: ["typst", "clean", "build", "pdf"],
        action: actions.typstClean,
      },
      {
        id: "typst-clean-all",
        label: t("command.typstCleanAll"),
        hint: t("command.typstCleanAllHint"),
        icon: FileDown,
        category: "typst" as CommandCategory,
        keywords: ["typst", "clean", "all", "pdf"],
        action: actions.typstCleanAll,
      },
    ] : []),
    // ── Markdown (shown when .md active) ────────────────────
    ...(actions.isMdActive ? [
      {
        id: "md-raw",
        label: t("command.mdRaw"),
        hint: t("command.mdRawHint"),
        shortcut: "⌘1",
        icon: Code2,
        category: "markdown" as CommandCategory,
        keywords: ["markdown", "raw", "code", "editor mode"],
        action: () => actions.setEditorMode("raw"),
      },
      {
        id: "md-prose",
        label: t("command.mdProse"),
        hint: t("command.mdProseHint"),
        shortcut: "⌘2",
        icon: Pencil,
        category: "markdown" as CommandCategory,
        keywords: ["markdown", "prose", "writing", "editor mode"],
        action: () => actions.setEditorMode("prose"),
      },
      {
        id: "md-preview",
        label: t("command.mdPreview"),
        hint: t("command.mdPreviewHint"),
        shortcut: "⌘3",
        icon: Eye,
        category: "markdown" as CommandCategory,
        keywords: ["markdown", "preview", "view", "editor mode"],
        action: () => actions.setEditorMode("preview"),
      },
      {
        id: "md-presentation",
        label: t("command.mdPresentation"),
        hint: t("command.mdPresentationHint"),
        icon: BookOpen,
        category: "markdown" as CommandCategory,
        keywords: ["markdown", "presentation", "slides", "fullscreen"],
        action: actions.startPresentation,
      },
      {
        id: "export-pdf",
        label: t("command.exportPdf"),
        hint: t("command.exportPdfHint"),
        shortcut: "⌘P",
        icon: FileDown,
        category: "markdown" as CommandCategory,
        keywords: ["pdf", "export", "print", "download"],
        action: actions.exportPdf,
      },
    ] : []),
    // ── View ────────────────────────────────────────────────
    {
      id: "toggle-sidebar",
      label: actions.sidebarOpen ? t("command.hideSidebar") : t("command.showSidebar"),
      hint: t("command.sidebarHint"),
      shortcut: "⌘B",
      icon: actions.sidebarOpen ? PanelLeftClose : PanelLeftOpen,
      category: "view",
      keywords: ["sidebar", "explorer", "tree", "files"],
      action: actions.toggleSidebar,
    },
    {
      id: "toggle-console",
      label: t("command.toggleConsole"),
      hint: t("command.toggleConsoleHint"),
      shortcut: "⌘⇧C",
      icon: PanelBottom,
      category: "view",
      keywords: ["console", "log", "terminal", "diagnostics"],
      action: actions.toggleConsole,
    },
    {
      id: "toggle-view-panel",
      label: t("command.toggleViewPanel"),
      hint: t("command.toggleViewPanelHint"),
      shortcut: "⌘\\",
      icon: Columns2,
      category: "view",
      keywords: ["panel", "side", "split", "view", "preview"],
      action: actions.toggleViewPanel,
    },
    {
      id: "toggle-titlebar",
      label: actions.sidebarOpen ? t("command.hideTitlebar") : t("command.showTitlebar"),
      hint: t("command.toggleTitlebarHint"),
      icon: PanelLeftClose,
      category: "view",
      keywords: ["titlebar", "toolbar", "breadcrumb", "toggle"],
      action: actions.toggleTitlebar,
    },
    {
      id: "fullscreen",
      label: t("command.fullscreen"),
      hint: t("command.fullscreenHint"),
      shortcut: "⌃⌘F",
      icon: Monitor,
      category: "view",
      keywords: ["fullscreen", "window", "native"],
      action: actions.toggleFullscreen,
    },
    {
      id: "open-settings",
      label: t("command.openSettings"),
      hint: t("command.openSettingsHint"),
      shortcut: "⌘,",
      icon: Settings,
      category: "view",
      keywords: ["settings", "preferences", "config", "options"],
      action: actions.openSettings,
    },
    // ── Daily notes (markdown-oxide) ────────────────────────
    {
      id: "oxid-today",
      label: "Open today's daily note",
      hint: "markdown-oxide",
      icon: Sun,
      category: "view",
      keywords: ["daily", "note", "today", "journal", "diary"],
      action: actions.oxidToday,
    },
    {
      id: "oxid-yesterday",
      label: "Open yesterday's daily note",
      hint: "markdown-oxide",
      icon: Sun,
      category: "view",
      keywords: ["daily", "note", "yesterday", "journal"],
      action: actions.oxidYesterday,
    },
    {
      id: "oxid-tomorrow",
      label: "Open tomorrow's daily note",
      hint: "markdown-oxide",
      icon: Sun,
      category: "view",
      keywords: ["daily", "note", "tomorrow", "journal"],
      action: actions.oxidTomorrow,
    },
    {
      id: "oxid-jump",
      label: "Jump to daily note…",
      hint: "markdown-oxide",
      icon: Sparkles,
      category: "view",
      keywords: ["daily", "note", "jump", "date", "calendar", "navigate"],
      action: actions.oxidJump,
    },
    // ── Themes ──────────────────────────────────────────────
    ...THEME_COMMANDS.map(
      (theme): Command => ({
        id: `theme-${theme.mode}`,
        label: t("command.themePrefix", { theme: theme.label }),
        hint: theme.hint,
        icon: theme.icon,
        category: "theme",
        keywords: ["theme", "palette", "color", "appearance", theme.mode, theme.label],
        action: () => setThemeMode(theme.mode),
      }),
    ),
    {
      id: "transparency-on",
      label: t("command.transparencyOn"),
      hint: t("command.transparencyOnHint"),
      icon: Sparkles,
      category: "theme",
      keywords: ["transparency", "vibrancy", "opacity", "glass"],
      action: () => setTransparency(74),
    },
    {
      id: "transparency-off",
      label: t("command.transparencyOff"),
      hint: t("command.transparencyOffHint"),
      icon: Sparkles,
      category: "theme",
      keywords: ["transparency", "solid", "opacity", "background"],
      action: () => setTransparency(100),
    },
    // ── Help ────────────────────────────────────────────────
    {
      id: "help",
      label: t("command.showHelp"),
      hint: t("command.showHelpHint"),
      shortcut: "⌘/",
      icon: CircleHelp,
      category: "help",
      keywords: ["help", "how to", "shortcuts", "manual"],
      action: actions.showHelp,
    },
    {
      id: "demo",
      label: t("command.demo"),
      hint: t("command.demoHint"),
      icon: FileText,
      category: "help",
      keywords: ["demo", "welcome", "sample", "onboarding doc"],
      action: actions.loadDemo,
    },
    {
      id: "tutorial",
      label: t("command.tutorial"),
      hint: t("command.tutorialHint"),
      icon: Sparkles,
      category: "help",
      keywords: ["tutorial", "welcome", "quickstart", "onboarding"],
      action: actions.showWelcome,
    },
    {
      id: "check-updates",
      label: t("command.checkUpdates"),
      hint: t("command.checkUpdatesHint"),
      icon: Download,
      category: "help",
      keywords: ["update", "download", "version", "release"],
      action: actions.checkForUpdates,
    },
    {
      id: "about",
      label: t("command.about"),
      hint: t("command.aboutHint"),
      icon: Info,
      category: "help",
      keywords: ["about", "version", "license", "github"],
      action: actions.showAbout,
    },
  ];
}
