# AZprose, éditeur de texte scientifique 
Projet de création d'une application desktop de gestion et de création de texte scientifique capable de traiter des fichiers Markdown ou LaTeX. 
> Typst est aussi une option pour un ajout futur.

## Phase 1 : Architecture 
### Framework/Stack
Tauri avec du TypeScript vanilla, Vite/Svelte ou en dernier recours Vite/React.
### Application hôte 
Le conteneur doit offrir de base 
- l'application doit être orientée projets (comme les Vaults d'Obsidian), pour chaque projet une nouvelle fenêtre et des onglets pour les fichiers d'un même projet; 
- une sidebar qui devra recevoir un gestionnaire de fichier, une fonction de recherche/remplacement dans tout le projet... 
- gestion de fichier solide qui gère toutes les opérations usuelles, la gestion doit être orientée projets,  
- un modal de configuration avec plusieurs modules (à venir). 
### Fork possible 
l'application https://github.com/mattenarle10/markamd peut être adoptée comme base pour le projet. Architecture Tauri/React. Elle contient déjà une sidebar est un gestionnaire de fichier qui semble solide. Inconvénient : React.

## Phase 2:  Support du Markdown 
La gestion Markdown devrait adopter un paradigme WYSIWYM (LyX). L'application doit supporter MathJax tout en restant réactive et utilisable même pour de grands projets et des fichiers qui peuvent être lourds (1000+ lignes).  Elle doit gérer l'inclusion de fichiers locaux en plus des autres types d'inclusions dans les standards Markdown (comme dans Obsidian).  
### Base logicielle 
le projet Nodejs  @prosemark semble tout indiqué. Il implémente une approche WYSIWYM et il est formé de plusieurs composants, tous à retenir car tous essentiels dans une édition riche. En particulier @prosemark/latex (indispensable, intégration Mathjax).  

## Phase 3: intégration PDF 
Sans support PDF étendu, point d'application de gestion de contenu. Le composant doit pouvoir fonctionner de façon autonome ou en collaboration avec les autres composants (éditeur LaTeX, mais aussi avec ProseMark). L'accessibilité n'est pas une priorité. 

### Piste logicielle 
Une adaption du plugin Obsidian/PDF++ (https://github.com/RyotaUshio/obsidian-pdf-plus) est-elle possible ? En tout cas, sa capacité de linker dans du Markdown une sélection dans un PDF serait un must. Surtout pas React-pdf dans le cas ou Vite/React est adopté. 

## Phase 4 : support LaTeX 
Non documentée pour l'instant. 