# Intégration d'OpenCode dans AZprose

— Compte rendu de discussion, 29 juin 2026 —

## 1. Objectif

Faire d'OpenCode un agent spécialisé dans les tâches de l'application (rédaction scientifique, conversion de formats, scripting), et non un assistant généraliste. Pour cela, l'agent doit avoir **conscience de l'éditeur** — fichier courant, sélection, curseur — et pouvoir agir dans l'interface utilisateur.

## 2. Architecture : un MCP Server côté AZprose

La webview OpenCode est isolée (URL `http://127.0.0.1:4096`), sans accès à l'IPC Tauri ni au DOM d'AZprose. Le seul canal propre pour qu'OpenCode communique avec l'éditeur est le **protocole MCP** (Model Context Protocol), qu'il supporte nativement.

```
┌──────────────────────────┐      MCP/HTTP      ┌──────────────────────┐
│         AZprose          │◄───────────────────►│  OpenCode (webview)  │
│                          │     localhost:4100   │                      │
│  ┌────────────────────┐  │                     │  ┌────────────────┐  │
│  │   MCP Server       │  │                     │  │  Agent IA      │  │
│  │   (Rust / tower)   │──┤                     │  │  ┌──────────┐  │  │
│  │                     │  │                     │  │  │ azprose_*│  │  │
│  │  Outils exposés :   │  │                     │  │  │ tools    │  │  │
│  │  - editor_get_state │  │                     │  │  └──────────┘  │  │
│  │  - editor_insert    │  │                     │  └────────────────┘  │
│  │  - editor_replace   │  │                     └──────────────────────┘
│  │  - editor_get_...   │  │
│  └──────────┬──────────┘  │
│             │              │
│  ┌──────────▼──────────┐  │
│  │  Éditeur (CodeMirror │  │
│  │  + ImageViewer)      │  │
│  └─────────────────────┘  │
└──────────────────────────┘
```

### Outils MCP exposés par AZprose

| Outil | Description |
|---|---|
| `azprose_editor_state` | fichier courant, ligne/colonne, sélection, langue |
| `azprose_editor_selection` | texte sélectionné + position exacte |
| `azprose_editor_content` | contenu complet du fichier courant |
| `azprose_editor_insert` | insère du texte à une position donnée |
| `azprose_editor_replace` | remplace la sélection |
| `azprose_editor_visible_range` | lignes visibles à l'écran |

### Configuration OpenCode

```json
{
  "mcp": {
    "azprose": {
      "type": "remote",
      "url": "http://127.0.0.1:4100/mcp",
      "enabled": true
    }
  }
}
```

L'agent voit les outils `azprose_*` et les appelle comme des outils natifs — lecture de la sélection, écriture dans le fichier courant, etc.

## 3. Périmètre et permissions

Restreindre OpenCode aux outils nécessaires à l'édition :

```json
{
  "permission": {
    "bash": "deny",
    "edit": "allow",
    "read": "allow", "grep": "allow", "glob": "allow",
    "webfetch": "deny", "websearch": "deny",
    "azprose_*": "allow"
  }
}
```

Un agent `azprose` dédié peut porter ces permissions pour isoler les rôles.

## 4. Mécanismes d'extension complémentaires

| Mécanisme | Rôle |
|---|---|
| **Custom Tools** (`.opencode/tools/*.ts`) | Logique exécutable légère : conversion de formats, analyse de contenu. |
| **Plugins** (`.opencode/plugins/*.ts`) | Hooks sur les événements OpenCode (tool, session) pour logger, intercepter, enrichir. |
| **References** (`opencode.json`) | Rendre accessibles des dossiers externes : kits LaTeX, bibliothèques de styles. |
| **AGENTS.md** (`~/.config/opencode/AGENTS.md`) | Instructions permanentes injectées dans le contexte de l'agent. |

## 5. Cas d'usage

| Besoin | Solution |
|---|---|
| **Rédaction LaTeX / markdown / Typst** | L'agent lit l'état éditeur via MCP, écrit via `edit`, connaît les styles via `references` + AGENTS.md. |
| **Conversion formats mathématiques** | Custom Tool `convert` qui appelle pandoc / typst / latexmk en subprocess. |
| **Scripting shell / Python** | Custom Tool `run_script` (wrapper avec timeout, capture stdout/stderr). |
| **Tâches planifiées** | Worker Rust AZprose (`tokio-cron-scheduler`) déclenche des sessions OpenCode via son API web. |
| **Notebooks Jupyter** | MCP server Python supplémentaire connecté au kernel Jupyter. |

## 6. Intégration LaTeX permanente

- **`references`** dans `opencode.json` global → dossier du kit `.sty`/`.cls` accessible à l'agent.
- **`AGENTS.md` global** → description des fichiers, commandes principales, conventions.
- **Custom Tool `inspect-latex`** optionnel → extraction et liste des `\newcommand`/`\newenvironment` à la demande.

## 7. Plan d'action

- [ ] **P1 — MCP server AZprose (Rust)**
  - Créer un binaire séparé ou un thread `tokio` dans la même process AZprose qui écoute sur `127.0.0.1:4100`
  - Implémenter le transport MCP (JSON-RPC 2.0 sur HTTP) avec `tower` ou `axum`
  - Exposer `azprose_editor_state`, `azprose_editor_selection`, `azprose_editor_content`, `azprose_editor_insert`, `azprose_editor_replace`
  - Connecter les outils aux vrais états de l'éditeur (CodeMirror / ImageViewer)
  - Tester manuellement avec `opencode mcp` ou un curl JSON-RPC

- [ ] **P1 — Configuration OpenCode**
  - Créer `~/.config/opencode/opencode.json` avec le MCP server AZprose et les permissions restreintes
  - Créer `~/.config/opencode/AGENTS.md` global avec les conventions d'édition et LaTeX
  - Ajouter `references` vers le kit LaTeX perso
  - Tester une session : ouvrir un fichier, demander une modification, vérifier que l'agent voit l'état éditeur

- [ ] **P2 — Custom Tools**
  - `.opencode/tools/convert.ts` : conversion de formats (pandoc, latexmk, typst)
  - `.opencode/tools/run-script.ts` : exécution sandboxée de shell/Python
  - `.opencode/tools/inspect-latex.ts` : extraction des commandes LaTeX d'un `.sty`

- [ ] **P2 — Commandes `/` utilisateur**
  - Créer `.opencode/commands/` avec des raccourcis : `/resume`, `/refactor`, `/explique`, `/traduis`
  - Ou définir dans `opencode.json` → `command`

- [ ] **P3 — Tâches planifiées**
  - Worker Rust AZprose avec `tokio-cron-scheduler`
  - Déclenchement de sessions OpenCode via l'API web (`http://127.0.0.1:4096`)

- [ ] **P3 — Notebooks Jupyter**
  - MCP server Python dédié connecté au kernel Jupyter
  - Configuration dans `opencode.json` → `mcp`
