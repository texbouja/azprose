import { joinPath } from "./files";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { getRootPath } from "@/stores/root-path.svelte";

export const DEMO_MARKDOWN = `# bienvenue dans AZprose

![](/mascot/write.png)

éditeur de texte scientifique — Markdown, LaTeX, PDF.

ouvrez un dossier, éditez vos fichiers, tout reste local.

---

## aide-mémoire

- **⌘N** nouveau fichier
- **⌘O** ouvrir un fichier
- **⌘⇧O** ouvrir un dossier
- **⌘S** sauvegarder
- **⌘K** palettes de commandes
- **⌘B** basculer la barre latérale

---

![](/mascot/excite.png)

prêt quand vous l'êtes.
`;

export async function demoFile(): Promise<string | null> {
  const root = getRootPath();
  if (!root) return null;
  const path = joinPath(root, "welcome.md");
  await writeTextFile(path, DEMO_MARKDOWN);
  return path;
}
