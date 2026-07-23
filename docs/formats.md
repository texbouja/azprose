# Documentation Technique Backend : Typst, LaTeX et Markdown

Ce document présente une analyse comparative de l'architecture, du fonctionnement et des caractéristiques techniques des moteurs **Typst**, **LaTeX** et **Markdown**.

---

## 1. Présentation de l'Architecture Backend

Contrairement à **LaTeX**, qui s'appuie sur une distribution lourde et modulaire composée de multiples exécutables et paquets système (`pdflatex`, `biber`, TeX Live, etc.), **Typst** repose sur une architecture moderne « tout-en-un ». Son moteur de rendu est conçu sous forme de bibliothèque (*crate* Rust) embarquée dans un binaire unique et autonome. 

Cette conception élimine le besoin d'installations préalables ou de gestionnaires de paquets complexes : les dépendances sont téléchargées à la volée de manière transparente, et le compilateur permet une analyse syntaxique incrémentale en temps réel, garantissant un rendu instantané à chaque modification du document.

---

## 2. Intégration dans le Language Server Protocol (LSP) : Tinymist

Tinymist est l'implémentation LSP de référence pour Typst. Plutôt que de piloter un exécutable externe en ligne de commande (CLI), Tinymist importe directement les bibliothèques Rust du compilateur Typst dans son propre processus en mémoire.

### Avantages de cette approche :
* **Compilateur embarqué :** L'extension fournit son propre moteur de compilation. Aucune installation préalable du compilateur Typst sur le système hôte n'est requise.
* **Compilation incrémentale :** L'état du document est conservé en mémoire pour ne recompiler que les zones modifiées à chaque frappe de touche, évitant toute latence.
* **Synchronisation bidirectionnelle :** Permet une correspondance précise au niveau du caractère entre le code source `.typ` et la prévisualisation rendue (Jump to Code / SyncTeX moderne).
* **Isolation :** Possibilité de forcer l'utilisation d'un binaire externe spécifique via le paramètre de configuration `Tinymist Typst Path` si nécessaire.

---

## 3. Programmabilité, Écosystème et Extensions

### Programmabilité et Langage
* **Typst (Langage de script intégré) :** 
  Typst intègre un véritable langage de programmation fonctionnel et typé directement dans la syntaxe du document. Il propose des structures de contrôle (`#if`, `#for`, `#while`), des fonctions personnalisées, la manipulation de tableaux/dictionnaires, et un système de règles de mise en page (*show/set rules*) très expressif. La programmation y est intuitive et sécurisée.
* **LaTeX (Macro-langage impératif) :** 
  Le langage TeX repose sur un système d'expansion de macros particulièrement complexe et historique. La programmation avancée y exige souvent de recourir à des extensions bas niveau (comme `expl3`) ou à des moteurs d'exécution tiers (tels que LuaTeX), ce qui rend le débogage complexe et gourmand en ressources.
* **Markdown (Langage de balisage pur) :** 
  Markdown n'est pas programmable nativement. Toute logique de calcul ou de manipulation de structure nécessite un préprocesseur externe ou l'utilisation d'outils tiers (comme Pandoc avec des filtres Lua/Python).

### Écosystème et Gestion des Paquets
* **Typst (Registre centralisé `@preview`) :** 
  Les extensions et modèles Typst sont gérés via un registre officiel centralisé sur GitHub. L'importation d'un module se fait par une simple déclaration dans le document (ex: `#import "@preview/tablex:0.1.0"`). Les paquets sont téléchargés et mis en cache automatiquement à la volée, sans nécessiter de gestionnaire de paquets dédié sur le système hôte.
* **LaTeX (CTAN & Distributions locales) :** 
  S'appuie sur le réseau CTAN (*Comprehensive TeX Archive Network*). L'installation des paquets nécessite soit une mise à jour préalable de l'ensemble de la distribution locale (via `tlmgr` ou `MikTeX Console`), soit l'inclusion manuelle des fichiers `.sty` dans le répertoire du projet.
* **Markdown (Extensions d'analyseurs) :** 
  L'écosystème d'extensions dépend entièrement de l'analyseur (*parser*) ou de l'éditeur utilisé (ex: dialectes CommonMark, GFM, MDX). L'ajout de fonctionnalités (support mathématique, diagrammes Mermaid, notes de bas de page) se fait au niveau de l'environnement d'exécution plutôt que dans le document lui-même.

---

## 4. Capacités d'Exportation

| Format cible | Typst | LaTeX | Markdown |
| :--- | :--- | :--- | :--- |
| **PDF** | Nativement (moteur vectoriel haute performance, génération quasi-instantanée). | Nativement (via `pdflatex`, `xelatex` ou `lualatex`). | Nécessite un convertisseur externe (Pandoc) ou un moteur Chromium/LaTeX. |
| **Images (PNG / SVG)** | Nativement (support d'export direct page par page via l'API). | Nécessite des outils d'arrière-plan (`pdf2svg`, `imagemagick`). | Nécessite la conversion intermédiaire du rendu HTML. |
| **HTML / Web** | En cours de développement actif (export HTML expérimental). | Complexe (nécessite des convertisseurs dédiés comme `make4ht` ou `pandoc`). | Format source naturel (conversion directe et fidèle vers HTML). |
| **Document (DOCX)** | Non géré nativement (passage par Pandoc requis). | Géré via des outils tiers (`pandoc`, `latex2rtf`). | Nativement géré avec une excellente fidélité via Pandoc. |