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
 *  L'instruction ne porte qu'un COMPORTEMENT (« cherche la section qui traite
 *  du sujet ») ; la donnée passe par les outils MCP, section par section.
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
  // est servi section par section par les outils MCP. Section OMISE quand la
  // sélection est vide : l'instruction ne doit jamais désigner un document
  // inexistant, et
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
exercice, un sujet — **cherche la section qui traite du sujet, lis les
contraintes qui l'accompagnent, puis rédige.**

Appelle \`azprose_programme_chercher\` avec les mots de la question. Il rend
les sections concernées, leur texte, et les contraintes qui les visent : celles
de la section, celles des sections qui l'englobent, celles qui valent pour tout
le document. **Ce sont ces contraintes-là qui font foi** — une interdiction ne
s'interprète pas sans le contenu qu'elle restreint.

Ne charge pas un programme entier pour y chercher un point : celui de
mathématiques MPSI pèse 94 Ko pour 140 sous-sections, et tout ce que tu charges
t'est renvoyé à chaque tour de la conversation.

Les autres outils, quand la recherche ne suffit pas :

- \`azprose_programme_plan\` — le découpage du document, pour te repérer ou
  trouver l'adresse d'une section voisine.
- \`azprose_programme_section\` — le texte d'adresses précises. Ces adresses
  viennent de la recherche ou du plan : elles **ne se devinent pas** et ne
  suivent pas la numérotation écrite dans le document.
- \`azprose_verifier_perimetre\` — pour situer une notion douteuse.
- \`azprose_programme_charger\` — le document entier, **seulement** si
  l'utilisateur le demande explicitement.

**Quand plusieurs programmes sont retenus, ils s'appliquent TOUS** : un
contenu destiné à ces classes doit respecter la contrainte la plus stricte
d'entre elles. Sans \`id\`, la recherche porte sur tous ceux qui correspondent —
compare ce qu'elle rend et signale à l'utilisateur les périmètres qui divergent.

\`azprose_programme_lister\` donne les programmes disponibles.

**Désigne toujours un programme par son \`id\`** (celui que rend
\`azprose_programme_lister\`) : une filière seule en désigne plusieurs, et
l'outil refuse alors de choisir à ta place. Ne construis jamais un chemin de
fichier à partir d'un \`id\` — ils ne coïncident pas.

Les matières se désignent par un **code de quatre lettres, sans accent** —
EXACTEMENT l'un de : \`math\`, \`phys\`, \`chim\`, \`info\`, \`scii\`. Le
vocabulaire est FERMÉ : tout autre texte est refusé, y compris le nom accentué
de la matière.
Quand un argument ne correspond à rien, l'outil rend une suggestion :
**propose-la à l'utilisateur et attends sa réponse**, ne choisis jamais à sa
place.`);
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
    // Aucune commande de contextualisation (2026-08-19).
    //
    // `/ajouter` chargeait un programme entier — 94 Ko pour les mathématiques
    // MPSI — dans une conversation qui n'en traitait qu'un point, et le coût
    // était payé à CHAQUE tour. Elle demandait en outre à l'utilisateur de
    // retenir une syntaxe (filière, code de matière à quatre lettres) pour un
    // travail que le modèle fait mieux à partir de la question elle-même.
    //
    // Ce que la commande faisait est désormais un COMPORTEMENT, décrit dans
    // les instructions : chercher la section qui traite du sujet.
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
