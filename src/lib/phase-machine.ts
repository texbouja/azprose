/**
 * Machines à phases pour les flux asynchrones (rapport architecture-review,
 * idée D / phase 5).
 *
 * Chaque phase définit son ALPHABET accepté : un événement hors alphabet est
 * IGNORÉ (retour `false`, état inchangé) — fini l'état poubelle et la classe
 * « double-clic → N requêtes ». `reset` est la seule transition
 * INCONDITIONNELLE, réservée au cycle de vie (ouverture/fermeture) : elle
 * ramène la machine à un état connu sans passer par l'alphabet.
 *
 * PUR (aucune dépendance) — testable sous bun, réactive dans les composants
 * via `let machine = $state(createPhaseMachine(...))` : les mutations passent
 * par le proxy Svelte → `machine.current` est tracké dans le template.
 */

/** Définition d'une phase : son nom + son alphabet (événement → destination). */
export interface PhaseDef<S extends string, E extends string> {
  name: S;
  /** Alphabet accepté : événement → phase de destination. */
  on: Partial<Record<E, S>>;
}

/** Configuration de la machine (2ᵉ argument de `createPhaseMachine`). */
export interface PhaseMachineTransitions<S extends string> {
  /** Phase initiale (celle du montage du composant). */
  initial: S;
}

export interface PhaseMachine<S extends string, E extends string> {
  /** Phase courante (lecture seule côté consommateur). */
  readonly current: S;
  /**
   * Transite si l'événement est accepté par la phase courante, sinon no-op.
   * @returns `true` si la transition a eu lieu.
   */
  send(event: E): boolean;
  /** L'événement est-il accepté par la phase courante ? */
  accepts(event: E): boolean;
  /** La phase courante appartient-elle à l'ensemble donné ? */
  is(...phases: S[]): boolean;
  /** Transition INCONDITIONNELLE (cycle de vie uniquement, jamais d'alphabet). */
  reset(to: S): void;
}

export function createPhaseMachine<S extends string, E extends string>(
  states: readonly PhaseDef<S, E>[],
  transitions: PhaseMachineTransitions<S>,
): PhaseMachine<S, E> {
  const byName = new Map(states.map((s) => [s.name, s]));
  // Validation au setup : toute destination doit être une phase connue (un
  // typo d'état = erreur immédiate, pas une transition silencieuse).
  for (const state of states) {
    for (const [event, dest] of Object.entries(state.on)) {
      if (!byName.has(dest as S)) {
        throw new Error(
          `createPhaseMachine: la phase "${state.name}" transite vers une phase inconnue "${String(dest)}" (événement "${event}")`,
        );
      }
    }
  }
  // La phase courante vit dans une closure (variable `let`), exposée via un
  // GETTER : l'interface reste `readonly current` côté consommateur (aucune
  // assignation possible de l'extérieur), et le getter est tracké par le
  // proxy `$state` de Svelte dans les composants.
  let current: S = transitions.initial;
  return {
    get current(): S {
      return current;
    },
    send(event: E): boolean {
      const state = byName.get(current);
      if (!state) return false;
      const dest = state.on[event];
      if (dest === undefined) return false; // hors alphabet → ignoré
      current = dest;
      return true;
    },
    accepts(event: E): boolean {
      const state = byName.get(current);
      return !!state && state.on[event] !== undefined;
    },
    is(...phases: S[]): boolean {
      return phases.includes(current);
    },
    reset(to: S): void {
      current = to;
    },
  };
}
