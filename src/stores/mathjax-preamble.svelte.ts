import { persistedState } from "./persisted.svelte";
import { STORAGE_KEYS } from "@/lib";

const _preamble = persistedState<string>(STORAGE_KEYS.mathJaxPreamble, "");

export const mathJaxPreamble = {
  get current(): string { return _preamble.current; },
  set current(v: string) { _preamble.current = v; },
  reset() { _preamble.current = ""; },
};

const _packages = persistedState<string[]>(STORAGE_KEYS.mathJaxPackages, []);

export const mathJaxPackages = {
  get current(): string[] { return _packages.current; },
  set current(v: string[]) { _packages.current = v; },
  toggle(id: string) {
    const list = _packages.current;
    _packages.current = list.includes(id)
      ? list.filter(p => p !== id)
      : [...list, id];
  },
  reset() { _packages.current = []; },
};
