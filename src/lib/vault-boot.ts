/**
 * Résolution de la racine AVANT le montage de la fenêtre PROJET.
 *
 * Séparé de `vault.svelte.ts` pour que celui-ci reste sans dépendance Tauri —
 * l'autorité du coffre doit s'exercer dans un test comme dans l'application.
 *
 * Le MOMENT est l'essentiel : la racine est posée avant que le composant ne se
 * construise, donc avant toute lecture d'état scopé. C'est ce qui remplace
 * l'ancien montage, où deux promesses concurrentes (`take_pending_open_files`
 * et `take_project_folder`) pouvaient faire lire la session au scope d'un
 * projet puis ouvrir ses onglets dans la fenêtre d'un autre.
 */

import { invoke } from "@tauri-apps/api/core";
import { ouvrirCoffre, dernierProjet } from "@/lib/vault.svelte";

/** Racine transmise par l'ouvreur dans l'URL (`?root=`). */
export function racineDeLUrl(): string | null {
  try {
    const r = new URLSearchParams(location.search).get("root");
    return r ? decodeURIComponent(r) : null;
  } catch {
    return null;
  }
}

/**
 * Ouvre le coffre de cette fenêtre, par ordre de priorité décroissante :
 *   1. `?root=` — posé par l'ouvreur, synchrone, jamais partagé : la seule
 *      source correcte par construction ;
 *   2. le dossier passé en ligne de commande au lancement ;
 *   3. le dernier projet ouvert par cette fenêtre.
 * Aucune des trois ne répond → aucun coffre, et la porte de projet s'affiche.
 */
export async function resoudreRacineInitiale(): Promise<void> {
  const url = racineDeLUrl();
  if (url) {
    ouvrirCoffre(url);
    return;
  }

  let cli: string | null = null;
  try {
    cli = await invoke<string | null>("take_project_folder", { label: "main" });
  } catch {
    // Pas de dossier en attente : cas normal d'un lancement sans argument.
  }
  if (cli) {
    ouvrirCoffre(cli);
    return;
  }

  const dernier = dernierProjet();
  if (dernier) ouvrirCoffre(dernier);
}
