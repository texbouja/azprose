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
  import { buildHelpForest } from "@/help/help-toc";
  import { isHelpPath, helpDir } from "@/lib/help-install";

  let {
    /** Racine du vault (borne la remontée index.md du fichier affiché). */
    rootPath = null as string | null,
    /** Fichier de référence : tab viewer md actif, sinon .md actif éditeur.
     *  En mode aide (chemin sous `.azprose/help/`), c'est la RACINE index.md —
     *  la TOC affiche alors le CATALOGUE complet, quel que soit l'article. */
    filePath = null as string | null,
    /** Contenu LIVE du fichier de référence (frappes non sauvegardées).
     *  `null` = à lire sur disque (racine de la doc intégrée). */
    source = null as string | null,
    // La TOC est POST-TRANSCLUSION (décision utilisateur : les titres
    // transclus font partie de la note affichée, toujours dépliés via maxDepth
    // par défaut) mais SANS remontée index.md : la « branche Home » dépendait
    // du mode navigation, retiré des panneaux en Phase F/G (la lecture en
    // chaîne vit dans la fenêtre fille browser). Mode aide : helpMode prime
    // (catalogue complet quoi qu'il arrive).
    /** Mode aide : article de la doc intégrée ACTUELLEMENT affiché dans le
     *  lecteur (surbrillance de sa branche + dépli par défaut). */
    helpActivePath = null as string | null,
    /** Remontée de l'état pour le header de section (badge). */
    onStateChange = null as ((s: { total: number; loading: boolean }) => void) | null,
    /** Remontée de l'état du mode « plan condensé » (repli tout niveau ≥ 3) —
     *  permet au header de refléter le bouton y compris après un changement de
     *  fichier qui le désactive. */
    onOutlineChange = null as ((active: boolean) => void) | null,
  } = $props();

  let t = $derived(getT($language));

  /** Forêt affichée (racine du fichier « home » + branches transcluses, ou
   *  catalogue complet de la doc intégrée en mode aide). */
  let forest = $state<{ root: TocFileNode | null; displayPath: string } | null>(null);
  let error = $state(false);

  /** Mode AIDE : le fichier de référence vit sous `.azprose/help/` — la TOC
   *  reflète alors le CATALOGUE complet (arbre de site statique), quel que
   *  soit l'article affiché. Dérivé : ne dépend que de filePath/rootPath. */
  let helpMode = $derived(!!filePath && !!rootPath && isHelpPath(filePath, rootPath));

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
        const f = helpMode
          ? await buildHelpForest({ helpDir: helpDir(rp), readText })
          : await buildTocForest({
              rootPath: rp,
              referencePath: fp,
              referenceSource: src ?? undefined,
              readText,
              getIndex: getFileIndex,
              // TOC TOUJOURS post-transclusion (décision utilisateur) : les
              // titres des fichiers transclus font partie de la note affichée
              // (maxDepth par défaut — les branches sont des ancres de la
              // note, pas des fichiers lançables). La remontée index.md
              // (branche Home) est retirée avec le mode navigation (Phase G).
              maxDepth: DEFAULT_MAX_DEPTH,
              linkedIndex: false,
            }, tocMemo);
        if (version !== buildVersion) return; // requête obsolète
        forest = f;
        // Mode aide : la TOC se présente repliée comme le sommaire d'un
        // manuel — seules la racine index.md (jamais repliée) et la branche de
        // l'article courant sont dépliées par défaut.
        if (helpMode && f.root) seedHelpDefaults(f.root);
        // Pas de ré-application du repli ici : `outlineFoldKeys` s'applique à
        // l'activation, et les clés de repli (`path#line`, `file:path`)
        // survivent à la reconstruction (le set `collapsed` n'est pas remis à
        // zéro en cours de frappe). Un titre NOUVEAU apparaît donc déplié —
        // c'est le comportement voulu (on replie à nouveau avec le bouton si
        // besoin) ; un repli manuel fait pendant le mode reste en place.
        error = false;
        onStateChange?.({
          total: helpMode ? countArticles(f.root) : countHeadings(f.root),
          loading: false,
        });
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

  /** Clé de repli d'une branche fichier par chemin (mode aide : `filePath`
   *  est la racine index.md, pas la branche de l'article courant). */
  function fileKeyOfPath(path: string): string {
    return tocFileKey(path);
  }

  /** Clés des branches fichier sur le chemin menant à `current` (lui inclus) —
   *  utilisé pour déplier l'article courant (le chemin passe par la racine,
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

  /** Seed du repli en mode aide : tout est replié SAUF la branche de l'article
   *  courant (et ses ancêtres). La racine index.md, elle, n'est jamais dans la
   *  liste des clés repliables (`collectAllFileKeys` ne la parcourt pas) — la
   *  page de garde du manuel reste toujours ouverte. */
  function seedHelpDefaults(root: TocFileNode): void {
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

  function navigate(path: string, line: number, heading?: string, redirectInNote = true): void {
    // La cible remonte dans le VIEWER side, jamais l'éditeur main (décision
    // utilisateur) : le reducer `toc-navigate` réutilise la politique wikilink
    // (tab viewer side, dédup par contenu — Phase G).
    //
    // TITRES TRANSCLUS (décision utilisateur) : un clic sur un titre qui
    // n'appartient PAS au fichier affiché (forest.displayPath — titre d'un
    // fichier transclu, traité comme partie de la note) localise DANS le
    // preview de la note courante, jamais le md source : la cible devient la
    // note affichée et la LIGNE source n'est pas transmise (coordonnées du
    // fichier d'origine, sans signification dans la note hôte) — le scroll se
    // fait par l'ID du titre (slugify), immunisé aux décalages de
    // transclusion. Mode aide : navigation d'articles intacte (les titres des
    // chapitres ouvrent leur article). `navigateFile` (branche fichier)
    // désactive la redirection : le label d'une branche ouvre toujours le
    // fichier source.
    const display = forest?.displayPath;
    const inNote = !helpMode && redirectInNote && display != null && display !== path;
    const target = inNote ? display : path;
    const line0 = inNote ? undefined : line;
    window.dispatchEvent(
      new CustomEvent("azprose:toc-navigate", {
        // line = 1-based source line (rendu preview) ; heading = raw text for
        // the id-based preview scroll (immune to transclusion line shifts).
        detail: { path: target, line: line0, heading },
      }),
    );
  }

  /** Saut vers le début du fichier d'une branche transcluse (ou d'un article
   *  de la doc intégrée). En mode aide, ouvrir un article déplie aussi sa
   *  branche (navigation de site statique). La redirection « titre transclu →
   *  note affichée » ne s'applique pas : le label d'une branche est une
   *  navigation FICHIER (ouvrir le md source). */
  function navigateFile(node: TocFileNode): void {
    if (helpMode && collapsed.has(fileKey(node))) toggle(fileKey(node));
    navigate(node.path, 1, undefined, false);
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
          onclick={() => navigateFile(node)}
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
          onclick={() => navigate(node.path, node.entry.line, node.entry.text)}
          title={node.entry.text}
        >
          <span class="toc__text">{node.entry.text}</span>
          {#if !helpMode}
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

<div class="toc">
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
    {#if helpMode}
      <!-- Mode aide : un VRAI sommaire de manuel — la racine index.md (page de
           garde + sommaire) est rendue comme PREMIÈRE rangée, ses enfants sont
           les chapitres (chacun portant ses sections H2+). La racine n'est
           jamais repliée par défaut et redevient cliquable (retour au sommaire). -->
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
