// Branchement du miroir de préférences globales — appelé par les DEUX points
// d'entrée (PROJET et NAV), au plus tôt.
//
// Pourquoi ce filet : les préférences `mdview.*` n'existaient qu'à un seul
// endroit, le stockage local du webview. Les réglages de projet, eux, sont
// recopiés dans `.azprose/config.json`. Le 2026-08-23, le nom de colleur du
// profil manquait sans qu'on puisse le retrouver — et comme il commande
// désormais l'affichage des colles, sa perte ressemblait à une panne.

import { brancherMiroirPreferences, relirePreferences } from "@/stores/persisted.svelte";
import { planifierMiroir, restaurerMiroir } from "@/lib/preferences-miroir-store";

/**
 * Restaure les préférences absentes, puis arme la recopie.
 *
 * L'ordre compte : les stores se construisent à l'import de leur module, donc
 * AVANT cette fonction (la lecture disque est asynchrone). D'où la relecture
 * explicite des seules clés restaurées — sans elle, une préférence retrouvée
 * ne serait visible qu'au lancement suivant.
 *
 * Ne lève jamais : un filet qui empêcherait l'application de démarrer serait
 * pire que l'absence de filet.
 */
export async function initPreferences(): Promise<void> {
  try {
    const restaurees = await restaurerMiroir();
    if (restaurees.length > 0) {
      relirePreferences(restaurees);
      console.info(
        `[préférences] ${restaurees.length} réglage(s) restauré(s) depuis le miroir :`,
        restaurees.join(", "),
      );
    }
  } catch (e) {
    console.warn("[préférences] restauration impossible :", e);
  }
  // Armé APRÈS la restauration : sinon la première écriture recopierait un
  // stockage encore incomplet par-dessus le miroir qu'on vient de lire.
  brancherMiroirPreferences(planifierMiroir);
  // Une première recopie sans attendre un changement : au tout premier
  // lancement, le miroir n'existe pas encore et rien ne le créerait avant que
  // l'utilisateur ne touche un réglage.
  planifierMiroir();
}
