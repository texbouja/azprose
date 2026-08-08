# 7. Les métadonnées — front matter

Le *front matter* est un petit bloc d'**informations structurées** placé en **tout début** de note, entre deux lignes de trois tirets `---`. Il permet d'attacher des données à une note : titre, date, matière, élève, statut…

```markdown
---
titre: Suites numériques
matiere: Maths
classe: Terminale 6
statut: en-cours
---
```

Le front matter utilise le format YAML : `nom: valeur`. Il se situe **avant** le contenu, et il est masqué à l'aperçu — ce qui y est écrit ne s'affiche pas dans le rendu, mais reste lisible dans la source.

## Pourquoi l'utiliser ?

Le front matter donne à vos notes une **identité de données** que le texte seul ne peut pas porter :

- des champs de tri et de filtre (date, matière, classe) ;
- des informations destinées à d'autres outils (un tableur, un programme de gestion) ;
- des données qu'un module de l'application vient **lire ou écrire** automatiquement.

> [!example] Le cas des colles
> Dans le module colles, chaque planche de colle est décrite par un bloc de données YAML — matière, colleur, élève, date, créneau, salle, programme, notes. C'est ce bloc que l'application met à jour quand vous saisissez une évaluation. Voir le chapitre 10, [[10-colles|Les colles]].

## Ce que l'application sait faire

- **Masquer** le front matter dans l'aperçu : seule votre prose est rendue.
- **Compléter** les noms pendant que vous écrivez des [[03-wikilinks|liens]] : les notes sont identifiées par leur nom.
- **Lire** les champs pour alimenter des vues et des modules.

> [!info] Les tags du front matter
> Le front matter peut contenir une liste `tags:` — c'est une convention répandue. Dans AZprose, le panneau Tags collecte les tags écrits dans le corps avec `#` (voir le chapitre 6, [[06-vue-liens|La vue Liens]]) ; les deux formes se complètent : les `#tags` servent au panneau, les champs du front matter servent à vos données.

## Cas d'usage concrets

- **Fiche d'élève** : `nom`, `classe`, `groupe`, `email` — les champs lus par le module colles.
- **Note de cours** : `matiere`, `chapitre`, `date` — pour générer des révisions classées par matière.
- **Note de réunion** : `projet`, `participants`, `date` — pour retrouver par projet.
- **Note quotidienne** : la date est dans le nom du fichier, mais vous pouvez ajouter `humeur`, `energie`, `meteo` pour suivre vos journées.
- **Logo d'impression** : `logo` et `altlogo` sont lus par les gabarits d'impression pour afficher le logo en tête de document — voir le chapitre 9, [[09-impression#Les gabarits et templates|la section gabarits]].

## Voir aussi

- Le panneau des tags : chapitre 6, [[06-vue-liens|La vue Liens]]
- Les notes quotidiennes : chapitre 8, [[08-journal|Les notes quotidiennes]]
- Le cas d'usage complet qui met le front matter au travail : chapitre 10, [[10-colles|Les colles]]

#guide #yaml #front-matter
