/** Canal « navigate » (phase 1, idée A du rapport architecture-review). */
export type { NavIntent, OpenOptions, OpenInTabOptions, TabSource } from "./intents";
export { navigate, navigateVoid, bridgeEvent, type NavDeps } from "./dispatch";
export { reduceNavIntent, normNavPath, mountInPinnedSlot } from "./reducer";
