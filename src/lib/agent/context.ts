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

/** Callout tel que déclaré dans la config du vault (forme de CalloutDef,
 *  reprise ici pour ne pas importer le store à runes — module PUR testable). */
export interface AgentCalloutInfo {
  name: string;
  label: string;
  builtin: boolean;
}

/** Programme retenu pour ce projet — **un nom, pas un contenu**.
 *
 *  L'instruction ne porte qu'un COMPORTEMENT (« charge-les quand la question
 *  est pédagogique ») ; la donnée continue de passer par `azprose_programme_charger`.
 *
 *  La sélection en compte **plusieurs** : un professeur de seconde année veut
 *  couramment aussi les limites de la première, et un polycopié commun à deux
 *  filières doit respecter les deux. */
export interface AgentProgramme {
  filiere: string;
  matiere?: string;
  niveau?: string;
}

/** Plus aucune option de DONNÉES (R2, 2026-08-15).
 *
 *  Le préambule mathématique et la liste des callouts étaient auparavant
 *  interpolés dans ce texte. Ils sont désormais servis par les outils MCP
 *  `azprose_vault_preambule_math` et `azprose_vault_callouts` — doctrine du rectificatif :
 *  **une donnée ne s'écrit jamais dans les instructions**, elle s'expose comme
 *  outil dont la réponse fait foi. Bénéfice second : elles ne sont plus payées
 *  dans le contexte à chaque tour, mais seulement quand l'agent les demande.
 *
 *  Cette interface reste — vide — pour que la signature de
 *  `buildAgentInstructions` ne change pas au gré des phases. */
export interface AgentInstructionOptions {
  /** Programmes retenus pour ce projet (noms seuls — cf. `AgentProgramme`). */
  programmes?: AgentProgramme[];
}

/**
 * Texte d'instructions — **comportement uniquement** (R2, 2026-08-15).
 *
 * Ce qui y reste : ce qui vaut à CHAQUE réponse et ne peut pas faire l'objet
 * d'un appel — conventions d'écriture, et consignes d'usage des outils.
 * Ce qui en est parti : toute donnée (préambule, callouts, description des
 * fichiers `.azprose/`), désormais servie par le serveur MCP.
 *
 * ⚠️ Construit par concaténation, PAS un unique template literal : le texte
 * contient des backticks et des antislashes.
 */
export function buildAgentInstructions(rootPath: string, opts: AgentInstructionOptions = {}): string {
  const parts: string[] = [
    `# Environnement AZprose

Tu es intégré à **AZprose**, un éditeur de bureau Markdown/LaTeX compatible
Obsidian. Le dossier courant (\`${rootPath}\`) est un **vault** : le projet de
l'utilisateur (cours, notes, exercices, colles) — ce n'est PAS le code source
d'une application.

## Périmètre

- Travaille dans ce dossier. Tout accès en dehors déclenche automatiquement
  une demande d'autorisation auprès de l'utilisateur.

## Outils AZprose — à interroger plutôt qu'à deviner

Un serveur d'outils te donne accès aux données de ce vault. Leur réponse fait
foi : ne suppose pas, ne recopie pas de mémoire, appelle-les.

Leurs noms commencent TOUS par \`azprose_\` — c'est le nom du serveur, et
c'est sous ce nom qu'ils te sont présentés. Un outil appelé sans ce préfixe
n'existe pas.

- \`azprose_vault_preambule_math\` — macros LaTeX en vigueur. **Appelle-le avant
  d'écrire des formules** : ne réinvente pas une notation qui existe déjà.
- \`azprose_vault_callouts\` — types d'encadrés disponibles, builtin et personnalisés.
  Appelle-le avant d'employer un \`> [!type]\`.
- \`azprose_vault_donnees_description\` — rôle et format de chaque fichier de
  \`.azprose/\`. Appelle-le avant d'y toucher.
- \`azprose_base_interroger\` — **seul** accès légitime à \`.azprose/data.db\`
  (calendrier, tableurs, grilles). Lecture seule.

## Conventions d'écriture

- Markdown Obsidian : \`[[wikilinks]]\`, \`#tags\`, \`![[transclusion]]\`,
  front matter YAML (\`type:\`, \`sommaire:\`, \`parent:\`…).
- Maths : \`$…$\` en ligne, \`$$…$$\` en bloc, composées par MathJax.
- Callouts : \`> [!type]\` en tête d'un bloc de citation ; suffixe \`+\` =
  pliable déplié, \`-\` = pliable replié ; titre libre possible après le type.
- Les CSV n'ont PAS de ligne d'en-tête (colonnes étiquetées A, B, C…).
- Régions PDF : \`![[fichier.pdf#page=N&rect=x,y,w,h]]\`.

Ces conventions valent dans tes réponses — elles sont rendues — comme dans les
documents que tu rédiges.`,
  ];

  // Programmes retenus : des NOMS et une consigne, jamais le contenu — celui-ci
  // reste servi par `azprose_programme_charger`. Section OMISE quand la sélection est
  // vide : l'instruction ne doit jamais désigner un document inexistant, et
  // sans programme l'assistant travaille sans contrainte, ce qui est un état
  // normal et non une panne.
  const progs = (opts.programmes ?? []).filter((p) => p.filiere);
  if (progs.length > 0) {
    const lignes = progs
      .map((p) => {
        const details = [p.matiere, p.niveau && `année ${p.niveau}`].filter(Boolean).join(", ");
        return `- **${p.filiere}**${details ? ` — ${details}` : ""}`;
      })
      .join("\n");
    parts.push(`## Programmes officiels de ce projet

${lignes}

Dès qu'une question touche au contenu pédagogique — rédiger un cours, un
exercice, un sujet — charge-les avec \`azprose_programme_charger\` et vérifie les
notions douteuses avec \`azprose_verifier_perimetre\`.

**Quand plusieurs programmes sont retenus, ils s'appliquent TOUS** : un
contenu destiné à ces classes doit respecter la contrainte la plus stricte
d'entre elles. Signale-le à l'utilisateur quand les périmètres divergent.

Un programme se lit **en entier** : ne travaille jamais sur un extrait, les
mentions limitatives sont dispersées — la synthèse en tête du document les
rassemble. \`azprose_programme_lister\` donne les autres programmes disponibles ;
l'utilisateur peut en charger un de plus avec \`/ajouter\`.`);
  }

  return parts.join("\n\n") + "\n";
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
      // ── data.db : une INTERDICTION, plus une supplique (R2) ──────────────
      // Les instructions se contentaient de demander à l'agent de ne pas
      // ouvrir cette base avec les outils texte — un modèle peut l'ignorer, et
      // rien ne le détecte. Le refus est appliqué par le harness lui-même :
      // lire ou éditer ce fichier binaire le corromprait, et l'outil MCP
      // `azprose_base_interroger` en offre l'accès légitime.
      // Deux motifs : le fichier est à la racine du vault, mais tous les
      // moteurs de glob ne font pas correspondre `**/` à une profondeur nulle.
      read: { ".azprose/data.db": "deny", "**/.azprose/data.db": "deny" },
      edit: { ".azprose/data.db": "deny", "**/.azprose/data.db": "deny" },
    },
    // Commandes personnalisées injectées PAR LA CONFIG (R0 : la clé `command`
    // est supportée) — donc aucun dossier `.opencode/` à créer dans le vault
    // de l'utilisateur. `$1`/`$2` sont les arguments positionnels.
    command: {
      ajouter: {
        description: "Charger un programme officiel dans la conversation",
        template:
          "Charge le programme officiel de la filière $1" +
          " (matière : $2, vide = toutes) avec l'outil `azprose_programme_charger`," +
          " puis résume en trois lignes son périmètre et ses limites" +
          " principales. Si aucun programme ne correspond, dis-le et liste" +
          " ce qui est disponible avec `azprose_programme_lister`.",
      },
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

/**
 * Texte détaillé d'un appel d'outil, pour le corps du bloc dépliable.
 *
 * Sans lui, une tâche de sous-agent — qui ne produit aucun diff — affichait un
 * chevron ouvrant sur le VIDE. Une affordance qui ne tient pas sa promesse est
 * pire que pas d'affordance : le panneau n'affiche désormais le chevron que
 * s'il y a quelque chose à montrer.
 *
 * Ordre de préférence : le contenu textuel rendu, puis la sortie brute, puis
 * l'entrée brute — du plus lisible au plus technique.
 */
export function extractToolBody(params: unknown): string | undefined {
  const p = (params ?? {}) as {
    toolCall?: { content?: unknown; rawOutput?: unknown; rawInput?: unknown };
    content?: unknown;
    rawOutput?: unknown;
    rawInput?: unknown;
  };
  const blocs = p.toolCall?.content ?? p.content;

  if (Array.isArray(blocs)) {
    const morceaux: string[] = [];
    for (const b of blocs) {
      if (!b || typeof b !== "object") continue;
      const bloc = b as { type?: string; text?: string; content?: { text?: string } };
      // Le diff a son propre rendu (D14) — ne pas le dupliquer en texte.
      if (bloc.type === "diff") continue;
      const texte = bloc.text ?? bloc.content?.text;
      if (typeof texte === "string" && texte.trim()) morceaux.push(texte.trim());
    }
    if (morceaux.length > 0) return morceaux.join("\n\n");
  }

  for (const brut of [p.toolCall?.rawOutput ?? p.rawOutput, p.toolCall?.rawInput ?? p.rawInput]) {
    if (brut == null) continue;
    if (typeof brut === "string" && brut.trim()) return brut.trim();
    try {
      const s = JSON.stringify(brut, null, 2);
      // Un objet vide n'apprend rien : ne pas ouvrir un bloc pour « {} ».
      if (s && s !== "{}" && s !== "[]") return s;
    } catch { /* non sérialisable : rien à montrer */ }
  }
  return undefined;
}

/** Ré-export pratique pour le panneau (évite un second import). */
export type { AgentRequest };
