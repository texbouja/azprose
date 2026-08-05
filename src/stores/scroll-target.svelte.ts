/** Pending wikilink heading scroll target — consumed once by MarkdownPreview after render. */

let _target: { heading: string } | null = $state(null);

export function setScrollTarget(heading: string): void {
  _target = { heading };
}

export function consumeScrollTarget(): string | null {
  const h = _target?.heading ?? null;
  _target = null;
  return h;
}

/** Clears a pending target WITHOUT consuming it (used after an immediate scroll). */
export function clearScrollTarget(): void {
  _target = null;
}
