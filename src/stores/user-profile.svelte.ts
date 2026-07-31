/**
 * User profile store — persistent user identity for calendar events.
 *
 * Stores name, email, and role.
 */

import { persistedState } from "./persisted.svelte";
import { STORAGE_KEYS } from "@/lib";

export type UserRole = "professeur" | "eleve";

export interface UserProfile {
  name: string;
  email: string;
  role: UserRole;
}

const DEFAULTS: UserProfile = {
  name: "",
  email: "",
  role: "professeur",
};

function createProfileStore() {
  const state = persistedState<UserProfile>(STORAGE_KEYS.userProfile, DEFAULTS);

  return {
    get current(): UserProfile { return state.current; },

    patch(partial: Partial<UserProfile>) {
      state.current = { ...state.current, ...partial };
    },

    reset() { state.reset(); },
  };
}

export const userProfile = createProfileStore();
