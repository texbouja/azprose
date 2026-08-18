/**
 * Pont MathJax pour les diagrammes — partie PURE (testable sous bun).
 *
 * Mermaid compose les mathématiques avec KaTeX, qui ignore le préambule du
 * projet et ne connaît pas les macros à arguments optionnels. Plutôt que de
 * subir ce moteur, on lui retire le travail : les formules sont remplacées par
 * des JETONS avant le rendu, composées par MathJax avec le préambule, puis
 * substituées dans le SVG produit.
 *
 * La substitution intervient APRÈS l'assainissement de Mermaid (DOMPurify) :
 * rien ne peut donc être retiré de ce qu'on injecte. C'est ce qui rend cette
 * voie praticable, là où passer un `data:` en attribut d'image serait filtré.
 */

/** Une formule extraite d'une source de diagramme. */
export interface FormuleDiagramme {
  /** Texte LaTeX, sans les délimiteurs. */
  tex: string;
  /** Jeton qui la remplace dans la source confiée à Mermaid. */
  jeton: string;
}

export interface SourceAvecJetons {
  source: string;
  formules: FormuleDiagramme[];
}

/**
 * Le pont ne vaut que pour les flowcharts.
 *
 * Eux seuls rendent leurs libellés en `<foreignObject>` HTML, où poser un SVG
 * revient à insérer un nœud et laisser le navigateur faire la mise en page.
 * Les autres types écrivent des `<text>` SVG, qui demanderaient un
 * positionnement manuel — hors périmètre.
 */
export function estFlowchart(source: string): boolean {
  const lignes = source.split("\n").map((l) => l.trim());
  let i = 0;

  // Front matter de diagramme (`---` … `---`) : c'est un BLOC, pas une ligne à
  // sauter. Ne sauter que les délimiteurs laisserait `title: …` passer pour la
  // déclaration de type.
  if (lignes[0] === "---") {
    const fin = lignes.slice(1).findIndex((l) => l === "---");
    if (fin >= 0) i = fin + 2;
  }

  const premiere = lignes.slice(i).find((l) => l.length > 0 && !l.startsWith("%%"));
  return /^(flowchart|graph)\b/.test(premiere ?? "");
}

/**
 * Jeton d'une formule.
 *
 * Uniquement des lettres et des chiffres : tout ce qui est ponctuation
 * (`[`, `|`, `"`, `{`…) a un sens dans la grammaire de Mermaid et casserait le
 * diagramme. Le remplissage `x` sert à approcher la LARGEUR de la formule —
 * Mermaid dimensionne la boîte du libellé d'après le jeton, pas d'après ce
 * qu'on y substituera ensuite.
 */
export function jetonFormule(index: number, remplissage = 0): string {
  return `MJX${index}${"x".repeat(Math.max(0, remplissage))}MJX`;
}

/** Retrouve l'index d'un jeton, ou `null` si la chaîne n'en est pas un. */
export function indexDuJeton(jeton: string): number | null {
  const m = jeton.match(/^MJX(\d+)x*MJX$/);
  return m ? Number(m[1]) : null;
}

/**
 * Remplace les `$$…$$` d'une source par des jetons.
 *
 * `largeurs` donne, pour chaque formule rencontrée dans l'ordre, le nombre de
 * caractères de remplissage à prévoir. Il est calculé par l'appelant, qui seul
 * connaît la largeur réelle de la formule composée et celle d'un caractère
 * dans la police du diagramme.
 */
export function poserJetons(source: string, largeurs: number[] = []): SourceAvecJetons {
  const formules: FormuleDiagramme[] = [];
  const avecJetons = source.replace(/\$\$([\s\S]*?)\$\$/g, (_, tex: string) => {
    const index = formules.length;
    const jeton = jetonFormule(index, largeurs[index] ?? 0);
    formules.push({ tex: tex.trim(), jeton });
    return jeton;
  });
  return { source: avecJetons, formules };
}

/** Les formules d'une source, sans rien y remplacer (premier passage : il faut
 *  les composer pour connaître leur largeur avant de poser les jetons). */
export function listerFormules(source: string): string[] {
  return [...source.matchAll(/\$\$([\s\S]*?)\$\$/g)].map((m) => m[1].trim());
}

/**
 * Substitue les formules composées dans le SVG rendu.
 *
 * Le SVG est du texte : la substitution est une simple recherche de jetons.
 * Une formule dont la composition a échoué laisse son jeton en place — ce
 * serait pire de la faire disparaître.
 */
export function substituerFormules(
  svg: string,
  formules: FormuleDiagramme[],
  composees: (string | null)[],
): string {
  let out = svg;
  formules.forEach((f, i) => {
    const compose = composees[i];
    if (!compose) return;
    out = out.split(f.jeton).join(compose);
  });
  return out;
}

/**
 * Nombre de caractères de remplissage pour qu'un jeton occupe `largeurCible`.
 *
 * `largeurCaractere` est la largeur d'un `x` dans la police des libellés. Les
 * six caractères fixes du jeton (`MJX`…`MJX`) et les chiffres de l'index sont
 * déduits : sans cela, la boîte serait systématiquement trop large.
 */
export function remplissagePour(
  largeurCible: number,
  largeurCaractere: number,
  index: number,
): number {
  if (!(largeurCaractere > 0)) return 0;
  const fixes = `MJX${index}MJX`.length;
  const total = Math.ceil(largeurCible / largeurCaractere);
  return Math.max(0, total - fixes);
}
