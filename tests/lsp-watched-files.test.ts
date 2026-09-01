/**
 * `workspace/didChangeWatchedFiles` — le contrat que nous annoncions sans le
 * tenir (`didChangeWatchedFiles.dynamicRegistration: true`, puis un
 * `registerCapability` acquitté et jeté). Résultat : markdown-oxide nous croyait
 * en train de surveiller le coffre, ne balayait donc jamais le disque, et aucun
 * fichier créé n'entrait dans la complétion des wikilinks.
 *
 * La correspondance de motifs est la partie qui échoue en silence : un glob
 * trop strict ne lève rien, il rend juste le correctif inopérant. D'où ces cas.
 */
import { expect, test } from "bun:test";
import {
  globVersRegExp,
  surveillantsDeLEnregistrement,
  estSurveille,
  cheminDeLUri,
  CREE,
  MODIFIE,
  SUPPRIME,
} from "../src/lib/lsp/watched-files";

const DOUBLE = "**"; // écrit ainsi : la séquence littérale suivie de `/` ferme un commentaire de bloc

// ── globVersRegExp ─────────────────────────────────────────────────────────

test("l'astérisque simple ne franchit pas un séparateur", () => {
  const re = globVersRegExp("*.md");
  expect(re.test("note.md")).toBe(true);
  expect(re.test("dossier/note.md")).toBe(false);
});

test("le double astérisque suivi d'un séparateur accepte ZÉRO segment", () => {
  // Le piège central : c'est le motif que markdown-oxide enregistre, et sans
  // cette règle il raterait tous les fichiers de la racine du coffre.
  const re = globVersRegExp(`${DOUBLE}/*.md`);
  expect(re.test("note.md")).toBe(true);
  expect(re.test("cours/note.md")).toBe(true);
  expect(re.test("cours/mp2/note.md")).toBe(true);
});

test("l'extension est respectée", () => {
  const re = globVersRegExp(`${DOUBLE}/*.md`);
  expect(re.test("cours/note.txt")).toBe(false);
  expect(re.test("cours/note.markdown")).toBe(false);
});

test("le point n'est pas un joker", () => {
  expect(globVersRegExp("*.md").test("noteXmd")).toBe(false);
});

test("l'alternance {a,b} fonctionne", () => {
  const re = globVersRegExp(`${DOUBLE}/*.{md,markdown}`);
  expect(re.test("a.md")).toBe(true);
  expect(re.test("cours/a.markdown")).toBe(true);
  expect(re.test("cours/a.txt")).toBe(false);
});

test("le point d'interrogation vaut un caractère, pas un séparateur", () => {
  expect(globVersRegExp("note?.md").test("note1.md")).toBe(true);
  expect(globVersRegExp("note?.md").test("note12.md")).toBe(false);
  expect(globVersRegExp("a?b").test("a/b")).toBe(false);
});

test("les classes de caractères, négation comprise", () => {
  expect(globVersRegExp("note[0-9].md").test("note4.md")).toBe(true);
  expect(globVersRegExp("note[!0-9].md").test("note4.md")).toBe(false);
  expect(globVersRegExp("note[!0-9].md").test("notea.md")).toBe(true);
});

test("un motif absolu se compare tel quel", () => {
  const re = globVersRegExp(`/coffres/MP2/${DOUBLE}/*.md`);
  expect(re.test("/coffres/MP2/cours/x.md")).toBe(true);
  expect(re.test("/coffres/PC1/cours/x.md")).toBe(false);
});

// ── surveillantsDeLEnregistrement ──────────────────────────────────────────

test("les surveillants sont extraits d'un registerCapability", () => {
  const s = surveillantsDeLEnregistrement({
    registrations: [
      {
        id: "1",
        method: "workspace/didChangeWatchedFiles",
        registerOptions: { watchers: [{ globPattern: `${DOUBLE}/*.md` }] },
      },
    ],
  });
  expect(s).toEqual([{ motif: `${DOUBLE}/*.md`, genre: 7 }]);
});

test("les enregistrements d'AUTRES méthodes sont ignorés", () => {
  const s = surveillantsDeLEnregistrement({
    registrations: [
      { id: "1", method: "textDocument/didSave", registerOptions: { watchers: [{ globPattern: "*" }] } },
    ],
  });
  expect(s).toEqual([]);
});

test("un RelativePattern est recomposé en chemin absolu", () => {
  const s = surveillantsDeLEnregistrement({
    registrations: [
      {
        id: "1",
        method: "workspace/didChangeWatchedFiles",
        registerOptions: {
          watchers: [{ globPattern: { baseUri: "file:///coffres/MP2", pattern: `${DOUBLE}/*.md` } }],
        },
      },
    ],
  });
  expect(s[0].motif).toBe(`/coffres/MP2/${DOUBLE}/*.md`);
});

test("des params vides ou malformés ne lèvent pas", () => {
  expect(surveillantsDeLEnregistrement(undefined)).toEqual([]);
  expect(surveillantsDeLEnregistrement({})).toEqual([]);
  expect(surveillantsDeLEnregistrement({ registrations: [{}] })).toEqual([]);
});

test("cheminDeLUri décode l'URI file://", () => {
  expect(cheminDeLUri("file:///coffres/MP%202/note.md")).toBe("/coffres/MP 2/note.md");
  expect(cheminDeLUri("/deja/un/chemin")).toBe("/deja/un/chemin");
});

// ── estSurveille ───────────────────────────────────────────────────────────

const RACINE = "/coffres/MP2";
const SURVEILLANTS = [{ motif: `${DOUBLE}/*.md`, genre: 7 }];

test("un motif RELATIF est comparé à la forme relative à la racine", () => {
  // Sans cette seconde tentative, un serveur enregistrant un motif relatif — le
  // cas courant — ne recevrait jamais rien.
  expect(estSurveille("/coffres/MP2/cours/x.md", CREE, SURVEILLANTS, RACINE)).toBe(true);
});

test("un fichier hors racine ne correspond pas à un motif relatif", () => {
  expect(estSurveille("/ailleurs/x.md", CREE, SURVEILLANTS, RACINE)).toBe(false);
});

test("un fichier non Markdown est écarté", () => {
  expect(estSurveille("/coffres/MP2/x.pdf", CREE, SURVEILLANTS, RACINE)).toBe(false);
});

test("le masque WatchKind est respecté", () => {
  // genre 1 = créations SEULEMENT.
  const creationsSeules = [{ motif: `${DOUBLE}/*.md`, genre: 1 }];
  expect(estSurveille("/coffres/MP2/x.md", CREE, creationsSeules, RACINE)).toBe(true);
  expect(estSurveille("/coffres/MP2/x.md", SUPPRIME, creationsSeules, RACINE)).toBe(false);
  expect(estSurveille("/coffres/MP2/x.md", MODIFIE, creationsSeules, RACINE)).toBe(false);
});

test("SANS surveillant enregistré, tout le Markdown passe", () => {
  // Le serveur peut n'avoir pas encore enregistré quand les premiers événements
  // arrivent. Se taire alors rejouerait exactement le défaut qu'on corrige :
  // mieux vaut une notification de trop qu'un index qui reste faux.
  expect(estSurveille("/coffres/MP2/x.md", CREE, [], RACINE)).toBe(true);
  expect(estSurveille("/coffres/MP2/x.markdown", CREE, [], RACINE)).toBe(true);
  expect(estSurveille("/coffres/MP2/x.pdf", CREE, [], RACINE)).toBe(false);
});

test("les séparateurs Windows sont normalisés", () => {
  expect(estSurveille("C:\\coffres\\MP2\\cours\\x.md", CREE, SURVEILLANTS, "C:\\coffres\\MP2")).toBe(true);
});
