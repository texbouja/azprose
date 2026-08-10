/**
 * Overrides MANUELS des numéros de semaine de colle (session) + file du prompt.
 * Store runes Svelte (fichier .svelte.ts) — réactif : le composant UI du
 * prompt observe `pendingWeekPrompt()` et s'affiche dès qu'une demande est en
 * attente.
 *
 * Principe (décision utilisateur, round 16) : quand le calcul automatique du
 * numéro de semaine de colle échoue (date de planche hors de la période du
 * colloscope), l'application demande à l'utilisateur de saisir le numéro à la
 * main au lieu d'échouer silencieusement. La valeur est MÉMORISÉE pour toute
 * la SEMAINE (clé = lundi de la date) : les planches suivantes de la même
 * semaine réutilisent la saisie sans re-demander. Un calcul automatique qui
 * RÉUSSIT prime toujours (l'override n'est consulté qu'après un échec).
 */
import type { CollePlanche } from "./types";
import { lundiOf } from "./weeks";
import { plancheDateIso } from "@/printing/colle/archive";

interface PendingRequest {
  planche: CollePlanche;
  resolve: (n: number) => void;
  reject: (err: Error) => void;
}

/** Overrides de session : lundi (YYYY-MM-DD) → numéro de semaine de colle. */
const manual = new Map<string, number>();

/** Demande UI en attente — une seule à la fois (l'archivage est séquentiel). */
let pending = $state<PendingRequest | null>(null);

/** Numéro saisi manuellement pour cette semaine, si l'utilisateur en a donné un. */
export function manualWeekNumber(lundi: string): number | undefined {
  return manual.get(lundi);
}

/** Mémorise un numéro manuel pour une semaine (clé = lundi). */
export function setManualWeekNumber(lundi: string, n: number): void {
  if (Number.isInteger(n) && n > 0) manual.set(lundi, n);
}

/** Demande UI en attente (null si aucune). Réactif via $state. */
export function pendingWeekPrompt(): PendingRequest | null {
  return pending;
}

/**
 * Demande à l'utilisateur (via le prompt UI) un numéro manuel pour cette
 * planche. La Promise est résolue par `confirmWeekPrompt` / rejetée par
 * `cancelWeekPrompt` — le prompt échoue bruyamment (reject) si l'utilisateur
 * annule, comme l'échec automatique d'origine.
 */
export function requestManualWeekNumber(planche: CollePlanche): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    pending = { planche, resolve, reject };
  });
}

/** L'utilisateur a saisi `n` — mémorisé pour toute la semaine puis résolu. */
export function confirmWeekPrompt(n: number): void {
  const req = pending;
  if (!req) return;
  if (!Number.isInteger(n) || n < 1) return; // garde défensive — l'UI valide déjà
  const lundi = lundiOf(plancheDateIso(req.planche));
  if (lundi) manual.set(lundi, n);
  pending = null;
  req.resolve(n);
}

/** Annule la demande en attente (dialogue fermé, bouton Annuler…) → reject. */
export function cancelWeekPrompt(): void {
  const req = pending;
  if (!req) return;
  pending = null;
  req.reject(new Error("Saisie du numéro de semaine annulée"));
}
