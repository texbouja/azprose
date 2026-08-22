// Persistance du catalogue de fournisseurs — palier GLOBAL.
//
// Pourquoi persister : le catalogue coûte un `opencode serve` (lancement de
// processus, attente de l'annonce de port) puis 5,3 Mo de JSON à parser, à
// chaque première ouverture du menu de modèles. Or son contenu ne change
// qu'avec le binaire.
//
// Pourquoi le palier GLOBAL (`app_data_dir()/agent/`) et pas `.azprose/` :
// le catalogue se dérive de l'INSTALLATION, pas du contenu du coffre. Il est
// identique quel que soit le coffre ouvert — l'écrire par projet le
// dupliquerait (692 Ko) à chaque ouverture.
//
// Pourquoi PAS dans le cache d'OpenCode : ce répertoire ne nous appartient
// pas. OpenCode peut le purger ou le migrer entre versions, et l'utilisateur
// y fait tourner son propre CLI.
//
// Ce qu'on n'écrit JAMAIS : la clé API. Elle reste chez OpenCode et se relit
// à la demande (`/config/providers`).
//
// Marqueur de version OBLIGATOIRE : `{schema, versionBinaire, date, donnees}`,
// jeté au moindre écart. Un catalogue parsé conservé indéfiniment est un
// piège si la forme de `/provider` change à une mise à jour d'OpenCode —
// l'interface serait silencieusement nourrie de données mal interprétées.

import type { FournisseurCatalogue } from "./catalogue";

/** Incrémenter à CHAQUE changement de la forme de `FournisseurCatalogue`. */
export const SCHEMA_CATALOGUE = 1;

export interface CacheCatalogue {
  schema: number;
  /** Version du binaire OpenCode (son `agentInfo.version` à l'initialize). */
  versionBinaire: string;
  /** Date d'écriture, ISO. Informative — jamais une condition d'expiration :
   *  le catalogue ne vieillit pas, il change avec le binaire. */
  date: string;
  donnees: FournisseurCatalogue[];
}

export function envelopper(
  donnees: FournisseurCatalogue[],
  versionBinaire: string,
  maintenant = new Date(),
): CacheCatalogue {
  return {
    schema: SCHEMA_CATALOGUE,
    versionBinaire,
    date: maintenant.toISOString(),
    donnees,
  };
}

/**
 * Relit un cache. Rend null — donc « pas de cache », état que le code connaît
 * déjà — dès qu'un doute existe :
 *   · JSON illisible, enveloppe non conforme ;
 *   · schéma différent (notre forme a changé) ;
 *   · version du binaire différente OU INCONNUE.
 *
 * L'inconnue est traitée comme un écart, volontairement : sans version
 * courante, on ne peut pas affirmer que le cache est encore juste. Le prix
 * est un rechargement, jamais une donnée mal interprétée.
 */
export function relire(brut: string | null, versionBinaire: string | null): FournisseurCatalogue[] | null {
  if (!brut || !versionBinaire) return null;
  let cache: unknown;
  try {
    cache = JSON.parse(brut);
  } catch {
    return null;
  }
  const c = (cache ?? {}) as Partial<CacheCatalogue>;
  if (c.schema !== SCHEMA_CATALOGUE) return null;
  if (c.versionBinaire !== versionBinaire) return null;
  if (!Array.isArray(c.donnees)) return null;
  // Contrôle de forme minimal : une entrée mal formée trahit un cache écrit
  // par une autre version, que le seul numéro de schéma n'aurait pas attrapée.
  for (const f of c.donnees) {
    const e = f as Partial<FournisseurCatalogue>;
    if (typeof e?.id !== "string" || typeof e?.nom !== "string" || !Array.isArray(e?.modeles)) {
      return null;
    }
  }
  return c.donnees as FournisseurCatalogue[];
}
