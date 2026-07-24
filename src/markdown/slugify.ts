/** GitHub-style heading anchor: lowercase, strip non-word chars, spaces → hyphens. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/ /g, "-")
    .replace(/^-|-$/g, "");
}
