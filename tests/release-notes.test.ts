import { expect, test } from "bun:test";
import { getWhatsNewToastMessage } from "../src/lib/release-notes";
import { CURRENT_RELEASE, RELEASE_NOTES } from "../src/lib/release-notes";

// La table `WHATS_NEW_TOAST_BY_MINOR` est VIDE depuis la remise à plat des
// releases (0.5.0 = première release déclarée) : tout palier se rabat sur le
// libellé générique. Le test verrouille ce repli plutôt qu'une entrée
// particulière — c'est lui qui doit tenir quoi qu'on ajoute ensuite.
test("falls back to a generic update message when no minor is described", () => {
  expect(getWhatsNewToastMessage("0.5.0")).toBe("updated to v0.5.0");
  expect(getWhatsNewToastMessage("1.6.0")).toBe("updated to v1.6.0");
});

test("aucune précédence n'est déclarée dans les notes de version", () => {
  expect(RELEASE_NOTES).toHaveLength(1);
  expect(CURRENT_RELEASE.version).toBe("0.5.0");
});
