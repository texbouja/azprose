/**
 * Tests du canal d'infrastructure — module PUR (aucun DOM). C'est ici que
 * vit l'essentiel de la logique de la phase 3 : le composant ne fait que du
 * câblage, `AgentPanel` n'ayant pas de test de rendu.
 */
// @ts-nocheck
import { describe, expect, test } from "bun:test";
import {
  actionUtilisateur,
  canalVide,
  conditionResolue,
  debutDeTour,
  estBloquant,
  fermer,
  finDeTour,
  poser,
} from "../src/lib/agent/canal-statut";

const INFO = { niveau: "info", texte: "Fournisseur connecté.", source: "modele" };
const AVERT = { niveau: "avertissement", texte: "Vérification impossible.", source: "quota" };
const ERREUR = { niveau: "erreur", texte: "Agent introuvable.", source: "agent" };

describe("priorité stricte, sans file", () => {
  test("le plus grave l'emporte sur ce qui est affiché", () => {
    const e = poser(poser(canalVide(), INFO), ERREUR);
    expect(e.message).toBe(ERREUR);
  });

  test("un message moins grave d'une AUTRE source est jeté, pas mis en attente", () => {
    const avecErreur = poser(canalVide(), ERREUR);
    const e = poser(avecErreur, INFO);
    expect(e.message).toBe(ERREUR);
    // Pas de file : l'info ne resurgit pas une fois l'erreur fermée.
    expect(fermer(e).message).toBeNull();
  });

  test("la MÊME source passe devant elle-même, même en descendant de niveau", () => {
    const refus = poser(canalVide(), { niveau: "erreur", texte: "429", source: "quota" });
    const apaise = poser(refus, { niveau: "info", texte: "Passerelle disponible.", source: "quota" });
    expect(apaise.message.niveau).toBe("info");
  });

  test("à niveau égal, le plus récent remplace", () => {
    const e = poser(poser(canalVide(), ERREUR), { ...ERREUR, texte: "Autre panne." });
    expect(e.message.texte).toBe("Autre panne.");
  });
});

describe("durées de vie", () => {
  test("info : meurt à la prochaine action de l'utilisateur", () => {
    expect(actionUtilisateur(poser(canalVide(), INFO)).message).toBeNull();
  });

  test("info : jamais d'horloge — les tours ne la touchent pas", () => {
    const e = finDeTour(finDeTour(poser(canalVide(), INFO)));
    expect(e.message).toBe(INFO);
  });

  test("avertissement : survit à une action de l'utilisateur", () => {
    expect(actionUtilisateur(poser(canalVide(), AVERT)).message).toBe(AVERT);
  });

  test("avertissement posé hors tour : meurt à la fin du tour SUIVANT", () => {
    const e = poser(canalVide(), AVERT);
    expect(finDeTour(debutDeTour(e)).message).toBeNull();
  });

  test("avertissement posé PENDANT un tour : survit à ce tour, meurt au suivant", () => {
    const e = poser(debutDeTour(canalVide()), AVERT);
    const apresTourCourant = finDeTour(e);
    expect(apresTourCourant.message).toBe(AVERT);
    expect(finDeTour(debutDeTour(apresTourCourant)).message).toBeNull();
  });

  test("erreur bloquante : ni action ni tours ne l'effacent", () => {
    let e = poser(canalVide(), ERREUR);
    e = actionUtilisateur(e);
    e = finDeTour(finDeTour(debutDeTour(e)));
    expect(e.message).toBe(ERREUR);
    expect(estBloquant(e)).toBe(true);
  });

  test("erreur bloquante : tombe seule quand sa condition se résout", () => {
    const e = poser(canalVide(), ERREUR);
    // Une session démarre → « agent introuvable » n'a plus de sens.
    expect(conditionResolue(e, "agent").message).toBeNull();
    // Une autre source ne la concerne pas.
    expect(conditionResolue(e, "catalogue").message).toBe(ERREUR);
  });

  test("erreur bloquante : fermeture manuelle pour l'inobservable", () => {
    const refus = poser(canalVide(), { niveau: "erreur", texte: "429", source: "quota" });
    expect(fermer(refus).message).toBeNull();
  });
});

test("canal vide : rien n'est bloquant, tout est inoffensif", () => {
  const v = canalVide();
  expect(v.message).toBeNull();
  expect(estBloquant(v)).toBe(false);
  expect(actionUtilisateur(v)).toEqual(v);
  expect(fermer(v).message).toBeNull();
  expect(conditionResolue(v, "agent").message).toBeNull();
  expect(finDeTour(v).message).toBeNull();
});
