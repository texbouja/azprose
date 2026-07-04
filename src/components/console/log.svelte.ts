let items = $state<Record<string, string[]>>({});
let _batch: Record<string, string[]> = {};
let _raf = 0;

function flush() {
  _raf = 0;
  const flushed = _batch;
  _batch = {};
  for (const src of Object.keys(flushed)) {
    const incoming = flushed[src];
    if (!incoming.length) continue;
    const prev = items[src] ?? [];
    items = { ...items, [src]: [...prev, ...incoming] };
  }
}

export const logStore = {
  get all(): Record<string, string[]> {
    return items;
  },

  get(source: string): string[] {
    return items[source] ?? [];
  },

  append(source: string, line: string): void {
    const buf = _batch[source] ?? (_batch[source] = []);
    buf.push(line);
    if (!_raf) _raf = requestAnimationFrame(flush);
  },

  set(source: string, lines: string[]): void {
    if (_raf) { cancelAnimationFrame(_raf); _raf = 0; _batch = {}; }
    items = { ...items, [source]: lines };
  },

  clear(source?: string): void {
    if (_raf) { cancelAnimationFrame(_raf); _raf = 0; _batch = {}; }
    if (source) {
      const next = { ...items };
      delete next[source];
      items = next;
    } else {
      items = {};
    }
  },
};
