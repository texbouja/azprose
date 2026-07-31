# AZprose Project Context

## What is an AZprose project

An AZprose project is a **vault** — a directory of files managed by AZprose, a desktop Markdown/LaTeX editor with Obsidian-compatible features. The project is just files on disk; there is no build step or framework visible to the user.

## File Types

| Extension | Type | Notes |
|-----------|------|-------|
| `.md` | Markdown | Obsidian-compatible: `[[wikilinks]]`, `> [!callout]`, `#tags`, `![[transclusion]]`, `^[footnotes]` |
| `.tex` | LaTeX | With LSP (completion, diagnostics). Root detected by `\documentclass` or marker files |
| `.pdf` | PDF | With region selection (`Alt+drag`), wikilink embeds `![[file.pdf#page=N&rect=x,y,w,h]]` |
| `.csv` | Spreadsheet | Rendered as jspreadsheet grid with formulas (`=SUM()`, `=AVERAGE()`, etc.) |

## Markdown Conventions (Obsidian-compatible)

```markdown
[[page]]                    → wikilink to another note
[[page|alias]]              → wikilink with display text
[[page#heading]]            → link to heading
![[page]]                   → transclusion (embed content)
![[page#heading]]           → embed specific heading
#tag                        → hashtag (styled link)
> [!note]                   → callout block
> [!warning]+               → collapsible callout
[^1]                        → footnote reference
^[inline footnote]          → inline footnote
```

## Project Data: `.azprose/`

The `.azprose/` directory stores project-specific data:

```
.azprose/
├── config.json              # Project settings (editor, themes, math, etc.)
├── session.json             # Portable session mirror (open tabs, panels)
├── data.db                  # Shared SQLite database (calendar events, spreadsheets)
├── csv-cache/               # Spreadsheet rendering cache (auto-managed)
├── pdf/
│   └── rectangle/           # Cropped PDF region images (auto-managed)
└── opencode/data/           # OpenCode session data (isolated per project)
```

### config.json

Project-level settings. Key sections:
- `application` — default mode, vim, theme, typography
- `editor` — font, size, tab size, line numbers, wrapping
- `math` — MathJax preamble and packages
- `callouts` — custom callout definitions
- `favorites` — pinned files
- `latex` — LaTeX build settings

## LSP Servers (internal)

AZprose runs two LSP servers in the background:
- **texlab** — for `.tex` files (completion, diagnostics)
- **markdown-oxide** — for `.md` files (wikilinks, callouts, daily notes)

These are invisible to the project but affect file behavior.

## Key Rules

- The project root is the vault root (where `.azprose/` lives)
- All paths are relative to the project root
- Markdown files use Obsidian flavor, not standard GitHub-flavored Markdown
- CSV files have no header row — all rows are data (column labels are auto-generated A, B, C...)
- PDF region selections are cached as PNGs in `.azprose/pdf/rectangle/`, not embedded in the PDF
