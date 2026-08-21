// Retranscription d'une session de l'assistant en Markdown — équivalent
// AZprose du /export de la TUI OpenCode : ici le fichier est écrit dans le
// coffre (.azprose/export/) puis ouvert dans un tab éditeur, pas dans un
// éditeur externe. Module PUR : items → chaîne Markdown ; l'écriture et
// l'ouverture restent l'affaire du panneau.

/** Un message transcrit — réflexions et outils exclus (choix utilisateur) :
 *  seule la conversation visible est transcrite. */
export interface ItemTranscription {
  kind: "user" | "agent";
  text: string;
}

const SECTIONS: Record<ItemTranscription["kind"], string> = {
  user: "Vous",
  agent: "Assistant",
};

/** Retranscription Markdown : une section par message, dans l'ordre du fil.
 *  Les messages consécutifs d'un même rôle fusionnent sous une seule section
 *  (le flux découpe les réponses autour des outils) ; les textes vides sont
 *  sautés. */
export function transcriptionMarkdown(
  items: readonly ItemTranscription[],
  meta?: { modele?: string; date?: Date },
): string {
  const date = meta?.date ?? new Date();
  const lignes: string[] = [
    "# Transcription de l'assistant",
    "",
    `Date : ${horodatage(date)}`,
  ];
  if (meta?.modele) lignes.push(`Modèle : ${meta.modele}`);
  lignes.push("", "---", "");
  let dernier = "";
  for (const item of items) {
    if (!item.text.trim()) continue;
    if (item.kind !== dernier) {
      if (dernier) lignes.push("");
      lignes.push(`## ${SECTIONS[item.kind]}`, "");
      dernier = item.kind;
    }
    lignes.push(item.text, "");
  }
  return lignes.join("\n").replace(/\n+$/, "\n");
}

/** Horodatage triable sans ambigüité : 2026-08-21-143205 */
function horodatage(d: Date): string {
  const p2 = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` +
    `-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`
  );
}

/** Nom de fichier horodaté et triable : transcription-2026-08-21-143205.md */
export function nomTranscription(d = new Date()): string {
  return `transcription-${horodatage(d)}.md`;
}
