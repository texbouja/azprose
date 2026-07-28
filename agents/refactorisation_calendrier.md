# Refactorisation de la fonction calendrier

## Architecture actuelle 
Deux fonctions en rapport avec la gestion du temps : un Journal et une vue Gestion de Colles.
Le journal est simple mais répond au besoins d'un enseignant pour tenir un journal de bord et s'intègre sans encombrement dans l'interface. La vue gestion de colle est plus complexe et son implémentation manque d'ergonomie. 

## Objectif 
Fusionner les deux vues en une seule. 
Importer les fonction Gestions de Colles dans Journal. 
La gestion de colle doit se recentrer sur le calendrier de l'enseignant (l'utilisateur de l'application) au lieu d'une vision globale de toutes les colles du centre ou il intervient.  
Des fonctions ne seront que peu utilisées (comme la formation du colloscope) et ne devraient donc pas apparaître en permanence dans l'interface.

## Réorganisation de l'interface 
Une seule vue sidebar qui regroupe les fonctions de Journal et de Gestion ds colles. La base c'est la vue Journal 
- on conserve le treeview des notes quotidiennes tel quel. 
- le calendrier Journal migre vers @event-calendar en utilisant la présentation en partie implémentée dans Gestion de colles (4 vues monthly|weekly|daily|list). 
- fonctions de @event-calendar pour implémenter le click -> note du jour (dateClick, eventClick...)
- Le calendrier reste en lecture seul dans la sidebar, ajouter un bouton "Éditer" qui l'ouvre en mode écriture dans View Panel avec possibilité de basculer entre les vues monthly|weekly|daily et des possibilités d'édition complètes avec prise en charge des événements cycliques (similaire à Google Calendar).  
- la fonction Grille de la vue Gestion de Colles est à retirer de sidebar. Se lance uniquement par command  palette (colles : gestion du colloscope) et s'ouvre dans View Panel en mode écriture (traduction json pour le stockage)
- la fonction "importer" se lance uniquement par command palette (colles : importer colloscope) et donne accès aux fonctions déjà en place, une fois le colloscope importé ouvrir la "grille" dans View Panel de façon normale.
-   Il manque à l'implementation actuelle : la composition des groupes de colles. Un spreadsheet suffit avec les colonnes 
ID, Nom, Prénom, Classe, Groupe, Email. 
C'est de là que  seront tirés les infos des élèves dans un groupe de colle. Deux fonctions qui se déclenchent par command palette :
    - Colles : liste des élèves (ouvre le spreadsheet)
    - Colles : importer la listes des élèves (import csv ou xlsx)
- ne pas réintroduire les autres boutons de la vue Gestion des colles

## Gestion stockage 
- le colloscope et la liste des élèves sont stockés sous forme json dans .aszprose/data/. Les boutons command palettte construisent le spreadsheet éditable dans View Panel et veillent à la synchronisation avec le json. 
- le json est utilisé pour renseigner les notes daily (à la création), chaque note contient la section `## Travaux en classe` et quand il y a une colle dans le calendrier une section `## Colles` 
- le calendrier est stocké sous son format natif dans .azprose/calendar. La fonction "éditer" permet de l'éditer sous forme visuelle dans View Panel. Lecture seule dans Sidebar, click sur une date implique création de la note de ce jour (si elle n'existe pas).

## Scripting/parsing 
Penser à une stratégie qui rende certaine parties des daily note actives ou interprétables dans le rendu HTML. 
Par exemple utiliser les codeblock comme dataview pour Obsidian. Les syntaxe dans ces blocs doit rester élémentaire, YAML suffit car juste des métadonnée. 
exemple 
```colle
date : <date formatée>
eleve : NOM eleve 
groupe : Groupe
classe : Classe
note : [N1,N2,N3,N4,N5]
```
Un tel bloc sera généré automatiquement après la section `## Colles` pour chaque élève qui a colle à la date de la note. 
L'enseignant pour ajouter des questions/exercices par transclusion à partir d'une banque md.  
Le bloc sera traité avec YAML est transformé en contenu HTML. 

## Piste à explorer 
- exploitation des tags à l'aide markdown-oxide
- agrégation de contenu : former un cahier de suivi à partir des daily notes, rassembler en une seule note toutes les fiches de colles, collecter les notes de colles...


Il y a deux modules qui peuvent servir :
https://github.com/svar-widgets/excel-import
Il peut remplacer la backend d'import xlsx/csv vers datagrid SVAR. il respecte le format de données natif svar.

https://github.com/svar-widgets/export-popup (surtout utile pour la logique d'implémntation je pense)

Un exemple d'implémentation de SVAR Calendar React avec nextjs comme backend : 
https://github.com/svar-widgets/react-calendar-demo-nextjs
pourrait être utile pour la partie storage. Explores dans ce sens. 