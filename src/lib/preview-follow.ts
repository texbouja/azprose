import type { PanelManager } from "@/lib/panel-manager";

/**
 * Preview-follow navigation (Phase 1, décision utilisateur « l'éditeur suit
 * son preview »).
 *
 * Quand la navigation se fait DANS le preview (wikilink, back/forward, home,
 * TOC), le tab éditeur main LIÉ (`pm.previewLinkedTabId`) est re-pointé vers
 * le fichier rendu — le même mouvement que le preview. Contrat :
 *
 * 1. Sans lien (jamais établi, ou lien périmé) → `followed: false` : l'appelant
 *    garde son comportement de repli (openInSide seule / openInMain legacy).
 * 2. Fichier déjà affiché par le tab lié → no-op, `followed: true`.
 * 3. Fichier déjà ouvert dans UN AUTRE tab main → « adopt-if-open » : on
 *    sélectionne ce tab et le lien s'y déplace (jamais de doublon ; le lien
 *    « rentre à la maison » vers le tab qui détient déjà le fichier).
 * 4. Sinon → `repoint` du tab lié (politique A : un contenu non enregistré est
 *    parké en brouillon AVANT le mouvement, et le brouillon du fichier cible
 *    est restauré si présent). `parked` signale qu'un brouillon a été parké
 *    (l'appelant peut notifier l'utilisateur).
 *
 * Le tab lié n'est JAMAIS un onglet d'outil (kind spreadsheet/datafilter/
 * custom) et son flag `preview` est retiré à chaque repoint/adoption : il ne
 * peut pas être réutilisé par le pool de tabs preview de jumpToLine.
 */
export type FollowResult = { followed: boolean; parked: boolean };

const norm = (p: string) => p.split("/").filter(s => s !== ".").join("/");

export async function followPreviewNavigation(
  pm: PanelManager,
  path: string,
): Promise<FollowResult> {
  const linkedId = pm.previewLinkedTabId;
  if (!linkedId) return { followed: false, parked: false };

  const linked = pm.main.tabs.find(t => t.id === linkedId);
  // Lien périmé : tab fermé ou devenu un onglet d'outil → délie et laisse
  // l'appelant retomber sur son comportement legacy. (linkedId non-null
  // garantit pm.side.activeTabId non-null — le getter lit le lien de ce tab.)
  if (!linked || (linked.kind && linked.kind !== "file")) {
    pm.linkPreview(pm.side.activeTabId!, null);
    return { followed: false, parked: false };
  }

  const target = norm(path);
  if (norm(linked.path) === target) {
    // Déjà sur la cible — le preview a navigué mais l'éditeur est aligné.
    pm.main.select(linked.id);
    return { followed: true, parked: false };
  }

  // Adopt-if-open : la cible est déjà ouverte dans un autre tab main → le lien
  // s'y déplace (pas de doublon). On retire son flag preview (s'il en a un) :
  // un tab lié ne doit jamais être une cible de réutilisation de jumpToLine.
  const existing = pm.main.tabs.find(
    t => t.id !== linkedId && (!t.kind || t.kind === "file") && norm(t.path) === target,
  );
  if (existing) {
    pm.linkPreview(pm.side.activeTabId!, existing.id);
    if (existing.preview) {
      pm.main.tabs = pm.main.tabs.map(t => t.id === existing.id ? { ...t, preview: false } : t);
    }
    pm.main.select(existing.id);
    return { followed: true, parked: false };
  }

  // Repoint du tab lié (politique A : park + preferDraft).
  const res = await pm.main.repoint(linkedId, target, { preferDraft: true });
  if (res.ok) pm.main.select(linkedId);
  return { followed: res.ok, parked: res.parked };
}
