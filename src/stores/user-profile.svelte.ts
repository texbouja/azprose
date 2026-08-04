/**
 * User profile store — persistent user identity for calendar events.
 *
 * Stores name, email, role, and the "colleur name" used as the user's
 * identifier when importing a colloscope (often abbreviated, e.g.
 * "M. Boujaida" instead of the full name "Sadik Anas Boujaida").
 */

import { persistedState } from "./persisted.svelte";
import { STORAGE_KEYS } from "@/lib";

export type UserRole = "professeur" | "eleve";

export interface UserProfile {
  name: string;
  email: string;
  role: UserRole;
  /** Nom abrégé d'identité colleur (identifiant dans le colloscope importé). */
  colleurName: string;
  /**
   * Mot de passe d'application Gmail (SMTP smtp.gmail.com:587) pour l'envoi
   * des rapports de colles par email — généré dans le compte Google (2FA
   * requis), jamais le mot de passe principal. Vide = envoi désactivé.
   */
  gmailAppPassword: string;
}

const DEFAULTS: UserProfile = {
  name: "",
  email: "",
  role: "professeur",
  colleurName: "",
  gmailAppPassword: "",
};

/**
 * Migration des anciennes formes persistées (localStorage) vers le modèle
 * courant — comble les champs manquants sans toucher aux valeurs existantes.
 */
function normalizeProfile(v: UserProfile): UserProfile {
  return {
    name: typeof v.name === "string" ? v.name : "",
    email: typeof v.email === "string" ? v.email : "",
    role: v.role === "eleve" ? "eleve" : "professeur",
    colleurName: typeof v.colleurName === "string" ? v.colleurName : "",
    gmailAppPassword: typeof v.gmailAppPassword === "string" ? v.gmailAppPassword : "",
  };
}

function createProfileStore() {
  const state = persistedState<UserProfile>(STORAGE_KEYS.userProfile, DEFAULTS, normalizeProfile);

  return {
    get current(): UserProfile { return state.current; },

    patch(partial: Partial<UserProfile>) {
      state.current = { ...state.current, ...partial };
    },

    reset() { state.reset(); },
  };
}

export const userProfile = createProfileStore();
