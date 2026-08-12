import type { FeatureImplementation, ItemInstance, SelectionDataRef } from "@headless-tree/core";

export interface MdvRowClickOptions<T> {
  /** Alt+clic sur une ligne NON-dossier : action secondaire (ex. ouvrir dans
   *  un nouvel onglet). La ligne est sélectionnée/focusée d'abord ; aucune
   *  `primaryAction` n'est déclenchée. */
  onAltAction?: (item: ItemInstance<T>) => void;
  /** MAJ+clic sur une ligne NON-dossier : action tertiaire (ouvrir dans un
   *  viewer libre side). La ligne est sélectionnée/focusée d'abord ; aucune
   *  `primaryAction` n'est déclenchée.
   *
   *  Le geste de SÉLECTION ÉTENDUE (plage) qui occupait Maj+clic est déplacé
   *  sur ALT+MAJ+clic : les deux capacités coexistent, seul le déclencheur
   *  change (le tableau de bord des gestes est : clic = ouvrir, alt+clic =
   *  slot épinglé, maj+clic = viewer side, alt+maj+clic = plage). */
  onShiftAction?: (item: ItemInstance<T>) => void;
}

/**
 * Shared row-click behavior for our trees — file-manager semantics.
 *
 * Plain click: select & focus ONLY. Folders do NOT toggle on click — expanding
 * happens via the row chevron or the ArrowRight/ArrowLeft hotkeys after
 * selection (see the "Custom Click Behavior" recipe: "Expand on Arrow-Click").
 * Non-folder rows still fire the primary action (open the file).
 *
 * Alt+click: same select & focus, then `onAltAction` (never on folders).
 *
 * Modifier clicks (shift/ctrl/meta) extend the selection exactly like the
 * native selection feature, but are handled HERE and deliberately do NOT call
 * the native chain: the main feature's onClick fires `primaryAction()` before
 * its modifier guard, which would open files on shift/ctrl clicks. Today that
 * would be a regression (files must only open on a plain click / Enter).
 *
 * Must be placed AFTER the selection feature and BEFORE the
 * `sveltePropsFeature` (whose `prev` chain remaps the onClick it sees).
 */
export const mdvRowClickFeature = <T>(opts?: MdvRowClickOptions<T>): FeatureImplementation<T> => ({
  key: "mdvRowClick",
  itemInstance: {
    getProps: ({ tree, item, prev }) => {
      const props = prev?.() ?? {};
      return {
        ...props,
        onClick: (e: MouseEvent) => {
          if (e.shiftKey && e.altKey) {
            // Alt+Maj+clic : SÉLECTION ÉTENDUE (plage) — le geste qui occupait
            // Maj+clic seul avant que celui-ci ne serve à ouvrir un viewer.
            item.selectUpTo(e.ctrlKey || e.metaKey);
            item.setFocused();
            tree.updateDomFocus();
            return;
          }
          if (e.shiftKey) {
            // Maj+clic : viewer libre side — sélection & focus d'abord, jamais
            // de primaryAction (le fichier ne s'ouvre pas dans l'éditeur).
            if (!item.isFolder()) opts?.onShiftAction?.(item);
            tree.setSelectedItems([item.getId()]);
            tree.getDataRef<SelectionDataRef>().current.selectUpToAnchorId = item.getId();
            item.setFocused();
            tree.updateDomFocus();
            return;
          }
          if (e.ctrlKey || e.metaKey) {
            item.toggleSelect();
            item.setFocused();
            tree.updateDomFocus();
            return;
          }
          // Select & focus for BOTH plain and alt clicks.
          tree.setSelectedItems([item.getId()]);
          // Set the range anchor like the native selection feature does
          // (selectUpTo reads dataRef.current.selectUpToAnchorId): without it
          // a subsequent Shift+click on another row would reset the anchor to
          // itself and select ONE row instead of the range.
          tree.getDataRef<SelectionDataRef>().current.selectUpToAnchorId = item.getId();
          item.setFocused();
          if (e.altKey) {
            if (!item.isFolder()) opts?.onAltAction?.(item);
            // updateDomFocus re-focuses the (re-created) row element after the
            // wrapper's {#key version} re-render — without it the keyboard
            // focus falls back to <body> and the container hotkeys go dead.
            tree.updateDomFocus();
            return;
          }
          if (!item.isFolder()) item.primaryAction();
          // updateDomFocus re-focuses the (re-created) row element after the
          // wrapper's {#key version} re-render — without it the keyboard
          // focus falls back to <body> and the container hotkeys go dead.
          tree.updateDomFocus();
        },
      };
    },
  },
});
