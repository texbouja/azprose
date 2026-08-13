export function basename(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i >= 0 ? path.slice(i + 1) : path;
}

export function dirname(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i > 0 ? path.slice(0, i) : "/";
}

export function joinPath(parent: string, child: string): string {
  const sep = parent.includes("\\") ? "\\" : "/";
  if (parent.endsWith(sep)) return `${parent}${child}`;
  return `${parent}${sep}${child}`;
}

/** Normalise un chemin pour les comparaisons : antislash → `/`, résolution de
 *  `.` et `..` (comme POSIX), suppression des doubles `/`. Déplacé depuis
 *  `index-home.ts` (chantier fenêtre NAV, phase 3) : sert à la normalisation
 *  générique de chemins, indépendamment de la recherche d'index.md lié. */
export function normIndexPath(p: string): string {
  const abs = p.startsWith("/");
  const segs: string[] = [];
  for (const s of p.replace(/\\/g, "/").split("/")) {
    if (s === "" || s === ".") continue;
    if (s === "..") {
      segs.pop();
      continue;
    }
    segs.push(s);
  }
  return (abs ? "/" : "") + segs.join("/");
}

/** Nom de fichier sans extension (`suites.md` → `suites`). Déplacé depuis
 *  `index-home.ts` (chantier fenêtre NAV, phase 3). */
export function stem(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}
