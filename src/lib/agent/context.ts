// Contexte d'environnement de l'agent — ce qu'OpenCode ne sait pas tout seul :
// il tourne DANS AZprose, sur un vault utilisateur, avec un dossier `.azprose/`
// dont il peut assurer la maintenance (rôle d'assistance, arbitrage 2026-08-15).
//
// Mécanisme (sondé et confirmé en phase 0c) : les instructions sont un FICHIER
// écrit dans le répertoire applicatif Tauri (`$APPDATA`) — HORS du vault, donc
// l'utilisateur final ne peut pas le rendre inutilisable par accident — et la
// configuration est injectée par la variable d'environnement
// `OPENCODE_CONFIG_CONTENT` au spawn (inline, MERGÉE avec la config globale de
// l'utilisateur : son auth et ses providers survivent). Aucun fichier n'est
// écrit dans le vault, aucune config existante n'est modifiée.

import type { AgentRequest } from "./types";

/** Nom du fichier d'instructions dans le répertoire applicatif. */
export const AGENT_INSTRUCTIONS_FILENAME = "agent-instructions.md";

/** Texte d'instructions. Regénéré à chaque session : le rootPath est
 *  interpolé, et les évolutions du format `.azprose/` suivent l'app. */
export function buildAgentInstructions(rootPath: string): string {
  return `# Environnement AZprose

Tu es intégré à **AZprose**, un éditeur de bureau Markdown/LaTeX compatible
Obsidian. Le dossier courant (\`${rootPath}\`) est un **vault** : le projet de
l'utilisateur (cours, notes, exercices, colles) — ce n'est PAS le code source
d'une application.

## Périmètre

- Travaille dans ce dossier. Tout accès en dehors déclenche automatiquement
  une demande d'autorisation auprès de l'utilisateur.

## Le dossier \`.azprose/\`

Il contient les DONNÉES d'AZprose pour ce vault. Tu peux y faire de la
maintenance quand l'utilisateur le demande (vérifier l'intégrité, extraire des
données, ajuster une configuration) :

- \`config.json\` — réglages du projet (éditeur, thème, maths, callouts,
  favoris, latex). JSON, modifiable avec prudence.
- \`ui.json\` — préférences d'interface du projet (thème). JSON.
- \`session.json\` — onglets ouverts, état de session. JSON, réécrit par
  l'application ; n'y touche que sur demande explicite.
- \`data.db\` — base **SQLite** (calendrier, tableurs, grilles de données).
  Fichier BINAIRE : ne JAMAIS l'ouvrir avec les outils texte (read/edit) — tu
  le corromprais. Utilise \`sqlite3\` en ligne de commande, en lecture
  (\`sqlite3 .azprose/data.db ".schema"\`, \`SELECT …\`) ; toute écriture
  exige une demande explicite de l'utilisateur.
- \`csv-cache/\`, \`pdf/rectangle/\` — caches régénérables, sans valeur.

## Conventions du vault

- Markdown Obsidian : \`[[wikilinks]]\`, \`> [!callout]\`, \`#tags\`,
  \`![[transclusion]]\`, front matter YAML (\`type:\`, \`sommaire:\`,
  \`parent:\`…).
- Les CSV n'ont PAS de ligne d'en-tête (colonnes étiquetées A, B, C…).
- Régions PDF : \`![[fichier.pdf#page=N&rect=x,y,w,h]]\`.
`;
}

/** Configuration inline injectée au spawn. `external_directory: "ask"` est le
 *  DÉFAUT d'OpenCode — on le rend explicite : c'est la règle « libre dedans,
 *  autorisation dehors » (arbitrage 2026-08-15), et l'explicite survit à un
 *  changement de défaut amont. */
export function buildAgentConfig(instructionsPath: string): Record<string, unknown> {
  return {
    instructions: [instructionsPath],
    permission: {
      external_directory: "ask",
    },
  };
}

/** Variable d'environnement passée au spawn (via `acp_spawn`). */
export function buildAgentEnv(instructionsPath: string): Record<string, string> {
  return { OPENCODE_CONFIG_CONTENT: JSON.stringify(buildAgentConfig(instructionsPath)) };
}

/** Diff porté par `toolCall.content[]` (type "diff") ou `rawInput.diff`
 *  (unified) — mesuré en phase 0c : la demande de permission d'OpenCode
 *  contient le diff complet, c'est l'objet de la décision de l'utilisateur. */
export interface ToolDiff {
  path?: string;
  oldText?: string;
  newText?: string;
  unified?: string;
}

/** Extrait le diff d'une requête agent→client (permission) ou d'un
 *  `tool_call_update`. Forme observée : `content: [{ type: "diff", path,
 *  oldText, newText }]` et/ou `rawInput.diff` (unified). Repli neutre : pas
 *  de diff → undefined, jamais d'erreur. */
export function extractToolDiff(params: unknown): ToolDiff | undefined {
  const p = (params ?? {}) as {
    toolCall?: { content?: Array<{ type?: string; path?: string; oldText?: string; newText?: string }>; rawInput?: { diff?: string } };
    content?: Array<{ type?: string; path?: string; oldText?: string; newText?: string }>;
    rawInput?: { diff?: string };
  };
  const blocks = p.toolCall?.content ?? p.content ?? [];
  const diffBlock = blocks.find((b) => b.type === "diff");
  const unified = p.toolCall?.rawInput?.diff ?? p.rawInput?.diff;
  if (!diffBlock && !unified) return undefined;
  return {
    path: diffBlock?.path,
    oldText: diffBlock?.oldText,
    newText: diffBlock?.newText,
    unified,
  };
}

/** Ré-export pratique pour le panneau (évite un second import). */
export type { AgentRequest };
