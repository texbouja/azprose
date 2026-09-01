import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { loadSession, saveSession, saveLastFile, loadLastFile } from "@/lib/session";
import { loadProjectSession } from "@/lib/project-session";
import type { PanelManager } from "@/lib/panel-manager";
import { normalizeLegacyKind, tabContentKind, type LegacyTabKind } from "@/lib/panel-store";
import { dansPerimetre } from "@/lib/paths";

export interface SessionRestoreDeps {
  pm: PanelManager
  openFileInTab: (path: string, opts?: { preferDraft?: boolean; silent?: boolean; preview?: boolean; sourceType?: "latex" }) => Promise<void>
  findTabByPath: (path: string) => { id: string; panel: string } | undefined
  setSideVisible: (v: boolean) => void
  handleOpenProjectByPath: (folder: string) => Promise<void>
  /** Périmètre du coffre — INJECTÉ plutôt qu'importé : ce module est chargé par
   *  des tests qui n'ont pas de runtime Svelte, et `vault.svelte.ts` en est un. */
  perimetre: () => readonly string[]
  /** Racine du coffre, pour la relecture de la session portable du disque. */
  racine: () => string | null
  /** Trace d'un écart (Diagnostics). Rien à l'écran — cf. `filtrerAuPerimetre`. */
  signaler: (message: string) => void
}

/**
 * Écarte les chemins étrangers au coffre (arbitrage A : racine + invités).
 *
 * Nécessaire parce que la session voyage : `.azprose/session.json` est une copie
 * PORTABLE, relue quand le localStorage scopé est vide, et elle contient des
 * chemins ABSOLUS — un coffre copié depuis une autre machine ou dupliqué depuis
 * un autre projet rouvrait donc les fichiers de l'original.
 *
 * Silencieux à l'écran (arbitrage B : si l'isolation est assez forte, le cas ne
 * se présente pas), mais TRACÉ : un onglet écarté ici signifie que quelque chose
 * a déjà échoué en amont, et c'est la seule trace qui le dira.
 *
 * Exporté pour être testé seul — c'est la règle d'appartenance de la session,
 * elle mérite ses propres cas.
 */
export function filtrerAuPerimetre<T extends { path: string }>(
  entrees: readonly T[],
  quoi: string,
  perimetre: readonly string[],
  signaler: (message: string) => void,
): T[] {
  const gardees = entrees.filter((e) => dansPerimetre(e.path, perimetre));
  const ecartees = entrees.length - gardees.length;
  if (ecartees > 0) {
    signaler(
      `${ecartees} ${quoi} écarté(s) à la restauration : hors du périmètre du projet ` +
        `(${perimetre.join(", ") || "aucun dossier ouvert"}).`,
    );
  }
  return gardees;
}

export function setupSessionRestore(ctx: SessionRestoreDeps): () => void {
  let cancelled = false;
  let unlisteners: (() => void)[] = [];

  listen<string>("azprose:open-file", (event) => {
    const path = event.payload;
    if (cancelled) return;
    if (typeof path === "string" && path.length > 0) {
      void ctx.openFileInTab(path).catch(() => {});
    }
  }).then((un) => {
    if (cancelled) { un(); return; }
    unlisteners.push(un);
    void invoke<string[]>("take_pending_open_files")
      .then(async (paths) => {
        if (cancelled) return;
        const latest = paths[paths.length - 1];
        if (latest) {
          void ctx.openFileInTab(latest).catch(() => {});
        } else {
          const rp = ctx.racine();
          const perim = ctx.perimetre();
          let session = loadSession();
          if (session.main.tabs.length === 0 && rp) {
            const portable = await loadProjectSession(rp);
            if (portable && portable.main.tabs.length > 0) {
              session = { main: portable.main, side: portable.side };
              saveSession(session);
              if (portable.lastFile) saveLastFile(portable.lastFile);
            }
          }
          // Filtrage AVANT toute ouverture : un chemin étranger ne doit pas
          // même créer son onglet — c'est cet onglet qui, ensuite, réécrivait
          // des chemins d'un autre coffre dans la session, les brouillons et le
          // miroir disque de celui-ci.
          session = {
            main: { ...session.main, tabs: filtrerAuPerimetre(session.main.tabs, "onglet(s)", perim, ctx.signaler) },
            side: { ...session.side, tabs: filtrerAuPerimetre(session.side.tabs, "aperçu(s)", perim, ctx.signaler) },
          };
          if (session.main.tabs.length > 0) {
            for (const tab of session.main.tabs) {
              if (cancelled) break;
              await ctx.openFileInTab(tab.path, { preferDraft: true, silent: true, sourceType: tab.sourceType });
            }
            if (!cancelled && session.main.activePath) {
              const active = ctx.findTabByPath(session.main.activePath);
              if (active) ctx.pm.main.select(active.id);
            }
            if (session.side.visible && session.side.tabs.length > 0) {
              // Phase E (R9) : les viewers restaurés sont DORMANTS — onglets
              // visibles et grisés, AUCUN travail au boot (ni lecture disque ni
              // rendu markdown/PDF, « rien que du texte pur ») ; le premier
              // clic les monte (`PanelState.wake`). Le flag `preview` est posé
              // d'emblée (chaque entrée crée son onglet, pas de ré-affectation).
              for (const tab of session.side.tabs) {
                if (cancelled) break;
                // "doc" (chantier fenêtre NAV, phase 7) : plus de tab doc dans
                // la fenêtre de projet — une session ANCIENNE en contenant un
                // le laisse simplement de côté au restore.
                if (tab.kind === "doc") continue;
                // Vues d'OUTIL (custom / spreadsheet / datafilter) : jamais
                // restaurées (décision 2026-08-14, cf. `PanelState.toJSON`).
                // `toJSON` ne les écrit plus, mais CE chemin lit le
                // `.azprose/session.json` du DISQUE : les sessions déjà
                // écrites en contiennent encore. Sans ce garde-fou, un
                // tableur revenait en page d'accueil vide —
                // `restoreDormantTab` ne transporte ni `spreadsheetId` ni
                // `datafilterIds`, l'état de ces vues vit dans data.db.
                if (tabContentKind(normalizeLegacyKind(tab.kind as LegacyTabKind)) === "data") continue;
                ctx.pm.side.restoreDormantTab({
                  path: tab.path,
                  title: tab.title,
                  renderMode: tab.renderMode,
                  sourceType: tab.sourceType,
                  kind: tab.kind,
                });
              }
              // Aucun couplage à restaurer (Phase G — D1) : les tabs se
              // reconnaissent par leur contenu, la sphère pinned est runtime
              // (rien d'épinglé au boot, R9).
              if (!cancelled) {
                // Sélectionne le tab SIDE actif de la session dans le panel
                // SIDE (par chemin normalisé) — jamais via findTabByPath qui
                // ne cherche que dans le panel MAIN : sélectionner un id de
                // tab main dans le panel side ne correspond à aucun tab (bug :
                // au boot, le tab side actif restauré ne redevenait pas celui
                // de la session). Sans chemin actif, le panel reste visible
                // avec ses onglets (dormants) — la visibilité vient de la
                // session, jamais d'un effet de bord d'ouverture.
                selectSideActiveTab(ctx.pm, session.side.activePath);
                ctx.setSideVisible(true);
              }
            }
          } else {
            const lastFile = loadLastFile();
            // Même garde que pour les onglets : `azp:lastfile` est scopée, mais
            // le `lastFile` de la session PORTABLE ci-dessus vient du disque et
            // peut donc désigner un autre coffre.
            if (lastFile && dansPerimetre(lastFile, perim)) {
              void ctx.openFileInTab(lastFile, { preferDraft: true }).catch(() => {
                saveLastFile(null);
              });
            } else if (lastFile) {
              saveLastFile(null);
            }
          }
        }
      })
      .catch((err) => console.warn("azprose: pending open-file check failed", err));
  });

  // Le dossier passé en ligne de commande était ici un SECOND chemin d'ouverture
  // de coffre, concurrent de celui du démarrage : deux promesses sans ordre
  // garanti, dont l'une pouvait poser une racine APRÈS que la session avait été
  // lue au scope de l'autre. Il est désormais consommé AVANT le montage
  // (`resoudreRacineInitiale`, main.ts) et n'a plus rien à faire ici.

  listen<string>("azprose:open-project", (event) => {
    const dir = event.payload;
    if (cancelled) return;
    if (typeof dir === "string" && dir.length > 0) {
      void ctx.handleOpenProjectByPath(dir);
    }
  }).then((un) => {
    if (cancelled) return;
    unlisteners.push(un);
  });

  return () => {
    cancelled = true;
    unlisteners.forEach((u) => u());
  };
}


const normPath = (p: string) => p.split("/").filter((s) => s !== ".").join("/");

/** Sélectionne le tab SIDE actif de la session au boot — cherché dans le
 *  panel SIDE par chemin normalisé (les tabs side sont restaurés via
 *  openInSide → ids régénérés, le chemin est le seul identifiant stable).
 *  Ne JAMAIS chercher dans le panel main (session-utils.findTabByPath) puis
 *  sélectionner cet id dans le panel side : l'id n'y existe pas (bug fixé). */
export function selectSideActiveTab(pm: PanelManager, activePath: string | null): void {
  if (!activePath) return;
  const sideTab = pm.side.tabs.find((t) => normPath(t.path) === normPath(activePath));
  // `wake: false` (Phase E — R9) : l'onglet actif restauré reste DORMANT (grisé,
  // rien de monté) ; c'est le premier clic de l'utilisateur qui le réveille —
  // le boot ne fait « rien que du texte pur ».
  if (sideTab) pm.side.select(sideTab.id, { wake: false });
}
