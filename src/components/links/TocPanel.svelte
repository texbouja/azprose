<script lang="ts">
  import { getT, language } from "@/lib/i18n";
  import { extFromPath } from "@/lib/editor-languages";
  import { readText } from "@/lib";
  import { getFileIndex } from "@/lib/vault-index";
  import {
    buildTocForest,
    type TocFileNode,
    type TocNode,
  } from "@/lib/toc-forest";
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

  // Mode « plan condensé » (bouton du header) : masque TOUTES les rangées de
  // niveau ≥ 3 — seuls H1 et H2 restent visibles (le plan « se replie » sur les
  // deux premiers niveaux). C'est un FILTRE DE RENDU : `hiddenInOutline`
  // garde les rangées dans le snippet ; il n'ajoute rien à `collapsed` (les
  // replis manuels de l'utilisateur restent orthogonaux au mode). `$state`
  // car le snippet doit se re-rendre quand le mode change.
  let outlineActive = $state(false);

  /** Bascule le mode « plan condensé ». Retourne le nouvel état (actif ?). */
  export function toggleOutline(): boolean {
    outlineActive = !outlineActive;
    onOutlineChange?.(outlineActive);
    return outlineActive;
  }

  /** Rangée masquée en mode condensé : tout titre de niveau ≥ 3, et toute
   *  branche dont le plus haut titre est lui-même ≥ 3 (sinon ses H1/H2 restent
   *  visibles et seuls ses propres H3+ sont masqués par la règle des titres). */
  function hiddenInOutline(node: TocNode): boolean {
    if (!outlineActive) return false;
    if (node.kind === "heading") return node.entry.level >= 3;
    return firstHeadingLevel(node.children) >= 3;
  }

  /** Plus petit niveau de titre de la sous-forêt (Infinity si aucun titre). */
  function firstHeadingLevel(children: TocNode[]): number {
    for (const c of children) {
      if (c.kind === "heading") return c.entry.level;
      const l = firstHeadingLevel(c.children);
      if (l !== Infinity) return l;
    }
    return Infinity;
  }

  // Anti-flicker : un changement de fichier (clé) vide l'arbre et affiche
  // « chargement » ; un changement de contenu (frappe) re-construit en
  // arrière-plan et conserve l'ancien arbre jusqu'à l'arrivée du nouveau.
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
            });
        if (version !== buildVersion) return; // requête obsolète
        forest = f;
        // Mode aide : la TOC se présente repliée comme le sommaire d'un
        // manuel — seules la racine index.md (jamais repliée) et la branche de
        // l'article courant sont dépliées par défaut.
        if (helpMode && f.root) seedHelpDefaults(f.root);
        // Pas de ré-application du mode condensé ici : c'est un filtre de
        // rendu (`hiddenInOutline`), il s'applique au nouvel arbre de lui-même.
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
    return `file:${path}`;
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
    return `file:${node.path}`;
  }

  function headingKey(node: Extract<TocNode, { kind: "heading" }>): string {
    return `${node.path}#${node.entry.line}`;
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

  function navigate(path: string, line: number, heading?: string): void {
    window.dispatchEvent(
      new CustomEvent("azprose:jump-to-file", {
        // line = 1-based source line (editor jump); heading = raw text for the
        // id-based preview scroll (immune to transclusion line shifts).
        detail: { path, line, heading },
      }),
    );
  }

  /** Saut vers le début du fichier d'une branche transcluse (ou d'un article
   *  de la doc intégrée). En mode aide, ouvrir un article déplie aussi sa
   *  branche (navigation de site statique). */
  function navigateFile(node: TocFileNode): void {
    if (helpMode && collapsed.has(fileKey(node))) toggle(fileKey(node));
    navigate(node.path, 1);
  }
</script>

{#snippet renderNode(node: TocNode, depth: number)}
  {#if !hiddenInOutline(node)}
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
  {/if}
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
