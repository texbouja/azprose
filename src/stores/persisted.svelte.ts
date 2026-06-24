function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function save<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / serialization errors
  }
}

export function persistedState<T>(key: string, initial: T) {
  let value = $state(load(key, initial));

  return {
    get current() { return value; },
    set current(v: T) { value = v; save(key, v); },
    update(fn: (prev: T) => T) { value = fn(value); save(key, value); },
    reset() { value = initial; save(key, initial); },
  };
}
