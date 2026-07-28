/**
 * User profile store — persistent user identity for calendar events.
 *
 * Stores name, email, role, and matière (subjects taught).
 * Professeur implies Colleur (can do both courses and colles).
 */

import { persistedState } from "./persisted.svelte";
import { STORAGE_KEYS } from "@/lib";
import { MATIERES } from "@/types/colles";

export type UserRole = "professeur" | "colleur" | "eleve";

export interface UserProfile {
  name: string;
  email: string;
  role: UserRole;
  matieres: string[];
}

const DEFAULTS: UserProfile = {
  name: "",
  email: "",
  role: "professeur",
  matieres: [],
};

function createProfileStore() {
  const state = persistedState<UserProfile>(STORAGE_KEYS.userProfile, DEFAULTS);

  return {
    get current(): UserProfile { return state.current; },

    patch(partial: Partial<UserProfile>) {
      state.current = { ...state.current, ...partial };
    },

    reset() { state.reset(); },

    /** Available matière options from colles types */
    get MATIERE_OPTIONS() {
      return MATIERES.map((m) => ({ id: m, label: m }));
    },
  };
}

export const userProfile = createProfileStore();
