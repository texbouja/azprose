// Ambiance TS pour @svar-ui/filter-store.
// Le champ "types" du package.json pointe vers `dist/types/index.d.ts`, mais ce fichier
// n'existe pas dans la release (le vrai fichier est `dist/types/src/index.d.ts`).
// Résultat : TypeScript ne résout aucune déclaration et les imports deviennent `any` implicite.
// On re-exporte donc la surface typée depuis le chemin réel.
declare module "@svar-ui/filter-store" {
  export * from "@svar-ui/filter-store/dist/types/src/index";
}
