
import { basename, dirname } from "./paths-utils";
import { setThemeMode, setTransparency, THEME_CHOICES, THEME_HINTS, type ThemeMode } from "./theme";
import type { Translate } from "./i18n";

export type CommandCategory =
  | "recent"
  | "file"
  | "latex"
  | "markdown"
  | "view"
  | "calendar"
  | "spreadsheet"
  | "opencode"
  | "theme"
  | "maintenance"
  | "help";

export type Command = {
  id: string;
  label: string;
  hint?: string;
  shortcut?: string;
  icon?: string;
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
  oxidNextMonday: () => void;
  oxidNextTuesday: () => void;
  oxidNextWednesday: () => void;
  oxidNextThursday: () => void;
  oxidNextFriday: () => void;
  oxidNextSaturday: () => void;
  oxidNextSunday: () => void;
  oxidLastMonday: () => void;
  oxidLastTuesday: () => void;
  oxidLastWednesday: () => void;
  oxidLastThursday: () => void;
  oxidLastFriday: () => void;
  oxidLastSaturday: () => void;
  oxidLastSunday: () => void;
  isMdActive: boolean;

  // pdf export
  exportPdf: () => void;

  // LaTeX clean
  latexCleanAux: () => void;
  latexCleanAuxAndOutput: () => void;
  latexCleanAll: () => void;
  isLatexActive: boolean;

  // Markdown editor modes
  setEditorMode: (mode: "raw" | "prose" | "preview") => void;
  startPresentation: () => void;
  startColles: () => void;
  editorMode: string;

  // LaTeX actions
  latexBuild: () => void;
  latexViewPdf: () => void;

  // View actions
  toggleConsole: () => void;
  toggleViewPanel: () => void;
  toggleTitlebar: () => void;
  openSettings: () => void;

  // Calendar
  openCalendarEditor: () => void;

  // OpenCode
  showOpenCode: () => void;

  // Journal
  openJournalCalendar: () => void;

  // SVAR Calendar (comparison)
  openSvarCalendar: () => void;

  // Backlinks
  openLinks: () => void;

  // Spreadsheet
  openSpreadsheet: () => void;

  // Calendar (persistence)
  calendarExport: () => void;
  calendarImport: () => void;

  // Maintenance
  clearCalendarCache: () => void;
};

const THEME_ICONS: Record<string, string> = {
  system: "wxi-monitor",
  latte: "wxi-sun",
  mono: "wxi-sun",
  "mono-dark": "wxi-moon",
  frappe: "wxi-moon",
  macchiato: "wxi-moon",
  mocha: "wxi-moon",
  "skarline-fleet-dark":   "wxi-moon",
  "skarline-fleet-purple": "wxi-moon",
  "skarline-fleet-light":  "wxi-sun",
  "skarline-xcode-dark":   "wxi-moon",
  "skarline-xcode-light":  "wxi-sun",
};

const THEME_COMMANDS: Array<{ mode: ThemeMode; label: string; hint: string; icon: string }> =
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
  "markdown",
  "view",
  "calendar",
  "spreadsheet",
  "opencode",
  "theme",
  "maintenance",
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
      icon: "wxi-file-text",
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
      icon: "wxi-folder-plus",
      category: "file",
      keywords: ["folder", "workspace", "library", "notes", "project"],
      action: actions.openFolder,
    },
    {
      id: "new",
      label: t("app.newFile"),
      hint: t("command.newFileHint"),
      shortcut: "⌘N",
      icon: "wxi-file-plus2",
      category: "file",
      keywords: ["new", "blank", "draft", "untitled"],
      action: actions.newFile,
    },
    {
      id: "save",
      label: t("command.save"),
      hint: actions.hasActivePath ? t("command.saveHintReady") : t("command.saveHintEmpty"),
      shortcut: "⌘S",
      icon: "wxi-save",
      category: "file",
      keywords: ["save", "write", "disk"],
      action: actions.save,
    },
    {
      id: "undo-file-op",
      label: t("command.undoFileOp"),
      hint: t("command.undoFileOpHint"),
      shortcut: "⌘⌥Z",
      icon: "wxi-undo2",
      category: "file",
      keywords: ["undo", "move", "rename", "file action"],
      action: actions.undoFileOp,
    },
    {
      id: "toggle-favorite",
      label: t("command.toggleFavorite"),
      hint: actions.currentFilePath ? t("command.toggleFavoriteHint") : t("command.toggleFavoriteHintEmpty"),
      icon: "wxi-star",
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
        icon: "wxi-file-down",
        category: "latex" as CommandCategory,
        keywords: ["latex", "build", "compile", "pdf"],
        action: actions.latexBuild,
      },
      {
        id: "latex-view-pdf",
        label: t("command.latexViewPdf"),
        hint: t("command.latexViewPdfHint"),
        icon: "wxi-eye",
        category: "latex" as CommandCategory,
        keywords: ["latex", "view", "pdf", "viewer"],
        action: actions.latexViewPdf,
      },
      {
        id: "latex-clean-aux",
        label: t("command.latexCleanAux"),
        hint: t("command.latexCleanAuxHint"),
        icon: "wxi-file-down",
        category: "latex" as CommandCategory,
        keywords: ["latex", "clean", "aux", "auxiliary"],
        action: actions.latexCleanAux,
      },
      {
        id: "latex-clean-aux-and-output",
        label: t("command.latexCleanAuxAndOutput"),
        hint: t("command.latexCleanAuxAndOutputHint"),
        icon: "wxi-file-down",
        category: "latex" as CommandCategory,
        keywords: ["latex", "clean", "aux", "output", "pdf"],
        action: actions.latexCleanAuxAndOutput,
      },
      {
        id: "latex-clean-all",
        label: t("command.latexCleanAll"),
        hint: t("command.latexCleanAllHint"),
        icon: "wxi-file-down",
        category: "latex" as CommandCategory,
        keywords: ["latex", "clean", "all"],
        action: actions.latexCleanAll,
      },
    ] : []),
    // ── Markdown (shown when .md active) ────────────────────
    ...(actions.isMdActive ? [
      {
        id: "md-raw",
        label: t("command.mdRaw"),
        hint: t("command.mdRawHint"),
        shortcut: "⌘1",
        icon: "wxi-code2",
        category: "markdown" as CommandCategory,
        keywords: ["markdown", "raw", "code", "editor mode"],
        action: () => actions.setEditorMode("raw"),
      },
      {
        id: "md-prose",
        label: t("command.mdProse"),
        hint: t("command.mdProseHint"),
        shortcut: "⌘2",
        icon: "wxi-pencil",
        category: "markdown" as CommandCategory,
        keywords: ["markdown", "prose", "writing", "editor mode"],
        action: () => actions.setEditorMode("prose"),
      },
      {
        id: "md-preview",
        label: t("command.mdPreview"),
        hint: t("command.mdPreviewHint"),
        shortcut: "⌘3",
        icon: "wxi-eye",
        category: "markdown" as CommandCategory,
        keywords: ["markdown", "preview", "view", "editor mode"],
        action: () => actions.setEditorMode("preview"),
      },
      {
        id: "md-presentation",
        label: t("command.mdPresentation"),
        hint: t("command.mdPresentationHint"),
        icon: "wxi-book-open",
        category: "markdown" as CommandCategory,
        keywords: ["markdown", "presentation", "slides", "fullscreen"],
        action: actions.startPresentation,
      },
      {
        id: "md-colle",
        label: t("command.mdColle"),
        hint: t("command.mdColleHint"),
        icon: "wxi-star",
        category: "markdown" as CommandCategory,
        keywords: ["colle", "colles", "planches", "fiche", "oral", "évaluation"],
        action: actions.startColles,
      },
      {
        id: "export-pdf",
        label: t("command.exportPdf"),
        hint: t("command.exportPdfHint"),
        shortcut: "⌘P",
        icon: "wxi-file-down",
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
      icon: actions.sidebarOpen ? "wxi-panel-left-close" : "wxi-panel-left-open",
      category: "view",
      keywords: ["sidebar", "explorer", "tree", "files"],
      action: actions.toggleSidebar,
    },
    {
      id: "toggle-console",
      label: t("command.toggleConsole"),
      hint: t("command.toggleConsoleHint"),
      shortcut: "⌘⇧C",
      icon: "wxi-panel-bottom",
      category: "view",
      keywords: ["console", "log", "terminal", "diagnostics"],
      action: actions.toggleConsole,
    },
    {
      id: "toggle-view-panel",
      label: t("command.toggleViewPanel"),
      hint: t("command.toggleViewPanelHint"),
      shortcut: "⌘\\",
      icon: "wxi-columns2",
      category: "view",
      keywords: ["panel", "side", "split", "view", "preview"],
      action: actions.toggleViewPanel,
    },
    {
      id: "toggle-titlebar",
      label: actions.sidebarOpen ? t("command.hideTitlebar") : t("command.showTitlebar"),
      hint: t("command.toggleTitlebarHint"),
      icon: "wxi-panel-left-close",
      category: "view",
      keywords: ["titlebar", "toolbar", "breadcrumb", "toggle"],
      action: actions.toggleTitlebar,
    },
    {
      id: "fullscreen",
      label: t("command.fullscreen"),
      hint: t("command.fullscreenHint"),
      shortcut: "⌃⌘F",
      icon: "wxi-monitor",
      category: "view",
      keywords: ["fullscreen", "window", "native"],
      action: actions.toggleFullscreen,
    },
    {
      id: "open-settings",
      label: t("command.openSettings"),
      hint: t("command.openSettingsHint"),
      shortcut: "⌘,",
      icon: "wxi-settings",
      category: "view",
      keywords: ["settings", "preferences", "config", "options"],
      action: actions.openSettings,
    },
    // ── Daily notes (markdown-oxide) ────────────────────────
    {
      id: "oxid-today",
      label: "Open today's daily note",
      hint: "markdown-oxide",
      icon: "wxi-sun",
      category: "view",
      keywords: ["daily", "note", "today", "journal", "diary"],
      action: actions.oxidToday,
    },
    {
      id: "oxid-yesterday",
      label: "Open yesterday's daily note",
      hint: "markdown-oxide",
      icon: "wxi-sun",
      category: "view",
      keywords: ["daily", "note", "yesterday", "journal"],
      action: actions.oxidYesterday,
    },
    {
      id: "oxid-tomorrow",
      label: "Open tomorrow's daily note",
      hint: "markdown-oxide",
      icon: "wxi-sun",
      category: "view",
      keywords: ["daily", "note", "tomorrow", "journal"],
      action: actions.oxidTomorrow,
    },
    {
      id: "oxid-jump",
      label: "Jump to daily note…",
      hint: "markdown-oxide",
      icon: "wxi-sparkles",
      category: "view",
      keywords: ["daily", "note", "jump", "date", "calendar", "navigate"],
      action: actions.oxidJump,
    },
    {
      id: "oxid-next-monday",
      label: "Open next monday's daily note",
      hint: "markdown-oxide",
      icon: "wxi-sun",
      category: "view",
      keywords: ["daily", "note", "next", "monday", "journal"],
      action: actions.oxidNextMonday,
    },
    {
      id: "oxid-next-tuesday",
      label: "Open next tuesday's daily note",
      hint: "markdown-oxide",
      icon: "wxi-sun",
      category: "view",
      keywords: ["daily", "note", "next", "tuesday", "journal"],
      action: actions.oxidNextTuesday,
    },
    {
      id: "oxid-next-wednesday",
      label: "Open next wednesday's daily note",
      hint: "markdown-oxide",
      icon: "wxi-sun",
      category: "view",
      keywords: ["daily", "note", "next", "wednesday", "journal"],
      action: actions.oxidNextWednesday,
    },
    {
      id: "oxid-next-thursday",
      label: "Open next thursday's daily note",
      hint: "markdown-oxide",
      icon: "wxi-sun",
      category: "view",
      keywords: ["daily", "note", "next", "thursday", "journal"],
      action: actions.oxidNextThursday,
    },
    {
      id: "oxid-next-friday",
      label: "Open next friday's daily note",
      hint: "markdown-oxide",
      icon: "wxi-sun",
      category: "view",
      keywords: ["daily", "note", "next", "friday", "journal"],
      action: actions.oxidNextFriday,
    },
    {
      id: "oxid-next-saturday",
      label: "Open next saturday's daily note",
      hint: "markdown-oxide",
      icon: "wxi-sun",
      category: "view",
      keywords: ["daily", "note", "next", "saturday", "journal"],
      action: actions.oxidNextSaturday,
    },
    {
      id: "oxid-next-sunday",
      label: "Open next sunday's daily note",
      hint: "markdown-oxide",
      icon: "wxi-sun",
      category: "view",
      keywords: ["daily", "note", "next", "sunday", "journal"],
      action: actions.oxidNextSunday,
    },
    {
      id: "oxid-last-monday",
      label: "Open last monday's daily note",
      hint: "markdown-oxide",
      icon: "wxi-sun",
      category: "view",
      keywords: ["daily", "note", "last", "monday", "journal"],
      action: actions.oxidLastMonday,
    },
    {
      id: "oxid-last-tuesday",
      label: "Open last tuesday's daily note",
      hint: "markdown-oxide",
      icon: "wxi-sun",
      category: "view",
      keywords: ["daily", "note", "last", "tuesday", "journal"],
      action: actions.oxidLastTuesday,
    },
    {
      id: "oxid-last-wednesday",
      label: "Open last wednesday's daily note",
      hint: "markdown-oxide",
      icon: "wxi-sun",
      category: "view",
      keywords: ["daily", "note", "last", "wednesday", "journal"],
      action: actions.oxidLastWednesday,
    },
    {
      id: "oxid-last-thursday",
      label: "Open last thursday's daily note",
      hint: "markdown-oxide",
      icon: "wxi-sun",
      category: "view",
      keywords: ["daily", "note", "last", "thursday", "journal"],
      action: actions.oxidLastThursday,
    },
    {
      id: "oxid-last-friday",
      label: "Open last friday's daily note",
      hint: "markdown-oxide",
      icon: "wxi-sun",
      category: "view",
      keywords: ["daily", "note", "last", "friday", "journal"],
      action: actions.oxidLastFriday,
    },
    {
      id: "oxid-last-saturday",
      label: "Open last saturday's daily note",
      hint: "markdown-oxide",
      icon: "wxi-sun",
      category: "view",
      keywords: ["daily", "note", "last", "saturday", "journal"],
      action: actions.oxidLastSaturday,
    },
    {
      id: "oxid-last-sunday",
      label: "Open last sunday's daily note",
      hint: "markdown-oxide",
      icon: "wxi-sun",
      category: "view",
      keywords: ["daily", "note", "last", "sunday", "journal"],
      action: actions.oxidLastSunday,
    },
    {
      id: "open-journal-calendar",
      label: "Open journal calendar",
      hint: "journal",
      icon: "wxi-calendar",
      category: "view",
      keywords: ["journal", "calendar", "daily", "note", "schedule", "events"],
      action: actions.openJournalCalendar,
    },
    {
      id: "open-svar-calendar",
      label: t("command.svarCalendar"),
      hint: "SVAR",
      icon: "wxi-calendar-clock",
      category: "view",
      keywords: ["svar", "calendar", "event", "schedule", "comparison"],
      action: actions.openSvarCalendar,
    },
    {
      id: "calendar-editor",
      label: t("command.calendarEditor"),
      hint: "calendar",
      icon: "wxi-table2",
      category: "calendar",
      keywords: ["calendar", "schedule", "event"],
      action: actions.openCalendarEditor,
    },
    // ── Links (backlinks + tags) ─────────────────────────────
    {
      id: "open-links",
      label: t("command.openLinks"),
      hint: t("command.openLinksHint"),
      icon: "wxi-link",
      category: "view",
      keywords: ["links", "liens", "backlinks", "entrants", "incoming", "tags", "références", "references"],
      action: actions.openLinks,
    },
    // ── Spreadsheet ─────────────────────────────────────────
    {
      id: "spreadsheet-new",
      label: t("command.spreadsheetNew"),
      hint: t("command.spreadsheetNewHint"),
      icon: "wxi-table",
      category: "spreadsheet",
      keywords: ["spreadsheet", "nouveau", "new", "tableur", "créer", "create"],
      action: actions.openSpreadsheet,
    },
    // ── OpenCode ────────────────────────────────────────────
    {
      id: "show-opencode",
      label: t("command.showOpenCode"),
      hint: t("command.showOpenCodeHint"),
      shortcut: "⌃⇧O",
      icon: "wxi-sparkles",
      category: "opencode",
      keywords: ["opencode", "ai", "assistant", "terminal", "agent"],
      action: actions.showOpenCode,
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
      icon: "wxi-sparkles",
      category: "theme",
      keywords: ["transparency", "vibrancy", "opacity", "glass"],
      action: () => setTransparency(74),
    },
    {
      id: "transparency-off",
      label: t("command.transparencyOff"),
      hint: t("command.transparencyOffHint"),
      icon: "wxi-sparkles",
      category: "theme",
      keywords: ["transparency", "solid", "opacity", "background"],
      action: () => setTransparency(100),
    },
    // ── Calendar ────────────────────────────────────────
    {
      id: "calendar-export",
      label: t("command.calendarExport"),
      hint: t("command.calendarExportHint"),
      icon: "wxi-file-down",
      category: "calendar",
      keywords: ["calendar", "export", "save", "ics", "ical", "snapshot"],
      action: actions.calendarExport,
    },
    {
      id: "calendar-import",
      label: t("command.calendarImport"),
      hint: t("command.calendarImportHint"),
      icon: "wxi-file-plus",
      category: "calendar",
      keywords: ["calendar", "import", "load", "ics", "ical", "restore"],
      action: actions.calendarImport,
    },
    // ── Maintenance ─────────────────────────────────────
    {
      id: "clear-calendar-cache",
      label: t("command.clearCalendarCache"),
      hint: t("command.clearCalendarCacheHint"),
      icon: "wxi-trash",
      category: "maintenance",
      keywords: ["maintenance", "cache", "calendar", "events", "clear", "reset", "wipe"],
      action: actions.clearCalendarCache,
    },
    // ── Help ────────────────────────────────────────────────
    {
      id: "help",
      label: t("command.showHelp"),
      hint: t("command.showHelpHint"),
      shortcut: "⌘/",
      icon: "wxi-circle-help",
      category: "help",
      keywords: ["help", "how to", "shortcuts", "manual"],
      action: actions.showHelp,
    },
    {
      id: "demo",
      label: t("command.demo"),
      hint: t("command.demoHint"),
      icon: "wxi-file-text",
      category: "help",
      keywords: ["demo", "welcome", "sample", "onboarding doc"],
      action: actions.loadDemo,
    },
    {
      id: "tutorial",
      label: t("command.tutorial"),
      hint: t("command.tutorialHint"),
      icon: "wxi-sparkles",
      category: "help",
      keywords: ["tutorial", "welcome", "quickstart", "onboarding"],
      action: actions.showWelcome,
    },
    {
      id: "check-updates",
      label: t("command.checkUpdates"),
      hint: t("command.checkUpdatesHint"),
      icon: "wxi-download",
      category: "help",
      keywords: ["update", "download", "version", "release"],
      action: actions.checkForUpdates,
    },
    {
      id: "about",
      label: t("command.about"),
      hint: t("command.aboutHint"),
      icon: "wxi-info",
      category: "help",
      keywords: ["about", "version", "license", "github"],
      action: actions.showAbout,
    },
  ];
}
