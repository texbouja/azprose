// Chien de garde d'inactivité pour les requêtes longues (session/prompt).
//
// Mesuré sur OpenCode 1.18.11 (sondes /tmp/opencode/sonde-go-*.ts) : quand
// un modèle échoue silencieusement (quota hebdomadaire épuisé), le serveur
// RETENTE en boucle sans émettre ni notification ni réponse — et même
// session/cancel n'interrompt pas la boucle. Le client attendrait alors son
// timeout total (10 min) sans aucun signe de vie : spinner infini à l'écran.
//
// Ce chien de garde rejette la promesse après `inactiviteMs` SANS trafic
// entrant ; chaque appel à battre() — câblé sur les notifications de
// l'agent — réarme le compteur. Une génération saine parle toujours
// (chunks de texte, réflexion, appels d'outils, usage_update) : elle ne
// déclenchera jamais le rejet.
//
// Module PUR : l'horloge est injectable pour les tests.

export interface HorlogeSilence {
  programmer(ms: number, cb: () => void): unknown;
  annuler(handle: unknown): void;
}

const HORLOGE_REELLE: HorlogeSilence = {
  programmer: (ms, cb) => setTimeout(cb, ms),
  annuler: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export function surveillerSilence<T>(
  promesse: Promise<T>,
  inactiviteMs: number,
  horloge: HorlogeSilence = HORLOGE_REELLE,
): { resultat: Promise<T>; battre(): void; arreter(): void } {
  let handle: unknown = null;
  let finie = false;
  let rejet: ((e: Error) => void) | null = null;

  const declencher = () => {
    if (finie) return;
    finie = true;
    rejet?.(
      new Error(
        `aucune réponse de l'agent depuis ${Math.round(inactiviteMs / 1000)} s — session/prompt abandonné`,
      ),
    );
  };

  const arreterCompteur = () => {
    if (handle !== null) {
      horloge.annuler(handle);
      handle = null;
    }
  };

  const rearmer = () => {
    if (finie || inactiviteMs <= 0) return;
    arreterCompteur();
    handle = horloge.programmer(inactiviteMs, declencher);
  };

  rearmer();

  const resultat = new Promise<T>((resolve, reject) => {
    rejet = reject;
    promesse.then(
      (v) => {
        finie = true;
        arreterCompteur();
        resolve(v);
      },
      (e) => {
        finie = true;
        arreterCompteur();
        reject(e);
      },
    );
  });

  return {
    resultat,
    battre: rearmer,
    // À appeler dans un finally : fige le chien même si la promesse amont
    // n'est jamais résolue (annulation côté transport…).
    arreter: () => {
      finie = true;
      arreterCompteur();
    },
  };
}
