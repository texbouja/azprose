<script lang="ts">
import { slide } from "svelte/transition";
import { ChevronRight, X } from "@/lib/icons";
import { Button, Icon } from "@/components/primitives";
import {
  proseSettings,
  type ProseStyle,
  type TextAlign,
  type HeadingFont,
  type OlType,
} from "@/stores/prose-settings.svelte";
import { mathJaxPreamble, mathJaxPackages } from "@/stores/mathjax-preamble.svelte";
import { MATHJAX_PACKAGES } from "@/lib/mathjax-packages";
import { marpSettings, type MarpTheme, type MarpSize } from "@/stores/marp-settings.svelte";
import { restartApp } from "@/lib/restart";

let {
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
} = $props();

type ModuleId = "style-writing" | "style-presentation" | "preamble-mathjax" | "marp-style";
type SectionId = "prose" | "marp";

const SECTIONS: { id: SectionId; label: string; modules: { id: ModuleId; label: string }[] }[] = [
  {
    id: "prose",
    label: "Prose",
    modules: [
      { id: "style-writing", label: "Normal" },
      { id: "style-presentation", label: "Présentation" },
      { id: "preamble-mathjax", label: "MathJax" },
    ],
  },
  {
    id: "marp",
    label: "Marp",
    modules: [
      { id: "marp-style", label: "Présentation" },
    ],
  },
];

let activeModule = $state<ModuleId>("style-writing");
let expandedSections = $state(new Set<SectionId>(["prose"]));

// Explicit $derived so the template tracks proseSettings.current reactively.
let s = $derived(proseSettings.current);

function toggleSection(id: SectionId) {
  const next = new Set(expandedSections);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedSections = next;
}

$effect(() => {
  if (!open) return;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };
  document.addEventListener("keydown", onKey);
  return () => document.removeEventListener("keydown", onKey);
});

const OL_OPTIONS: { value: OlType; label: string }[] = [
  { value: "decimal",     label: "Numérique (1. 2. 3.)" },
  { value: "lower-alpha", label: "Alphabétique (a. b. c.)" },
  { value: "lower-roman", label: "Romain min. (i. ii. iii.)" },
  { value: "upper-alpha", label: "Alphabétique maj. (A. B. C.)" },
  { value: "upper-roman", label: "Romain maj. (I. II. III.)" },
];

const HEADING_FONT_OPTIONS: { value: HeadingFont; label: string }[] = [
  { value: "inherit",    label: "Hérite" },
  { value: "fira-sans",  label: "Fira Sans" },
  { value: "inter",      label: "Inter" },
  { value: "system",     label: "Système" },
  { value: "custom",     label: "Personnalisée" },
];
</script>

{#snippet headingRow(
  tag: string,
  size: number, onSize: (v: number) => void,
  align: TextAlign, onAlign: (v: TextAlign) => void,
  font: HeadingFont, onFont: (v: HeadingFont) => void,
  mt: number, onMt: (v: number) => void,
  mb: number, onMb: (v: number) => void,
)}
  <div class="mdv-settings__heading-row">
    <span class="mdv-settings__heading-tag">{tag}</span>
    <input type="number" class="mdv-settings__number-input"
      min="0.5" max="5" step="0.05"
      value={size}
      oninput={(e) => onSize(Number(e.currentTarget.value))} />
    <div class="mdv-settings__align-group">
      {#each (["left", "center", "right"] as const) as a}
        <button type="button" class="mdv-settings__align-btn"
          class:is-active={align === a}
          onclick={() => onAlign(a)}
          aria-label={a}
        >{a === "left" ? "G" : a === "center" ? "C" : "D"}</button>
      {/each}
    </div>
    <select class="mdv-settings__select mdv-settings__select--sm"
      onchange={(e) => onFont(e.currentTarget.value as HeadingFont)}>
      {#each HEADING_FONT_OPTIONS as opt}
        <option value={opt.value} selected={font === opt.value}>{opt.label}</option>
      {/each}
    </select>
    <input type="number" class="mdv-settings__number-input"
      min="0" max="5" step="0.1"
      value={mt}
      oninput={(e) => onMt(Number(e.currentTarget.value))} />
    <input type="number" class="mdv-settings__number-input"
      min="0" max="3" step="0.05"
      value={mb}
      oninput={(e) => onMb(Number(e.currentTarget.value))} />
  </div>
{/snippet}

{#snippet policesSection()}
  <p class="mdv-settings__section-title">Polices</p>
  <div class="mdv-settings__fonts">
    <div class="mdv-settings__font-row">
      <span class="mdv-settings__font-label">Principale</span>
      <select class="mdv-settings__select"
        onchange={(e) => proseSettings.patch({ fontFamily: e.currentTarget.value as ProseStyle["fontFamily"] })}>
        <option value="fira-sans" selected={s.fontFamily === "fira-sans"}>Fira Sans</option>
        <option value="inter"     selected={s.fontFamily === "inter"}>Inter</option>
        <option value="system"    selected={s.fontFamily === "system"}>Système</option>
        <option value="custom"    selected={s.fontFamily === "custom"}>Personnalisée…</option>
      </select>
    </div>
    {#if s.fontFamily === "custom"}
      <div class="mdv-settings__font-row">
        <span class="mdv-settings__font-label"></span>
        <input
          type="text"
          class="mdv-settings__font-custom-input"
          placeholder="Nom exact de la police (ex : Georgia)"
          value={s.customFontName}
          oninput={(e) => proseSettings.patch({ customFontName: e.currentTarget.value })}
          spellcheck={false}
        />
      </div>
    {/if}
    <div class="mdv-settings__font-row">
      <span class="mdv-settings__font-label">Monospace</span>
      <select class="mdv-settings__select"
        onchange={(e) => proseSettings.patch({ monoFont: e.currentTarget.value as ProseStyle["monoFont"] })}>
        <option value="fira-code"      selected={s.monoFont === "fira-code"}>Fira Code</option>
        <option value="jetbrains-mono" selected={s.monoFont === "jetbrains-mono"}>JetBrains Mono</option>
        <option value="system"         selected={s.monoFont === "system"}>Système</option>
      </select>
    </div>
  </div>
{/snippet}

{#snippet titresSection()}
  <p class="mdv-settings__section-title">Titres</p>
  <div class="mdv-settings__headings">
    <div class="mdv-settings__heading-header">
      <span></span>
      <span>Taille</span>
      <span>Alignement</span>
      <span>Police</span>
      <span>Esp.↑</span>
      <span>Esp.↓</span>
    </div>
    {@render headingRow("H1",
      s.h1Size,    (v) => proseSettings.patch({ h1Size: v }),
      s.h1Align,   (v) => proseSettings.patch({ h1Align: v }),
      s.h1FontFamily, (v) => proseSettings.patch({ h1FontFamily: v }),
      s.h1MarginTop,  (v) => proseSettings.patch({ h1MarginTop: v }),
      s.h1MarginBottom, (v) => proseSettings.patch({ h1MarginBottom: v }),
    )}
    {@render headingRow("H2",
      s.h2Size,    (v) => proseSettings.patch({ h2Size: v }),
      s.h2Align,   (v) => proseSettings.patch({ h2Align: v }),
      s.h2FontFamily, (v) => proseSettings.patch({ h2FontFamily: v }),
      s.h2MarginTop,  (v) => proseSettings.patch({ h2MarginTop: v }),
      s.h2MarginBottom, (v) => proseSettings.patch({ h2MarginBottom: v }),
    )}
    {@render headingRow("H3",
      s.h3Size,    (v) => proseSettings.patch({ h3Size: v }),
      s.h3Align,   (v) => proseSettings.patch({ h3Align: v }),
      s.h3FontFamily, (v) => proseSettings.patch({ h3FontFamily: v }),
      s.h3MarginTop,  (v) => proseSettings.patch({ h3MarginTop: v }),
      s.h3MarginBottom, (v) => proseSettings.patch({ h3MarginBottom: v }),
    )}
  </div>
{/snippet}

{#snippet listesSection()}
  <p class="mdv-settings__section-title">Listes numérotées</p>
  <div class="mdv-settings__lists">
    <div class="mdv-settings__list-row">
      <span class="mdv-settings__list-label">Niveau 1</span>
      <select class="mdv-settings__select"
        onchange={(e) => proseSettings.patch({ olLevel1: e.currentTarget.value as OlType })}>
        {#each OL_OPTIONS as opt}<option value={opt.value} selected={s.olLevel1 === opt.value}>{opt.label}</option>{/each}
      </select>
    </div>
    <div class="mdv-settings__list-row">
      <span class="mdv-settings__list-label">Niveau 2</span>
      <select class="mdv-settings__select"
        onchange={(e) => proseSettings.patch({ olLevel2: e.currentTarget.value as OlType })}>
        {#each OL_OPTIONS as opt}<option value={opt.value} selected={s.olLevel2 === opt.value}>{opt.label}</option>{/each}
      </select>
    </div>
    <div class="mdv-settings__list-row">
      <span class="mdv-settings__list-label">Niveau 3</span>
      <select class="mdv-settings__select"
        onchange={(e) => proseSettings.patch({ olLevel3: e.currentTarget.value as OlType })}>
        {#each OL_OPTIONS as opt}<option value={opt.value} selected={s.olLevel3 === opt.value}>{opt.label}</option>{/each}
      </select>
    </div>
  </div>
{/snippet}

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="mdv-overlay__backdrop" onclick={onClose} aria-hidden="true"></div>
  <div
    class="mdv-overlay mdv-overlay--settings"
    role="dialog"
    aria-label="Paramètres"
    aria-modal="true"
  >
    <div class="mdv-settings">
      <header class="mdv-settings__header">
        <span class="mdv-settings__title">Paramètres</span>
        <Button onclick={onClose}>
          {#snippet icon()}<Icon icon={X} size={14} strokeWidth={1.5} />{/snippet}
        </Button>
      </header>

      <div class="mdv-settings__body">
        <nav class="mdv-settings__nav" aria-label="Modules">
          {#each SECTIONS as section (section.id)}
            <div
              class="mdv-settings__nav-section"
              class:is-open={expandedSections.has(section.id)}
            >
              <button
                type="button"
                class="mdv-settings__nav-section-header"
                onclick={() => toggleSection(section.id)}
                aria-expanded={expandedSections.has(section.id)}
              >
                <span class="mdv-settings__nav-chevron">
                  <Icon icon={ChevronRight} size={10} strokeWidth={2} />
                </span>
                {section.label}
              </button>
              {#if expandedSections.has(section.id)}
                <div transition:slide={{ duration: 120 }}>
                  {#each section.modules as mod (mod.id)}
                    <button
                      type="button"
                      class="mdv-settings__nav-item"
                      class:is-active={activeModule === mod.id}
                      onclick={() => (activeModule = mod.id)}
                    >
                      {mod.label}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </nav>

        <div class="mdv-settings__panel" role="region" aria-label={activeModule}>

          {#if activeModule === "style-writing"}
            {@render policesSection()}

            <p class="mdv-settings__section-title">Typographie</p>
            <div class="mdv-settings__sliders">
              <div class="mdv-settings__slider-row">
                <span class="mdv-settings__slider-label">Taille de police</span>
                <input type="range" class="mdv-settings__range" min="12" max="24" step="1"
                  value={s.fontSize}
                  oninput={(e) => proseSettings.patch({ fontSize: Number(e.currentTarget.value) })} />
                <span class="mdv-settings__slider-value">{s.fontSize} px</span>
              </div>
              <div class="mdv-settings__slider-row">
                <span class="mdv-settings__slider-label">Interligne</span>
                <input type="range" class="mdv-settings__range" min="1.3" max="2.2" step="0.05"
                  value={s.lineHeight}
                  oninput={(e) => proseSettings.patch({ lineHeight: Number(e.currentTarget.value) })} />
                <span class="mdv-settings__slider-value">{s.lineHeight.toFixed(2)}</span>
              </div>
              <div class="mdv-settings__slider-row">
                <span class="mdv-settings__slider-label">Largeur de colonne</span>
                <input type="range" class="mdv-settings__range" min="500" max="1200" step="10"
                  value={s.maxWidth}
                  oninput={(e) => proseSettings.patch({ maxWidth: Number(e.currentTarget.value) })} />
                <span class="mdv-settings__slider-value">{s.maxWidth} px</span>
              </div>
            </div>

            {@render titresSection()}
            {@render listesSection()}

            <p class="mdv-settings__section-title">CSS personnalisé</p>
            <p class="mdv-settings__hint">Ces règles remplacent les paramètres ci-dessus.</p>
            <textarea
              class="mdv-settings__css-editor"
              value={s.customCss}
              oninput={(e) => proseSettings.patch({ customCss: e.currentTarget.value })}
              spellcheck={false} autocomplete="off" autocapitalize="off"
              aria-label="CSS personnalisé pour le mode normal"
            ></textarea>
          {/if}

          {#if activeModule === "style-presentation"}
            {@render policesSection()}

            <p class="mdv-settings__section-title">Typographie</p>
            <div class="mdv-settings__sliders">
              <div class="mdv-settings__slider-row">
                <span class="mdv-settings__slider-label">Taille de police</span>
                <input type="range" class="mdv-settings__range" min="12" max="32" step="1"
                  value={s.presFontSize}
                  oninput={(e) => proseSettings.patch({ presFontSize: Number(e.currentTarget.value) })} />
                <span class="mdv-settings__slider-value">{s.presFontSize} px</span>
              </div>
              <div class="mdv-settings__slider-row">
                <span class="mdv-settings__slider-label">Interligne</span>
                <input type="range" class="mdv-settings__range" min="1.3" max="2.2" step="0.05"
                  value={s.presLineHeight}
                  oninput={(e) => proseSettings.patch({ presLineHeight: Number(e.currentTarget.value) })} />
                <span class="mdv-settings__slider-value">{s.presLineHeight.toFixed(2)}</span>
              </div>
              <div class="mdv-settings__slider-row">
                <span class="mdv-settings__slider-label">Largeur de colonne</span>
                <input type="range" class="mdv-settings__range" min="500" max="1400" step="10"
                  value={s.presMaxWidth}
                  oninput={(e) => proseSettings.patch({ presMaxWidth: Number(e.currentTarget.value) })} />
                <span class="mdv-settings__slider-value">{s.presMaxWidth} px</span>
              </div>
            </div>

            {@render titresSection()}
            {@render listesSection()}

            <p class="mdv-settings__section-title">CSS personnalisé</p>
            <p class="mdv-settings__hint">Ces règles remplacent les paramètres ci-dessus.</p>
            <textarea
              class="mdv-settings__css-editor"
              value={s.presCss}
              oninput={(e) => proseSettings.patch({ presCss: e.currentTarget.value })}
              spellcheck={false} autocomplete="off" autocapitalize="off"
              aria-label="CSS personnalisé pour le mode présentation"
            ></textarea>
          {/if}

          {#if activeModule === "marp-style"}
            <p class="mdv-settings__section-title">Thème</p>
            <div class="mdv-settings__radio-group">
              {#each (["default", "gaia", "uncover"] as MarpTheme[]) as t}
                <label class="mdv-settings__radio">
                  <input type="radio" name="marp-theme"
                    value={t}
                    checked={marpSettings.current.theme === t}
                    onchange={() => { marpSettings.current = { ...marpSettings.current, theme: t }; }} />
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </label>
              {/each}
            </div>

            <p class="mdv-settings__section-title">Format</p>
            <div class="mdv-settings__radio-group">
              {#each (["16:9", "4:3", "1:1"] as MarpSize[]) as sz}
                <label class="mdv-settings__radio">
                  <input type="radio" name="marp-size"
                    value={sz}
                    checked={marpSettings.current.size === sz}
                    onchange={() => { marpSettings.current = { ...marpSettings.current, size: sz }; }} />
                  {sz}
                </label>
              {/each}
            </div>
          {/if}

          {#if activeModule === "preamble-mathjax"}
            <p class="mdv-settings__section-title">Packages</p>
            <div class="mdv-settings__pkg-grid">
              {#each MATHJAX_PACKAGES as pkg (pkg.id)}
                <label class="mdv-settings__pkg-item">
                  <input type="checkbox"
                    checked={mathJaxPackages.current.includes(pkg.id)}
                    onchange={() => mathJaxPackages.toggle(pkg.id)} />
                  {pkg.label}
                </label>
              {/each}
            </div>

            <p class="mdv-settings__section-title">Macros LaTeX globales</p>
            <textarea
              class="mdv-settings__css-editor"
              value={mathJaxPreamble.current}
              oninput={(e) => (mathJaxPreamble.current = e.currentTarget.value)}
              spellcheck={false} autocomplete="off" autocapitalize="off"
              placeholder={"\\newcommand{\\vect}[1]{\\boldsymbol{#1}}\n\\DeclareMathOperator{\\sh}{sh}"}
              aria-label="Préambule LaTeX MathJax"
            ></textarea>
          {/if}

        </div>
      </div>

      <footer
        class="mdv-settings__footer"
        class:mdv-settings__footer--end={activeModule !== "preamble-mathjax"}
      >
        {#if activeModule === "style-writing" || activeModule === "style-presentation"}
          <button type="button" class="mdv-settings__reset" onclick={() => proseSettings.reset()}>
            Réinitialiser
          </button>
        {:else if activeModule === "marp-style"}
          <button type="button" class="mdv-settings__reset"
            onclick={() => { marpSettings.current = { theme: "default", size: "16:9" }; }}>
            Réinitialiser
          </button>
        {:else if activeModule === "preamble-mathjax"}
          <button type="button" class="mdv-settings__reset" onclick={() => (mathJaxPreamble.current = "")}>
            Réinitialiser
          </button>
          <button type="button" class="mdv-settings__restart" onclick={restartApp}>
            Relancer l'application
          </button>
        {/if}
      </footer>
    </div>
  </div>
{/if}
