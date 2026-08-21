// Liste des modèles disponibles pour l'agent — l'équivalent du `/models` TUI
// d'OpenCode, pour le sélecteur du panneau assistant.
//
// Source mesurée en sonde (2026-08-21, OpenCode 1.18.11) : `opencode models`
// rend des lignes texte `provider/model`, déjà BORNÉES aux providers
// configurés/authentifiés (« Provider not found » sinon) — exactement la
// sémantique voulue pour un sélecteur : on ne propose pas ce qui échouera.
//
// Coût : ~2 s par appel (processus bun froid). D'où un cache à TTL court —
// assez long pour ne pas repayer les 2 s à chaque ouverture, assez court pour
// refléter une auth ajoutée entre-temps. Les ÉCHECS ne sont jamais cachés :
// la prochaine ouverture retente.

import { invoke } from "@tauri-apps/api/core";

export interface ModeleDisponible {
  /** Identifiant complet, tel qu'attendu par `session/set_model` et la clé
   *  `model` de la config : « provider/model ». */
  id: string;
  /** Segment avant le premier « / » — sert au groupement de l'affichage. */
  provider: string;
}

/** Exécuteur du processus ponctuel — injectable pour les tests (P6 : jamais
 *  mock.module). Défaut : commande Tauri `acp_run_capture` (pont Rust). */
export type ExecuteurProcessus = (command: string, args: string[]) => Promise<string>;

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

/**
 * Parse la sortie de `opencode models` — une ligne « provider/model » par
 * modèle. Défensif : lignes vides ignorées, codes ANSI retirés (le CLI en met
 * sur ses erreurs), doublons dédupliqués, forme stricte exigée (un segment
 * fournisseur sans espace, puis « / », puis le reste sans espace). Une ligne
 * qui n'y répond pas est IGNORÉE, jamais fatale : une montée de version qui
 * ajouterait un en-tête ou une bannière ne doit pas casser le sélecteur.
 */
export function parserModeles(sortie: string): ModeleDisponible[] {
  const vus = new Set<string>();
  const resultats: ModeleDisponible[] = [];
  for (const brute of sortie.split("\n")) {
    const ligne = brute.replace(ANSI, "").trim();
    const m = /^([^\s/]+)\/(\S+)$/.exec(ligne);
    if (!m) continue;
    if (vus.has(m[0])) continue;
    vus.add(m[0]);
    resultats.push({ id: m[0], provider: m[1] });
  }
  return resultats;
}

/** Un identifiant saisi à la main a-t-il la forme attendue ? Sert au repli
 *  saisie libre du sélecteur quand la liste est vide ou sans le modèle voulu. */
export function estIdModele(texte: string): boolean {
  return /^([^\s/]+)\/(\S+)$/.test(texte.trim());
}

/** Groupe par fournisseur, dans l'ordre de première apparition — l'affichage
 *  du sélecteur présente « opencode » puis les autres, sans tri surprise. */
export function grouperParProvider(modeles: ModeleDisponible[]): Map<string, ModeleDisponible[]> {
  const groupes = new Map<string, ModeleDisponible[]>();
  for (const m of modeles) {
    const g = groupes.get(m.provider);
    if (g) g.push(m);
    else groupes.set(m.provider, [m]);
  }
  return groupes;
}

/** Exécuteur réel : capture via le pont Rust. */
const executerTauri: ExecuteurProcessus = (command, args) =>
  invoke<string>("acp_run_capture", { command, args });

// ── Cache ────────────────────────────────────────────────────────────────────
// Un SEUL cache global (la liste ne dépend que du binaire) ; clé = binaire,
// pour qu'un changement de chemin (réglage veille) force une vraie mesure.
// TTL arbitré à 10 min : très au-delà d'une ouverture de menu, bien avant
// qu'une liste périmée puisse tromper quelqu'un.
const TTL_MS = 10 * 60 * 1000;
let cache: { cle: string; date: number; promesse: Promise<ModeleDisponible[]> } | null = null;

/** Vide le cache — exporté pour les tests et pour un rafraîchissement manuel éventuel. */
export function invaliderCacheModeles(): void {
  cache = null;
}

/**
 * Liste les modèles du binaire donné. Résolution paresseuse : l'appel n'a lieu
 * qu'à la première demande (l'ouverture du sélecteur), pas au démarrage du
 * panneau — payer 2 s pour un panneau qu'on n'ouvre pas serait absurde.
 *
 * @param executer injection de dépendances pour les tests.
 */
export async function listerModeles(
  binaire: string,
  executer: ExecuteurProcessus = executerTauri,
): Promise<ModeleDisponible[]> {
  if (cache && cache.cle === binaire && Date.now() - cache.date < TTL_MS) {
    return cache.promesse;
  }
  const promesse = executer(binaire, ["models"]).then(parserModeles);
  // Seul le SUCCÈS se cache : un échec (binaire absent, CLI en panne) doit
  // pouvoir être réessayé dès la prochaine ouverture.
  void promesse.then(
    () => {
      cache = { cle: binaire, date: Date.now(), promesse };
    },
    () => {},
  );
  return promesse;
}
