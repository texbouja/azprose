// Miroir sur disque des préférences GLOBALES — module PUR.
//
// Le problème : les préférences globales (`mdview.*`) vivent UNIQUEMENT dans
// le stockage local du webview. Les réglages de projet, eux, sont recopiés
// dans `.azprose/config.json` et survivraient à une purge. Constaté le
// 2026-08-23 : le nom de colleur du profil manquait, et rien ne permettait de
// le retrouver — or il commande désormais l'affichage des colles, si bien que
// sa perte fait croire à une panne.
//
// Le miroir est un FILET, pas une source. Règle unique et non négociable :
// le stockage local fait foi ; on ne restaure QUE les clés absentes. Sans
// cela, une valeur modifiée dans une fenêtre pourrait être écrasée par un
// miroir plus ancien écrit par l'autre.

/** Le strict nécessaire du stockage — injecté (P6 : jamais mock.module). */
export interface StockageLocal {
  readonly length: number;
  key(i: number): string | null;
  getItem(cle: string): string | null;
  setItem(cle: string, valeur: string): void;
}

/** Version de forme du fichier miroir, pour pouvoir le jeter un jour. */
export const SCHEMA_MIROIR = 1;

export interface Miroir {
  schema: number;
  date: string;
  /** Clé → valeur BRUTE (la chaîne JSON telle que stockée). */
  cles: Record<string, string>;
}

/**
 * Préfixe des préférences globales. Volontairement restreint à `mdview.` :
 *
 * - `azp:session::…` et `azp:draft:…` sont de l'état de session PAR COFFRE,
 *   volumineux et sans valeur hors de sa machine ;
 * - `azp:lastfile::…` de même.
 *
 * Ce sont des préférences qu'on veut pouvoir retrouver, pas un instantané du
 * navigateur.
 */
export const PREFIXE_PREFERENCES = "mdview.";

/** Clés entièrement exclues du miroir. Vide aujourd'hui : les secrets connus
 *  sont des CHAMPS au sein d'une clé utile, retirés par `CHAMPS_SECRETS` —
 *  exclure toute la clé perdrait le reste du profil, ce qu'on cherche
 *  précisément à éviter. Le crochet reste, pour une clé qui serait un jour
 *  secrète de bout en bout. */
export const CLES_EXCLUES: ReadonlySet<string> = new Set<string>();

/**
 * Champs à retirer avant d'écrire le miroir. Le mot de passe d'application
 * Gmail vit dans le profil : le recopier le sortirait du stockage du
 * navigateur pour l'écrire EN CLAIR sur le disque. Le miroir sert à ne pas
 * perdre des préférences, pas à disséminer des secrets — un mot de passe
 * perdu se regénère, un mot de passe répandu ne se reprend pas.
 */
const CHAMPS_SECRETS: Record<string, readonly string[]> = {
  "mdview.user.profile": ["gmailAppPassword"],
};

/** Retire les champs secrets d'une valeur JSON. Valeur non-objet ou illisible
 *  → rendue telle quelle : on ne casse pas ce qu'on ne comprend pas. */
export function expurger(cle: string, brut: string): string {
  const champs = CHAMPS_SECRETS[cle];
  if (!champs) return brut;
  try {
    const v = JSON.parse(brut);
    if (!v || typeof v !== "object" || Array.isArray(v)) return brut;
    const copie = { ...(v as Record<string, unknown>) };
    let touche = false;
    for (const c of champs) {
      if (c in copie) {
        delete copie[c];
        touche = true;
      }
    }
    return touche ? JSON.stringify(copie) : brut;
  } catch {
    return brut;
  }
}

/** Prend l'instantané des préférences globales à écrire dans le miroir. */
export function instantaner(stockage: StockageLocal, maintenant = new Date()): Miroir {
  const cles: Record<string, string> = {};
  for (let i = 0; i < stockage.length; i++) {
    const k = stockage.key(i);
    if (!k || !k.startsWith(PREFIXE_PREFERENCES) || CLES_EXCLUES.has(k)) continue;
    const v = stockage.getItem(k);
    if (v === null) continue;
    cles[k] = expurger(k, v);
  }
  return { schema: SCHEMA_MIROIR, date: maintenant.toISOString(), cles };
}

/**
 * Restaure les clés ABSENTES du stockage. Rend les clés effectivement
 * restaurées — pour pouvoir le DIRE, plutôt que de remettre des réglages en
 * douce.
 *
 * ⚠️ Ne remplace jamais une clé présente, même vide : une valeur présente est
 * un choix de l'utilisateur, fût-il de tout effacer.
 */
export function restaurer(brut: string | null, stockage: StockageLocal): string[] {
  if (!brut) return [];
  let miroir: unknown;
  try {
    miroir = JSON.parse(brut);
  } catch {
    return [];
  }
  const m = (miroir ?? {}) as Partial<Miroir>;
  if (m.schema !== SCHEMA_MIROIR || !m.cles || typeof m.cles !== "object") return [];

  const restaurees: string[] = [];
  for (const [k, v] of Object.entries(m.cles)) {
    if (typeof v !== "string") continue;
    if (!k.startsWith(PREFIXE_PREFERENCES) || CLES_EXCLUES.has(k)) continue;
    if (stockage.getItem(k) !== null) continue; // le stockage fait foi
    try {
      stockage.setItem(k, v);
      restaurees.push(k);
    } catch {
      /* quota : tant pis pour cette clé, les autres passent */
    }
  }
  return restaurees.sort();
}
