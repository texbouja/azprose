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
