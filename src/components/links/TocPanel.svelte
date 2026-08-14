<script lang="ts">
  import { getT, language } from "@/lib/i18n";
  import { extFromPath } from "@/lib/editor-languages";
  import { readText } from "@/lib";
  import { getFileIndex } from "@/lib/vault-index";
  import {
    buildTocForest,
    DEFAULT_MAX_DEPTH,
    outlineFoldKeys,
    tocFileKey,
    tocHeadingKey,
    type TocFileNode,
    type TocNode,
  } from "@/lib/toc-forest";
  import { makeTocMemo } from "@/lib/toc-cache";

  let {
    /** Racine du vault (borne la remontée index.md du fichier affiché). */
    rootPath = null as string | null,
    /** Fichier de référence : tab viewer md actif, sinon .md actif éditeur. */
    filePath = null as string | null,
    /** Contenu LIVE du fichier de référence (frappes non sauvegardées). */
    source = null as string | null,
    // La TOC est POST-TRANSCLUSION (décision utilisateur : les titres
    // transclus font partie de la note affichée, toujours dépliés via maxDepth
    // par défaut) mais SANS remontée index.md : la « branche Home » dépendait
    // du mode navigation, retiré des panneaux en Phase F/G (la lecture en
    // chaîne vit dans la fenêtre fille browser).
    /** Arbre externe (`declaredForest`) : chemin à mettre en surbrillance et
     *  déplier par défaut — le document MONTÉ dans l'onglet NAV actif. */
    helpActivePath = null as string | null,
    /** Remontée de l'état pour le header de section (badge). */
    onStateChange = null as ((s: { total: number; loading: boolean }) => void) | null,
    /** Remontée de l'état du mode « plan condensé » (repli tout niveau ≥ 3) —
     *  permet au header de refléter le bouton y compris après un changement de
     *  fichier qui le désactive. */
    onOutlineChange = null as ((active: boolean) => void) | null,
    /** Arbre PRÉ-CONSTRUIT (fenêtre NAV, phase 5 — noyau TOC déclaratif,
     *  `@/lib/toc-declared`) : quand fourni, REMPLACE le fetch interne
     *  (`buildTocForest`) — l'appelant construit l'arbre (souvent déjà calculé
     *  pour son propre usage, ex. le bouton « home » de la toolbar NAV) et ce
     *  panneau se contente de le RENDRE. Le cycle de vie (repli, snippets,
     *  clics) reste inchangé — seule la SOURCE de l'arbre change.
     *  `rootPath`/`filePath`/`source` sont alors ignorés. (chantier fenêtre
     *  NAV, phase 7) C'est aussi la seule source d'un arbre « fichier à plat » —
     *  l'aide intégrée n'a plus de catalogue statique séparé (R9), elle passe
     *  par ce même mécanisme depuis la fenêtre NAV. */
    declaredForest = null as { root: TocFileNode | null; displayPath: string } | null,
  } = $props();

  let t = $derived(getT($language));

  /** Forêt affichée (racine du fichier de référence + branches transcluses). */
  let forest = $state<{ root: TocFileNode | null; displayPath: string } | null>(null);
  let error = $state(false);

  /** Mode « fichier à plat » (racine rendue comme une rangée, pas de
   *  redirection titre-transclu → note, pas de numéro de ligne) : l'arbre
   *  déclaré (NAV, `declaredForest`) affiche une hiérarchie de FICHIERS
   *  explicite, jamais une transclusion de liens. */
  let flatFileMode = $derived(declaredForest !== null);

  /** Nœuds repliés, par identité (`path#ligne` headings, `file:path` branches). */
  let collapsed = $state<Set<string>>(new Set());

  // Mode « plan condensé » (bouton du header) : replie la TOC pour ne laisser
  // voir que les headings H1 et H2. C'est une VRAIE opération de repli sur
  // `collapsed` (`outlineFoldKeys`, toc-forest) — jamais un filtre de rendu :
  // les niveaux ≥ 2 sont pliés mais RESTENT dans l'arbre, chaque nœud est
  // dépliable à la main (déplier un H2 montre ses sous-sections, elles-mêmes
  // pliées). La désactivation RESTAURE le repli manuel d'avant (vue
  // transitoire). `$state` : l'état du bouton, reflété par le header.
  let outlineActive = $state(false);

  /** Snapshot du repli manuel avant activation — restauré à la désactivation. */
  let outlineSnapshot: Set<string> | null = null;

  /** Bascule le mode « plan condensé ». Retourne le nouvel état (actif ?). */
  export function toggleOutline(): boolean {
    outlineActive = !outlineActive;
    if (outlineActive) {
      outlineSnapshot = new Set(collapsed);
      collapsed = outlineFoldKeys(forest?.root ?? null, collapsed);
    } else if (outlineSnapshot) {
      collapsed = new Set(outlineSnapshot);
      outlineSnapshot = null;
    }
    onOutlineChange?.(outlineActive);
    return outlineActive;
  }

  // Anti-flicker : un changement de fichier (clé) vide l'arbre et affiche
  // « chargement » ; un changement de contenu (frappe) re-construit en
  // arrière-plan et conserve l'ancien arbre jusqu'à l'arrivée du nouveau.
  // Mémoïsation (phases 6/6bis) : une instance par panneau — un contenu dont
  // le hash STRUCTURAL n'a pas changé (frappe dans le corps, évaluation de
  // colle) court-circuite le rebuild (buildTocForest retourne l'arbre
  // mémoïsé sans re-lire les fichiers liés).
  let tocMemo = makeTocMemo();
  let prevKey = "";
  let buildVersion = 0;

  $effect(() => {
    // Arbre PRÉ-CONSTRUIT (fenêtre NAV, phase 5) : aucun fetch, on RENDT tel
    // quel. Seul le repli (collapsed) est réinitialisé au changement de
    // document affiché — même logique que `keyChanged` ci-dessous, sur la clé
    // `displayPath` (l'appelant a déjà géré la construction/mémoïsation de
    // l'arbre lui-même, cf. `currentToc` de browse-app.svelte).
    const df = declaredForest;
    if (df !== null) {
      const key = df.displayPath;
      if (key !== prevKey) {
        prevKey = key;
        outlineSnapshot = null;
        outlineActive = false;
        onOutlineChange?.(false);
        // Sommaire de plusieurs fichiers (§3, R9) : replié SAUF la branche du
        // document courant — un arbre déclaré peut couvrir tout un manuel,
        // l'afficher entièrement déplié noierait le document affiché.
        if (df.root) seedFlatFileDefaults(df.root);
        else collapsed = new Set();
      }
      forest = df;
      error = false;
      onStateChange?.({
        total: countArticles(df.root) + countHeadings(df.root),
        loading: false,
      });
      return;
    }

    const fp = filePath;
    const rp = rootPath;
    const src = source;

    if (!fp || !rp || extFromPath(fp) !== "md") {
      forest = null;
      error = false;
      prevKey = "";
      onStateChange?.({ total: 0, loading: false });
      return;
    }

    const key = `${fp}::${rp}`;
    const keyChanged = key !== prevKey;
    prevKey = key;
    const version = ++buildVersion;

    if (keyChanged) {
      forest = null;
      error = false;
      collapsed = new Set();
      outlineSnapshot = null;
      // Un changement de fichier désactive le mode condensé (le plan précédent
      // n'a plus de sens) et le header est averti pour refléter le bouton.
      outlineActive = false;
      onOutlineChange?.(false);
      onStateChange?.({ total: 0, loading: true });
    }

    // La frappe (source) est débouncée : la structure de titres change peu en
    // milieu de phrase, et on évite une reconstruction par caractère.
    const timer = setTimeout(async () => {
      try {
        const f = await buildTocForest({
          rootPath: rp,
          referencePath: fp,
          referenceSource: src ?? undefined,
          readText,
          getIndex: getFileIndex,
          // TOC TOUJOURS post-transclusion (décision utilisateur) : les
          // titres des fichiers transclus font partie de la note affichée
          // (maxDepth par défaut — les branches sont des ancres de la
          // note, pas des fichiers lançables). La remontée index.md
          // (branche Home) n'existe plus (chantier fenêtre NAV, phase 3) :
          // `buildTocForest` affiche toujours strictement la référence.
          maxDepth: DEFAULT_MAX_DEPTH,
        }, tocMemo);
        if (version !== buildVersion) return; // requête obsolète
        forest = f;
        // Pas de ré-application du repli ici : `outlineFoldKeys` s'applique à
        // l'activation, et les clés de repli (`path#line`, `file:path`)
        // survivent à la reconstruction (le set `collapsed` n'est pas remis à
        // zéro en cours de frappe). Un titre NOUVEAU apparaît donc déplié —
        // c'est le comportement voulu (on replie à nouveau avec le bouton si
        // besoin) ; un repli manuel fait pendant le mode reste en place.
        error = false;
        onStateChange?.({ total: countHeadings(f.root), loading: false });
      } catch {
        if (version !== buildVersion) return;
        forest = null;
        error = true;
        onStateChange?.({ total: 0, loading: false });
      }
    }, keyChanged ? 0 : 150);

    return () => clearTimeout(timer);
  });

  function countHeadings(node: TocFileNode | null): number {
    if (!node) return 0;
    let n = 0;
    const walk = (children: TocNode[]) => {
      for (const c of children) {
        if (c.kind === "heading") n++;
        walk(c.children);
      }
    };
    walk(node.children);
    return n;
  }

  /** Nombre d'ARTICLES de la forêt d'aide (branches fichier hors racine) — le
   *  badge du header affiche « N articles » en mode aide, soit le nombre de
   *  CHAPITRES (la racine index.md, page de garde, n'est pas comptée). */
  function countArticles(node: TocFileNode | null): number {
    if (!node) return 0;
    let n = 0;
    const walk = (children: TocNode[]) => {
      for (const c of children) {
        if (c.kind === "file") {
          if (!c.root) n++;
          walk(c.children);
        } else {
          walk(c.children);
        }
      }
    };
    walk(node.children);
    return n;
  }

  /** Clé de repli d'une branche fichier par chemin (mode « fichier à plat » :
   *  `filePath` est la racine de l'arbre, pas la branche du document courant). */
  function fileKeyOfPath(path: string): string {
    return tocFileKey(path);
  }

  /** Clés des branches fichier sur le chemin menant à `current` (lui inclus) —
   *  utilisé pour déplier le document courant (le chemin passe par la racine,
   *  jamais repliée). */
  function collectExpandKeys(node: TocFileNode | null, current: string | null): Set<string> {
    const out = new Set<string>();
    if (!node || !current) return out;
    const walk = (children: TocNode[], chain: TocFileNode[]): boolean => {
      for (const c of children) {
        if (c.kind !== "file") continue;
        const nextChain = [...chain, c];
        if (c.path === current) {
          for (const f of nextChain) out.add(fileKey(f));
          return true;
        }
        if (walk(c.children, nextChain)) return true;
      }
      return false;
    };
    walk(node.children, []);
    return out;
  }

  /** Toutes les clés de branches fichier (pour l'inverse du seed : replier
   *  TOUT sauf le chemin courant). */
  function collectAllFileKeys(node: TocFileNode | null): string[] {
    const out: string[] = [];
    const walk = (children: TocNode[]) => {
      for (const c of children) {
        if (c.kind === "file") {
          out.push(fileKey(c));
          walk(c.children);
        } else {
          walk(c.children);
        }
      }
    };
    if (node) walk(node.children);
    return out;
  }

  /** Seed du repli en mode « fichier à plat » (arbre déclaré NAV — R9, l'aide
   *  intégrée y compris) : tout est replié SAUF la branche du document courant
   *  (et ses ancêtres). La racine, elle, n'est jamais dans la liste des clés
   *  repliables (`collectAllFileKeys` ne la parcourt pas) — la page de garde
   *  du sommaire reste toujours ouverte. */
  function seedFlatFileDefaults(root: TocFileNode): void {
    const expand = collectExpandKeys(root, helpActivePath);
    if (filePath) expand.add(fileKeyOfPath(filePath));
    const all = collectAllFileKeys(root);
    collapsed = new Set(all.filter((k) => !expand.has(k)));
  }

  // Indentation relative au premier titre de la forêt (h4 en tête → 0).
  let minLevel = $derived(forest ? collectMinLevel(forest.root) : 1);

  function collectMinLevel(node: TocFileNode | null): number {
    if (!node) return 1;
    let min = Infinity;
    const walk = (children: TocNode[]) => {
      for (const c of children) {
        if (c.kind === "heading") {
          min = Math.min(min, c.entry.level);
          walk(c.children);
        } else {
          walk(c.children);
        }
      }
    };
    walk(node.children);
    return min === Infinity ? 1 : min;
  }

  function fileKey(node: TocFileNode): string {
    return tocFileKey(node.path);
  }

  function headingKey(node: Extract<TocNode, { kind: "heading" }>): string {
    return tocHeadingKey(node.path, node.entry.line);
  }

  /** Clé d'identité d'un nœud pour {#each}. Fonction JS classique — un
   *  SNIPPET est invalide ici : il ne peut être instancié que via `{@render}`
   *  (validate_snippet_args exige un nœud DOM en premier argument). */
  function keyOf(child: TocNode): string {
    return child.kind === "file" ? fileKey(child) : headingKey(child);
  }

  function isCollapsed(key: string): boolean {
    return collapsed.has(key);
  }

  function toggle(key: string): void {
    collapsed = new Set(collapsed);
    if (collapsed.has(key)) collapsed.delete(key);
    else collapsed.add(key);
  }

  function navigate(path: string, line: number, heading?: string, redirectInNote = true, ctrlKey = false): void {
    // La cible remonte dans le VIEWER side, jamais l'éditeur main (décision
    // utilisateur) : le reducer `toc-navigate` réutilise la politique wikilink
    // (tab viewer side, dédup par contenu — Phase G). `ctrlKey` est transporté
    // dans le détail pour la fenêtre NAV (R4 : ctrl+clic = nouvel onglet) —
    // ignoré côté projet (règle atomique, D6).
    //
    // TITRES TRANSCLUS (décision utilisateur) : un clic sur un titre qui
    // n'appartient PAS au fichier affiché (forest.displayPath — titre d'un
    // fichier transclu, traité comme partie de la note) localise DANS le
    // preview de la note courante, jamais le md source : la cible devient la
    // note affichée et la LIGNE source n'est pas transmise (coordonnées du
    // fichier d'origine, sans signification dans la note hôte) — le scroll se
    // fait par l'ID du titre (slugify), immunisé aux décalages de
    // transclusion. Mode « fichier à plat » (aide, arbre déclaré) : navigation
    // d'articles/chapitres intacte, chaque titre ouvre SON fichier.
    // `navigateFile` (branche fichier) désactive la redirection : le label
    // d'une branche ouvre toujours le fichier source.
    const display = forest?.displayPath;
    const inNote = !flatFileMode && redirectInNote && display != null && display !== path;
    const target = inNote ? display : path;
    const line0 = inNote ? undefined : line;
    window.dispatchEvent(
      new CustomEvent("azprose:toc-navigate", {
        // line = 1-based source line (rendu preview) ; heading = raw text for
        // the id-based preview scroll (immune to transclusion line shifts).
        detail: { path: target, line: line0, heading, ctrlKey },
      }),
    );
  }

  /** Saut vers le début du fichier d'une branche transcluse (ou d'un article
   *  de la doc intégrée / d'un chapitre déclaré). En mode « fichier à plat »,
   *  ouvrir un article déplie aussi sa branche (navigation de site statique).
   *  La redirection « titre transclu → note affichée » ne s'applique pas : le
   *  label d'une branche est une navigation FICHIER (ouvrir le md source). */
  function navigateFile(node: TocFileNode, ctrlKey = false): void {
    if (flatFileMode && collapsed.has(fileKey(node))) toggle(fileKey(node));
    navigate(node.path, 1, undefined, false, ctrlKey);
  }
</script>

{#snippet renderNode(node: TocNode, depth: number)}
  <li class="toc__row">
    <div class="toc__rowline">
      <span class="toc__ghost" style:width={5 * depth + "px"}></span>
      {#if node.kind === "file"}
        <button
          type="button"
          class="toc__chevron"
          aria-label={t("toc.toggle")}
          aria-expanded={!isCollapsed(fileKey(node))}
          onclick={() => toggle(fileKey(node))}
        >
          <i class="wxi {isCollapsed(fileKey(node)) ? "wxi-chevron-right" : "wxi-chevron-down"}"></i>
        </button>
        <button
          type="button"
          class="toc__branch-label"
          class:is-current={node.path === helpActivePath}
          onclick={(e) => navigateFile(node, e.ctrlKey || e.metaKey)}
          title={node.path}
        >
          <i class="wxi wxi-file-text"></i>
          <span class="toc__text">{node.label}</span>
        </button>
      {:else}
        {#if node.children.length > 0}
          <button
            type="button"
            class="toc__chevron"
            aria-label={t("toc.toggle")}
            aria-expanded={!isCollapsed(headingKey(node))}
            onclick={() => toggle(headingKey(node))}
          >
            <i class="wxi {isCollapsed(headingKey(node)) ? "wxi-chevron-right" : "wxi-chevron-down"}"></i>
          </button>
        {:else}
          <span class="toc__chevron toc__chevron--empty"></span>
        {/if}
        <button
          type="button"
          class="toc__item"
          style:padding-left={6 + (node.entry.level - minLevel) * 6 + "px"}
          onclick={(e) => navigate(node.path, node.entry.line, node.entry.text, true, e.ctrlKey || e.metaKey)}
          title={node.entry.text}
        >
          <span class="toc__text">{node.entry.text}</span>
          {#if !flatFileMode}
            <span class="toc__line">L{node.entry.line}</span>
          {/if}
        </button>
      {/if}
    </div>
    {#if !isCollapsed(node.kind === "file" ? fileKey(node) : headingKey(node)) && node.children.length > 0}
      <ul class="toc__list">
        {#each node.children as child (keyOf(child))}
          {@render renderNode(child, depth + 1)}
        {/each}
      </ul>
    {/if}
  </li>
{/snippet}

<div class="toc" class:toc--flat={flatFileMode}>
  {#if error}
    <div class="toc__state">
      <p>{t("toc.error")}</p>
    </div>
  {:else if !filePath || !rootPath || extFromPath(filePath) !== "md"}
    <div class="toc__state">
      <p>{t("toc.noNote")}</p>
    </div>
  {:else if forest === null}
    <div class="toc__state">
      <p>{t("toc.loading")}</p>
    </div>
  {:else if forest.root === null || forest.root.children.length === 0}
    <div class="toc__state">
      <p>{t("toc.empty")}</p>
    </div>
  {:else}
    {#if flatFileMode}
      <!-- Mode « fichier à plat » (aide OU arbre déclaré NAV) : un VRAI
           sommaire — la racine (index.md, ou racine de l'arbre déclaré) est
           rendue comme PREMIÈRE rangée, ses enfants sont les chapitres
           (chacun portant ses sections H2+). La racine n'est jamais repliée
           par défaut et redevient cliquable (retour au sommaire). -->
      <ul class="toc__list">
        {@render renderNode(forest.root, 0)}
      </ul>
    {:else}
      <ul class="toc__list">
        {#each forest.root.children as child (keyOf(child))}
          {@render renderNode(child, 0)}
        {/each}
      </ul>
    {/if}
  {/if}
</div>

<style>
  .toc {
    /* Corps pur — le header de section (titre, badge, actions) vit dans la
       SidebarSection hôte. */
    min-height: 0;
  }
  .toc__state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 18px 8px;
    text-align: center;
    font-size: 12px;
    color: var(--muted);
  }
  .toc__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .toc__row {
    display: flex;
    flex-direction: column;
  }
  /* Ligne horizontale du nœud (ghost + chevron + libellé) — le `<ul>` enfant
     (branches/headings nichés) vit SOUS la ligne, jamais à côté (flex row). */
  .toc__rowline {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 2px;
    min-width: 0;
  }
  .toc__ghost {
    flex: none;
    min-width: 0;
  }
  .toc__chevron {
    flex: none;
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    border-radius: 4px;
    color: var(--muted);
    cursor: pointer;
    padding: 0;
  }
  .toc__chevron:hover {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--fg);
  }
  .toc__chevron .wxi {
    font-size: 12px;
  }
  .toc__chevron--empty {
    pointer-events: none;
  }
  .toc__item {
    display: flex;
    align-items: baseline;
    gap: 6px;
    flex: 1;
    min-width: 0;
    padding: 2px 6px;
    border: none;
    background: transparent;
    border-radius: 4px;
    text-align: left;
    cursor: pointer;
  }
  .toc__item:hover {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .toc__branch-label {
    display: flex;
    align-items: center;
    gap: 5px;
    flex: 1;
    min-width: 0;
    padding: 2px 6px;
    border: none;
    background: transparent;
    border-radius: 4px;
    text-align: left;
    cursor: pointer;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .toc__branch-label:hover {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  /* NAV (arbre déclaré, `flatFileMode`) : le nœud fichier redevient une rangée
     de contenu ordinaire — ni capitales, ni gras, ni couleur d'accent
     (2026-08-14). Ce marquage typographique servait à signaler « ceci est un
     AUTRE fichier » dans les branches TRANSCLUSES de PROJET, où la distinction
     est vitale (le texte vient d'ailleurs que la note lue). Dans NAV l'arbre
     est une hiérarchie de fichiers ASSUMÉE : tout y est un fichier, le signaler
     à chaque rangée est du bruit, et la fenêtre est orientée contenu. L'icône
     `wxi-file-text` et la surbrillance `is-current` suffisent à situer.
     PROJET n'est PAS touchée : la règle d'origine reste sa valeur par défaut. */
  .toc--flat .toc__branch-label {
    font-size: 12px;
    font-weight: 400;
    letter-spacing: normal;
    text-transform: none;
    color: var(--fg);
  }
  /* Article de la doc intégrée actuellement affiché dans le lecteur. */
  .toc__branch-label.is-current {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }
  .toc__branch-label .wxi {
    font-size: 12px;
    flex: none;
  }
  .toc__text {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .toc__line {
    flex: none;
    font-size: 9.5px;
    font-weight: 600;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
</style>
