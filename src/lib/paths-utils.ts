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
