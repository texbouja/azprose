// Rendu lisible des appels d'outils dans le panneau de l'assistant.
//
// Le protocole ACP donne le nom INTERNE de l'outil (`azprose_programme_chercher`)
// et sa réponse BRUTE — pour nos outils, un JSON de plusieurs kilo-octets. Le
// fil affichait donc une identité de code et un mur de JSON, dont l'utilisateur
// ne tire rien : ni ce que l'assistant a cherché, ni ce qu'il a trouvé.
//
// Module PUR : aucune rune, aucun accès au DOM — les règles de résumé sont
// testables, contrairement au composant.

/** Préfixe posé par OpenCode sur les outils de notre serveur MCP. */
const PREFIXE = "azprose_";

/** Libellé d'un outil, en clé i18n. `undefined` pour les outils d'OpenCode
 *  lui-même (lecture de fichier, shell…) : leur titre natif est déjà bon, et
 *  le traduire reviendrait à maintenir le vocabulaire d'un autre logiciel. */
export function cleLibelleOutil(nom: string): string | undefined {
  if (!nom.startsWith(PREFIXE)) return undefined;
  const cles: Record<string, string> = {
    vault_preambule_math: "agent.tool.preambule",
    vault_callouts: "agent.tool.callouts",
    vault_donnees_description: "agent.tool.donnees",
    base_interroger: "agent.tool.base",
    programme_lister: "agent.tool.progLister",
    programme_chercher: "agent.tool.progChercher",
    programme_plan: "agent.tool.progPlan",
    programme_section: "agent.tool.progSection",
    programme_contraintes: "agent.tool.progContraintes",
    programme_charger: "agent.tool.progCharger",
    verifier_perimetre: "agent.tool.perimetre",
  };
  return cles[nom.slice(PREFIXE.length)];
}

/** Ce qu'on affiche à la place du JSON brut.
 *
 *  `apercu` tient sur la ligne repliée, `corps` remplit le bloc déplié. Les
 *  deux sont du CONTENU (adresses, titres, citations du programme) et non des
 *  phrases : rien à traduire, et rien qui puisse mentir sur ce qui s'est passé. */
export interface ResumeOutil {
  apercu?: string;
  corps?: string;
}

interface SectionRendue {
  section?: string;
  chemin?: string;
  texte?: string;
  programme?: string;
  contraintes?: Array<{ genre?: string; texte?: string }>;
}

/** Rend une contrainte en une ligne, marquée par son genre. */
function ligneContrainte(c: { genre?: string; texte?: string }): string {
  const marque = c.genre === "hors" ? "✕" : c.genre === "non_exigible" ? "○" : "▲";
  return `    ${marque} ${c.genre ?? "?"} — ${c.texte ?? ""}`.trimEnd();
}

/** Sections trouvées, avec leur chemin et leurs contraintes. */
function rendreSections(liste: SectionRendue[]): ResumeOutil {
  if (liste.length === 0) return { apercu: "∅" };
  const lignes: string[] = [];
  for (const r of liste) {
    lignes.push(`§${r.section ?? "?"}  ${r.chemin ?? ""}`.trimEnd());
    for (const c of r.contraintes ?? []) lignes.push(ligneContrainte(c));
  }
  return {
    apercu: liste.map((r) => `§${r.section ?? "?"}`).join(" · "),
    corps: lignes.join("\n"),
  };
}

/** Noms des macros d'un préambule LaTeX — `\def\R{…}` et `\newcommand\MN[2]{…}`. */
export function macrosDuPreambule(preambule: string): string[] {
  const noms = new Set<string>();
  for (const m of preambule.matchAll(/\\(?:def|newcommand|let|renewcommand)\s*\\([A-Za-z]+)/g)) {
    noms.add(`\\${m[1]}`);
  }
  return [...noms];
}

/**
 * Résume la réponse d'un outil AZprose.
 *
 * Rend `{}` quand il n'y a rien de mieux à proposer que le brut — outil
 * d'OpenCode, réponse illisible, JSON invalide. L'appelant garde alors ce qu'il
 * avait : mieux vaut du JSON qu'un résumé faux.
 */
export function resumerOutil(nom: string, corpsBrut: string): ResumeOutil {
  if (!nom.startsWith(PREFIXE)) return {};
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(corpsBrut) as Record<string, unknown>;
  } catch {
    return {};
  }
  if (!d || typeof d !== "object") return {};

  // Un refus porte SA raison : c'est l'information la plus utile du fil, elle
  // dit pourquoi l'assistant n'a rien obtenu.
  if (d.trouve === false) {
    return { apercu: "✕", corps: typeof d.raison === "string" ? d.raison : corpsBrut };
  }

  const outil = nom.slice(PREFIXE.length);
  const tableau = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

  switch (outil) {
    case "programme_chercher":
      return rendreSections(tableau(d.resultats) as SectionRendue[]);

    case "programme_section":
      return rendreSections(tableau(d.sections) as SectionRendue[]);

    case "programme_plan": {
      const secs = tableau(d.sections) as Array<{ section?: string; titre?: string; contraintes?: number }>;
      return {
        apercu: String(d.id ?? ""),
        corps: secs.map((s) => `§${s.section ?? "?"}  ${s.titre ?? ""}${s.contraintes ? `  (${s.contraintes})` : ""}`).join("\n"),
      };
    }

    case "programme_lister": {
      const progs = tableau(d.programmes) as Array<{ id?: string }>;
      const retenus = tableau(d.retenus).map(String);
      return {
        apercu: retenus.join(" · ") || undefined,
        // Une pastille marque les programmes retenus : c'est ce qui borne la
        // recherche, et donc ce qui explique une absence de résultat.
        corps: progs.map((p) => `${retenus.includes(p.id ?? "") ? "◆" : "◇"} ${p.id ?? ""}`).join("\n"),
      };
    }

    case "programme_contraintes": {
      const cs = tableau(d.contraintes) as Array<{ genre?: string; texte?: string; section?: string }>;
      return {
        apercu: String(d.id ?? ""),
        corps: cs.map((c) => `${ligneContrainte(c).trimStart()}\n      ${c.section ?? ""}`).join("\n"),
      };
    }

    case "programme_charger":
      return {
        apercu: String(d.id ?? ""),
        corps: `${typeof d.contenu === "string" ? d.contenu.length : 0} caractères`,
      };

    case "verifier_perimetre": {
      const cites = tableau(d.citations) as Array<{ texte?: string; section?: string }>;
      return {
        apercu: String(d.statut ?? ""),
        corps: cites.map((c) => `${c.section ?? ""}\n    ${c.texte ?? ""}`).join("\n") || undefined,
      };
    }

    case "vault_preambule_math": {
      const p = typeof d.preambule === "string" ? d.preambule : "";
      const noms = macrosDuPreambule(p);
      return { apercu: noms.length ? `${noms.length}` : "∅", corps: noms.join("  ") || undefined };
    }

    case "vault_callouts": {
      const cs = tableau(d.callouts) as Array<{ nom?: string }>;
      return { apercu: cs.map((c) => c.nom ?? "").join(" · ") || "∅" };
    }

    case "vault_donnees_description": {
      const fs = tableau(d.fichiers) as Array<{ nom?: string }>;
      return { apercu: fs.map((f) => f.nom ?? "").join(" · ") || undefined };
    }

    // `base_interroger` rend des lignes de données : le brut EST le résultat,
    // le résumer le détruirait.
    default:
      return {};
  }
}
