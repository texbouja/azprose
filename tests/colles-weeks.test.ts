import { describe, expect, test } from "bun:test";
import {
  lundiOf,
  requiredWeekNumber,
  weekNumberForDate,
  weeksFromDates,
} from "../src/colles/weeks";

describe("weeks — lundiOf", () => {
  test("lundi de la semaine contenant la date (semaine commence le lundi)", () => {
    // 2026 : le 1er janvier est un jeudi → sa semaine commence le 2025-12-29.
    expect(lundiOf("2026-01-01")).toBe("2025-12-29");
    expect(lundiOf("2026-01-02")).toBe("2025-12-29");
    expect(lundiOf("2026-01-04")).toBe("2025-12-29"); // dimanche, fin de semaine
    expect(lundiOf("2026-01-05")).toBe("2026-01-05"); // lundi → lui-même
    expect(lundiOf("2026-10-05")).toBe("2026-10-05"); // lundi → lui-même
    expect(lundiOf("2026-10-11")).toBe("2026-10-05"); // dimanche 11 oct → lundi 5 oct
  });

  test("date invalide → chaîne vide", () => {
    expect(lundiOf("")).toBe("");
    expect(lundiOf("invalide")).toBe("");
    expect(lundiOf("2026-13-01")).toBe("");
    expect(lundiOf("2026-02-30")).toBe("");
  });
});

describe("weeks — weeksFromDates (séquences du colloscope)", () => {
  test("semaines ISO 41/42/43 d'octobre 2026 → semaines de colle 1/2/3", () => {
    // Séances des trois lundis consécutifs (ex. séquences d'une classe MPSI).
    const dates = [
      "2026-10-12",
      "2026-10-05",
      "2026-10-19",
      "2026-10-08", // jeudi de la même semaine que le lundi 05 → même semaine
    ];
    expect(weeksFromDates(dates)).toEqual([
      { weekStart: "2026-10-05", weekNum: 1 },
      { weekStart: "2026-10-12", weekNum: 2 },
      { weekStart: "2026-10-19", weekNum: 3 },
    ]);
  });

  test("les semaines sans séance (vacances) sont ABSENTES → la numérotation ne garde pas de trou", () => {
    // Semaine du 12 octobre sauté (vacances) → la semaine du 19 est la 2e.
    expect(weeksFromDates(["2026-10-05", "2026-10-19"])).toEqual([
      { weekStart: "2026-10-05", weekNum: 1 },
      { weekStart: "2026-10-19", weekNum: 2 },
    ]);
  });

  test("dates invalides ignorées ; liste vide → []", () => {
    expect(weeksFromDates(["", "invalide", "2026-10-05"])).toEqual([
      { weekStart: "2026-10-05", weekNum: 1 },
    ]);
    expect(weeksFromDates([])).toEqual([]);
  });
});

describe("weeks — weekNumberForDate", () => {
  const weeks = weeksFromDates(["2026-10-05", "2026-10-12", "2026-10-19"]);

  test("date dans une semaine de colle → son numéro", () => {
    expect(weekNumberForDate("2026-10-05", weeks)).toBe(1);
    expect(weekNumberForDate("2026-10-12", weeks)).toBe(2);
    expect(weekNumberForDate("2026-10-19", weeks)).toBe(3);
    // Un autre jour de la semaine (vendredi 09) → même semaine.
    expect(weekNumberForDate("2026-10-09", weeks)).toBe(1);
  });

  test("hors de la période du colloscope → null", () => {
    expect(weekNumberForDate("2026-09-28", weeks)).toBeNull(); // avant
    expect(weekNumberForDate("2026-10-26", weeks)).toBeNull(); // après
    expect(weekNumberForDate("2026-11-02", weeks)).toBeNull();
  });

  test("date invalide → null", () => {
    expect(weekNumberForDate("", weeks)).toBeNull();
    expect(weekNumberForDate("2026-02-30", weeks)).toBeNull();
  });
});

describe("weeks — requiredWeekNumber (échec bruyant)", () => {
  const weeks = weeksFromDates(["2026-10-05", "2026-10-12", "2026-10-19"]);

  test("date dans une semaine → numéro", () => {
    expect(requiredWeekNumber("2026-10-12", weeks, "la planche « Salma »")).toBe(2);
  });

  test("date hors du colloscope → throw explicite (date + label)", () => {
    expect(() =>
      requiredWeekNumber("2026-10-26", weeks, "la planche « Salma »"),
    ).toThrow(/Salma/);
    expect(() =>
      requiredWeekNumber("2026-10-26", weeks, "la planche « Salma »"),
    ).toThrow(/2026-10-26/);
    expect(() =>
      requiredWeekNumber("2026-10-26", weeks, "la planche « Salma »"),
    ).toThrow(/colloscope/);
  });
});
