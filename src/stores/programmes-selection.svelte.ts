/**
 * Sélection des programmes officiels concernant CE projet.
 *
 * Donnée de PROJET (`.azprose/config.json`), pas préférence d'interface : deux
 * vaults peuvent porter des filières différentes, alors que le corpus lui-même
 * est partagé par toute l'application (`app_data_dir()/programmes/`).
 *
 * L'**ordre compte** : la première entrée est le programme par défaut, celui
 * que les instructions désignent à l'agent (rectificatif §4.4). Aucune clé de
 * configuration supplémentaire n'est donc nécessaire pour le défaut.
 */
import { persistedState } from "./persisted.svelte";
import { STORAGE_KEYS } from "@/lib/storage";

const stored = persistedState<string[]>(STORAGE_KEYS.programmesSelection, []);

export const programmesSelection = {
  get current(): string[] {
    return stored.current;
  },
  set current(v: string[]) {
    stored.current = v;
  },
  /** Coche/décoche un programme. Une entrée cochée s'ajoute EN FIN de liste :
   *  cocher un programme ne change jamais le défaut déjà en place. */
  toggle(id: string) {
    const liste = stored.current;
    stored.current = liste.includes(id) ? liste.filter((x) => x !== id) : [...liste, id];
  },
  /** Chargement depuis `config.json`. */
  load(ids: string[]) {
    stored.current = ids;
  },
};
