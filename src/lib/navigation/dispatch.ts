/**
 * Dispatch de navigation (phase 1, idée A) — la porte d'entrée du canal
 * « navigate ».
 *
 * `navigate()` est l'API unique par laquelle une demande de navigation
 * applicative aboutit au reducer. Les listeners hérités (CustomEvent
 * `azprose:*`) sont remplacés par des ponts fins `bridgeEvent()` qui
 * transforment l'événement en intention puis délèguent — la logique de
 * navigation elle-même vit dans `reducer.ts`, testable sous bun.
 */

import type { NavIntent } from "./intents";
import { reduceNavIntent, type NavDeps } from "./reducer";

export type { NavDeps, NavIntent };
export { normNavPath } from "./reducer";

/** Point d'entrée unique du canal navigate. */
export async function navigate(deps: NavDeps, intent: NavIntent): Promise<void> {
  await reduceNavIntent(deps, intent);
}

/** Fire-and-forget (les listeners ne bloquent pas le rendu). */
export function navigateVoid(deps: NavDeps, intent: NavIntent): void {
  void navigate(deps, intent);
}

/**
 * Pont CustomEvent → intention : abonne `listener` à `eventName`, convertit
 * l'événement via `toIntent` puis délègue au reducer. Retourne le cleanup.
 */
export function bridgeEvent<E extends Event = Event>(
  deps: NavDeps,
  eventName: string,
  toIntent: (e: E) => NavIntent | null,
): () => void {
  const listener = (e: Event) => {
    const intent = toIntent(e as E);
    if (intent) navigateVoid(deps, intent);
  };
  window.addEventListener(eventName, listener);
  return () => window.removeEventListener(eventName, listener);
}
