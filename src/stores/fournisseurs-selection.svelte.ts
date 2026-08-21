/**
 * Fournisseurs cochés pour le sélecteur de modèles (section « Autres
 * fournisseurs »).
 *
 * OPT-IN assumé : le catalogue du serveur headless compte ~193 fournisseurs —
 * tout afficher rendait le menu illisible. Par défaut AUCUN n'est montré ;
 * l'utilisateur coche les siens dans Réglages › Assistant IA › Fournisseurs.
 *
 * Préférence GLOBALE (localStorage non scoping, comme `agentModel`) : c'est
 * une façon de lire le catalogue, pas une donnée du vault. Sémantique :
 * - la liste porte les ids EXPLICITEMENT cochés ; absent = non coché ;
 * - un fournisseur CONNECTÉ reste visible même absent d'ici (il est actif
 *   par nature) — la connexion ne coche pas, la déconnexion ne décoche pas.
 */
import { persistedState } from "./persisted.svelte";
import { STORAGE_KEYS } from "@/lib/storage";

const stored = persistedState<string[]>(STORAGE_KEYS.agentFournisseurs, []);

export const fournisseursSelection = {
  get current(): string[] {
    return stored.current;
  },
  set current(v: string[]) {
    stored.current = v;
  },
  /** Coche/décoche un fournisseur. */
  toggle(id: string) {
    const liste = stored.current;
    stored.current = liste.includes(id) ? liste.filter((x) => x !== id) : [...liste, id];
  },
};
