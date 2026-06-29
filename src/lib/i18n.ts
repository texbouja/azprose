import { writable } from "svelte/store";
import i18next from "i18next";
import { STORAGE_KEYS } from "./storage";

import enJSON from "@/locales/en.json";
import frJSON from "@/locales/fr.json";
import deJSON from "@/locales/de.json";
import esJSON from "@/locales/es.json";

export type Language = "en" | "es" | "fr" | "de";
export type Translate = (key: string, vars?: Record<string, string | number>) => string;

export const LANGUAGE_CHOICES: Array<{ value: Language; label: string; nativeLabel: string }> = [
  { value: "en", label: "English", nativeLabel: "English" },
  { value: "es", label: "Spanish", nativeLabel: "Español" },
  { value: "fr", label: "French", nativeLabel: "Français" },
  { value: "de", label: "German", nativeLabel: "Deutsch" },
];

const LANGUAGE_VALUES = new Set<Language>(LANGUAGE_CHOICES.map(({ value }) => value));

const i18n = i18next.createInstance();
void i18n.init({
  fallbackLng: "en",
  lng: "en",
  resources: {
    de: { translation: deJSON },
    en: { translation: enJSON },
    es: { translation: esJSON },
    fr: { translation: frJSON },
  },
  interpolation: {
    escapeValue: false,
    prefix: "{",
    suffix: "}",
  },
  keySeparator: false,
  nsSeparator: false,
  returnNull: false,
});

function normalizeLanguage(value: unknown): Language {
  return typeof value === "string" && LANGUAGE_VALUES.has(value as Language)
    ? (value as Language)
    : "en";
}

function loadLanguage(): Language {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.language);
    return normalizeLanguage(raw);
  } catch {
    return "en";
  }
}

function persistLanguage(lang: Language) {
  try {
    localStorage.setItem(STORAGE_KEYS.language, lang);
  } catch {
    // ignore
  }
}

export const language = writable<Language>(loadLanguage());

language.subscribe((lang) => {
  persistLanguage(lang);
});

export function setLanguage(lang: Language) {
  language.set(lang);
}

export function getT(lang: Language): Translate {
  return (key: string, vars?: Record<string, string | number>) =>
    i18n.t(key, { ...vars, lng: lang }) as string;
}
