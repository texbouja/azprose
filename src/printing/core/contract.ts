/**
 * Contrat d'un type d'impression (printing.md §2.1) — le noyau overlay
 * (`core/overlay.svelte.ts` + `core/PrintOverlay.svelte`) consomme CE contrat :
 * toute la mécanique commune (machine à états, papier/marges/colonnes,
 * entête/pied, preview/export, persistance) est dans le noyau ; le type ne
 * fournit que ce qui le différencie (md vs colle).
 */
import type { PrintRequest } from "@/lib/print-request";

/** Résultat d'un export : chemin écrit / dialogue annulé / rien à exporter. */
export type PrintExportResult =
  | { status: "exported"; path: string }
  | { status: "cancelled" }
  | { status: "empty" };

/** Contexte du document à imprimer (source + identité). */
export interface PrintTypeContext {
  /** Contenu source de la note active (markdown pour md, colloscope pour colle). */
  source: string;
  /** Chemin du fichier source (null = repli défensif). */
  filePath: string | null;
}

/** Fonctionnalités binaires de l'overlay pilotées par le noyau. */
export interface PrintTypeFeatures {
  /** Afficher le choix de coquille (simple/cours/dense) — md uniquement. */
  template: boolean;
  /** Afficher le réglage « développer les wikilinks » — md uniquement. */
  expandLinks: boolean;
}

/**
 * Contrat type du noyau overlay. Chaque module (md, colle) exporte un contrat
 * statique ; le noyau instancie sa machine à états avec.
 */
export interface PrintTypeContract {
  /** Identifiant du type ("md" | "colle"). */
  id: string;
  /** Clé i18n du titre de l'overlay. */
  titleKey: string;
  /** Fonctionnalités exposées par l'overlay commun. */
  features: PrintTypeFeatures;
  /** Requête par défaut (md : A4 portrait ; colle : A4 paysage 2 colonnes…). */
  defaultRequest: PrintRequest;
  /** Charge la dernière requête persistée (repli défensif sur les défauts). */
  loadRequest: () => Promise<PrintRequest>;
  /** Persiste la requête (dernier réglage du type). */
  saveRequest: (req: PrintRequest) => Promise<void>;
  /** Nombre de feuilles à imprimer (md : 1 ; colle : nombre de planches). */
  countFor: (source: string) => number;
  /** Le type peut-il exporter avec ce nombre de feuilles ? */
  canExport: (count: number) => boolean;
  /** Clé i18n du message d'état vide (colle : aucune planche). */
  emptyKey?: string;
  /** Clé i18n de la notification de succès (variable {path}). */
  doneKey: string;
  /** Aperçu : assemble le HTML puis l'ouvre en fenêtre Chromium visible. */
  preview: (ctx: PrintTypeContext, req: PrintRequest) => Promise<string>;
  /** Export : assemble + dialogue de destination + écriture du fichier. */
  export: (ctx: PrintTypeContext, req: PrintRequest) => Promise<PrintExportResult>;
}
