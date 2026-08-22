// Options de configuration de session — contrat DOCUMENTÉ et STABILISÉ de
// l'ACP v1 (« Session Config Options », agentclientprotocol.com/protocol/v1/
// session-config-options).
//
// Ce qu'il dit : `session/new` PEUT rendre `configOptions[]` — une option par
// sélecteur (catégories sémantiques `model`, `mode`, `model_config`,
// `thought_level`), chacune avec sa valeur courante et, pour `type:"select"`,
// la liste fermée des valeurs admises avec leur nom lisible. Le client change
// une valeur par `session/set_config_option`, dont la réponse porte l'ÉTAT
// COMPLET (des options dépendantes peuvent suivre). L'agent peut aussi changer
// les options LUI-MÊME : notification `session/update` de variante
// `config_option_update`, même charge utile complète.
//
// C'est LA source du sélecteur de modèle : la liste vient de l'AGENT, qui seul
// sait ce qui est utilisable ici (providers authentifiés, config utilisateur,
// modèles retirés…) — plus aucun sondage du CLI (`opencode models`, sortie
// texte non spécifiée, spécifique à ce binaire). Un agent sans configOptions
// est dégradé proprement : menu en saisie libre, switch par la méthode
// historique `session/set_model`, sinon config au prochain spawn.
//
// Remarque mesurée à charge réelle (OpenCode 1.18.11, sonde 2026-08-21) :
// l'agent accepte une valeur hors liste SANS erreur — la validation est donc
// NOTRE affaire : on n'envoie que des valeurs de la liste déclarée.

import { decouperIdModele } from "./catalogue";

/** Une valeur admise par une option `select` (forme ACP). */
export interface ConfigOptionValeur {
  /** Identifiant de la valeur — ce qu'on renvoie à `set_config_option`. */
  value: string;
  /** Nom lisible fourni par l'agent (ex. « OpenCode Go/GLM-5.3 »). */
  name?: string;
  description?: string;
}

/** Une option de configuration de session (forme ACP). */
export interface ConfigOption {
  id: string;
  name?: string;
  description?: string;
  /** Catégorie sémantique — `model` est la nôtre. Inconnue ou absente :
   *  l'option existe mais ne nous concerne pas (MUST handle gracefully). */
  category?: string;
  type?: "select" | "boolean" | string;
  /** Valeur actuelle — chaîne (select) ou booléen (boolean). */
  currentValue?: string | boolean;
  options?: ConfigOptionValeur[];
}

/** Un modèle proposé au sélecteur, tel que déclaré par l'agent. */
export interface ModeleDisponible {
  /** Identifiant complet — « provider/model » chez OpenCode ; c'est la forme
   *  attendue par la clé `model` de la config et par `session/set_model`. */
  id: string;
  /** Segment avant le premier « / » — clé de groupement de l'affichage.
   *  Sans « / », l'id entier sert de groupe (autre agent hypothétique). */
  provider: string;
  /** Nom lisible fourni par l'agent, s'il en a donné un. */
  nom?: string;
}

/**
 * L'option MODÈLE d'un état `configOptions` — première option de catégorie
 * `model` (l'ordre du tableau est significatif selon la spec), repli sur
 * l'id canonique `model` pour un agent qui omettrait la catégorie. Absente →
 * null : l'appelant dégrade (menu en saisie libre), jamais d'erreur.
 */
export function optionModele(configOptions: ConfigOption[] | null | undefined): ConfigOption | null {
  if (!Array.isArray(configOptions)) return null;
  return (
    configOptions.find((o) => o?.category === "model") ??
    configOptions.find((o) => o?.id === "model") ??
    null
  );
}

/**
 * Les modèles d'une option catégorie `select`. Défensif : option absente,
 * d'un autre type ou sans valeurs → liste vide ; doublons dédupliqués
 * (l'identifiant fait foi) ; valeur sans nom → le slug après « / ».
 */
export function modelesDeOption(opt: ConfigOption | null | undefined): ModeleDisponible[] {
  if (!opt || opt.type !== "select" || !Array.isArray(opt.options)) return [];
  const vus = new Set<string>();
  const resultats: ModeleDisponible[] = [];
  for (const v of opt.options) {
    const id = typeof v?.value === "string" ? v.value : "";
    if (!id || vus.has(id)) continue;
    vus.add(id);
    // Id sans « / » : pas de fournisseur à en tirer — l'id entier fait office
    // de groupe, plutôt qu'un préfixe inventé.
    resultats.push({
      id,
      provider: decouperIdModele(id)?.fournisseur ?? id,
      nom: typeof v.name === "string" && v.name ? v.name : undefined,
    });
  }
  return resultats;
}

/** Un identifiant saisi à la main a-t-il la forme attendue ? Sert au repli
 *  saisie libre du sélecteur quand la liste est vide ou sans le modèle voulu. */
export function estIdModele(texte: string): boolean {
  return /^([^\s/]+)\/(\S+)$/.test(texte.trim());
}

/** Groupe par fournisseur, dans l'ordre de première apparition — l'affichage
 *  du sélecteur présente les groupes tels que l'agent les a déclarés, sans
 *  tri surprise. */
export function grouperParProvider(modeles: ModeleDisponible[]): Map<string, ModeleDisponible[]> {
  const groupes = new Map<string, ModeleDisponible[]>();
  for (const m of modeles) {
    const g = groupes.get(m.provider);
    if (g) g.push(m);
    else groupes.set(m.provider, [m]);
  }
  return groupes;
}
