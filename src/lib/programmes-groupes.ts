/**
 * Regroupement des programmes officiels par matière — module PUR (testable).
 *
 * Un utilisateur enseigne UNE matière : à plat, la liste lui faisait parcourir
 * une trentaine d'entrées pour en cocher deux. Le regroupement est donc de
 * l'information, pas de la décoration — c'est le critère qui départage ce qui
 * le concerne du reste.
 */

/** Ce que le regroupement a besoin de connaître d'un programme. Volontairement
 *  minimal : le composant en manipule une forme plus riche. */
export interface ProgrammeGroupable {
  id: string;
  matiere?: string;
}

export interface GroupeMatiere<T extends ProgrammeGroupable> {
  /** Matière du groupe, chaîne vide pour les programmes qui n'en déclarent
   *  pas — l'appelant y met son propre libellé traduit. */
  matiere: string;
  items: T[];
}

/**
 * Groupe par matière, matières triées alphabétiquement, sans matière EN
 * DERNIER (c'est un fourre-tout, il ne doit pas ouvrir la liste). L'ordre des
 * programmes à l'intérieur d'un groupe est celui d'entrée — le composant les
 * trie déjà par filière.
 */
export function grouperParMatiere<T extends ProgrammeGroupable>(
  programmes: T[],
): GroupeMatiere<T>[] {
  const groupes = new Map<string, T[]>();
  for (const p of programmes) {
    const cle = p.matiere?.trim() ?? "";
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle)!.push(p);
  }
  return [...groupes.entries()]
    .map(([matiere, items]) => ({ matiere, items }))
    .sort((a, b) =>
      a.matiere === "" ? 1 : b.matiere === "" ? -1 : a.matiere.localeCompare(b.matiere, "fr"),
    );
}

/**
 * Un groupe doit-il s'ouvrir ?
 *
 * Une matière dont un programme est retenu est CELLE de l'utilisateur : la
 * laisser fermée lui cacherait précisément ce qu'il a choisi. Elle s'ouvre
 * donc d'office, en plus de ce qu'il a déplié à la main.
 */
export function groupeOuvert<T extends ProgrammeGroupable>(
  groupe: GroupeMatiere<T>,
  deplies: ReadonlySet<string>,
  selection: readonly string[],
): boolean {
  return deplies.has(groupe.matiere) || groupe.items.some((p) => selection.includes(p.id));
}
