# Moteur d'indexation — conception

## Contexte

AZprose cible des professeurs de CPGE qui peuvent gérer des volumes importants de
documents : cours, exercices, annales de concours sur plusieurs années et filières.
L'indexation en JavaScript (pdfjs-dist en mémoire) ne passe pas à l'échelle pour
ce cas d'usage. La solution retenue est un moteur d'indexation natif Rust, intégré
au processus Tauri en arrière-plan.

## Principes directeurs

- **Open-source exclusivement** — aucun composant propriétaire, licences MIT / Apache / GPL uniquement.
- **Rust pour le travail lourd** — extraction, indexation, recherche ; Svelte pour l'UI uniquement.
- **Non-bloquant** — l'indexation tourne dans un thread Tokio, le frontend reçoit la progression via des événements Tauri.
- **Index persistant** — le résultat survit aux redémarrages ; seuls les fichiers modifiés sont ré-indexés.

## Formats indexés

| Format | Extraction |
|--------|-----------|
| `.md` | `parseFrontMatter` (déjà présent) + corps texte brut |
| `.tex` | Parser Rust maison — extrait métadonnées (`\title`, `\author`, `\section`…) et corps ; fallback `detex` (GPL) si installé |
| `.pdf` | `pdf-extract` (crate Rust MIT) ; fallback `pdftotext` (poppler, GPL) si installé |

Les fichiers scannés sont exclusivement ceux du **dossier projet ouvert**.

### Parser LaTeX

Pas de crate Rust dédié à l'extraction de texte LaTeX — un parser maison basé sur
la crate `regex` (MIT) est suffisant pour l'indexation :

- Extraire les métadonnées : `\title{}`, `\author{}`, `\date{}`, `\section{}`, `\subsection{}`
- Supprimer les commandes : `\command[…]{…}` → garder le contenu des accolades
- Supprimer les environnements de mise en forme : `\begin{itemize}…\end{itemize}` → garder le texte
- Supprimer les mathématiques : `$…$`, `$$…$$`, `\(…\)`, `\[…\]` → remplacer par ` `
- Supprimer les commentaires : `% …` jusqu'à fin de ligne

Le résultat est du texte brut indexable, sans chercher à rendre le LaTeX.
Fallback : `detex` système (outil GNU, GPL) s'il est installé.

## Stack technique

| Rôle | Crate | Licence |
|------|-------|---------|
| Extraction PDF | `pdf-extract` | MIT |
| Moteur full-text | `tantivy` | MIT |
| Persistance de l'index | `rusqlite` + FTS5 | MIT + domaine public |

### Pourquoi tantivy plutôt que rusqlite+FTS5 seul

`tantivy` est un moteur full-text complet (équivalent Rust de Lucene) : ranking TF-IDF,
recherche par champ, fuzzy search, facettes. `rusqlite`+FTS5 reste en option si la
complexité de tantivy s'avère inutile pour le volume réel des projets.

### Pourquoi pdf-extract plutôt que pdfium

`pdfium` est lié à Google PDFium — écarté par politique open-source. `pdf-extract`
est un crate pur Rust qui couvre les PDFs texte (non-scannés), cas d'usage principal
des annales de concours numériques.

## Architecture Tauri

```
Svelte (UI)
    │  tauri::invoke("index_project", { path })
    │  tauri::listen("index:progress", …)
    ▼
Rust — src-tauri/src/indexer.rs
    ├── scan_dir()        — liste récursive des .md et .pdf
    ├── extract_text()    — pdf-extract pour PDF, parseFrontMatter pour Markdown
    ├── update_index()    — tantivy / rusqlite FTS5
    └── emit progress     — window.emit("index:progress", { done, total, path })
```

L'index est stocké dans `.azprose/index/` à la racine du dossier projet (tantivy)
ou `.azprose/index.db` (rusqlite).

## Commande Tauri

```rust
#[tauri::command]
async fn index_project(path: String, window: tauri::Window) -> Result<(), String> {
    tauri::async_runtime::spawn(async move {
        let files = scan_dir(&path);
        let total = files.len();
        for (i, file) in files.iter().enumerate() {
            let text = extract_text(file);
            update_index(file, &text);
            window.emit("index:progress", json!({ "done": i+1, "total": total, "path": file })).ok();
        }
    });
    Ok(())   // retour immédiat, indexation en arrière-plan
}
```

## Déclenchement

| Événement | Action |
|-----------|--------|
| Ouverture d'un projet | Indexation complète si index absent |
| Modification d'un fichier (fs.watch) | Ré-indexation du seul fichier modifié |
| Ajout / suppression de fichier | Mise à jour incrémentale |
| Commande manuelle (`Ctrl+Shift+I`) | Ré-indexation forcée complète |

## Interface de recherche

Palette de commandes style `Ctrl+P` dans le frontend Svelte :
- Recherche en temps réel sur l'index (invoke Rust → résultats JSON)
- Affiche titre, extrait contextuel, chemin, type (md / pdf)
- Ouverture directe du fichier au clic

## Ce que ce moteur ne fait pas

- Pas d'OCR — les PDFs scannés (images) ne sont pas indexés.
- Pas d'indexation inter-projets — un index par dossier projet.
- Pas de synchronisation cloud — l'index est local.
