<h1 align="center">AZprose</h1>

<p align="center"><em> 
Éditeur de texte — Markdown · LaTeX · Typst <br>
Assistant de gestion d'une classe en CPGE 
</em></p>

Application de bureau multi-platforme (**macOS · Windows · Linux**) conçue pour les professeurs de CPGE et toute personne à la recherche d'une application multi-langage pour la gestion et la rédaction de contenu scientifique. **Markdwon, LaTeX et Typst** sont pris en charge. Des fonctionnalités de gestion de classe sont aussi intégrées. 

L'application permet de rassembler en une seule interface plusieurs technologies ouvertes. Votre contenu sera entièrement traité en local sans recours à aucun service cloud.  

## Modes de rédaction 
### Markdown : 
un format de balisage très simple devenu omniprésent sur Internet. Il est très utilisé pour la rédaction de contenu pour le web et il est utilisé par presque tous les modèles IA pour formater leurs réponses. L'application permet de rédiger en markdown selon deux modes et de visualiser le contenu comme une page Web. La syntaxe LaTeX est prise en charge pour le texte mathématique. 
- deux modes d'édition, un mode brute et un mode "prose". Le second applique visuellement sur place le balisage markdown et le rendu des formules mathématiques avec MathJax. 
- deux modes de visualisation : un mode normal et un mode présentation basique. Le second permet de transformer le rendu HTML en une présentation multi-pages navigable.  

### LaTeX :
Le standard de fait de la rédaction de texte scientifique.  
L'éditeur contient les fonctions de base d'un éditeur LaTeX, y compris la recherche inverse par `ctrl+click`. 

Il faut disposer d'une installation TeX/LaTeX fonctionnelle pour pouvoir compiler vos fichiers. La détection se fait automatiquement. En outre l'application a besoin que le programme TeXlab soit présent dans le système.

### Typst :
Typst est le LaTeX des temps modernes. Très léger et extrêmement rapide, il offre déjà la plupart des fonctionnalités de LaTeX, plus des capacités que ce dernier ne possède pas. Comme la gestion native des liens hypertextes et l'export direct en HTML. Son interface de programmation est en outre moins mystérieuse que celle de TeX, le moteur sous-jacent du format LaTeX. 

L'application a besoin d'une installation fonctionnelle du programme tinymist. 

## Gestion de classe 
L'application peut servir comme assistant de gestion d'une classe de CPGE. Il contient un calendrier, un module tableur et un module pour filtrer des données stockées dans une base de données. La gestion est transparente et aucune connaissance spécifique sur les bases de données n'est exigible. 

L'application offre par exemple une chaîne de travail complète pour la gestion des colles : 
- import de colloscope ; 
- génération automatisée de feuilles de colles d'un jour donné en Markdown contenant les informations sur les élèves, les créneaux, etc ;
- d'importer des planches par transclusion markdown ;
- de préparer une page web qui peut servir comme interface pour l'évaluation le jour des colles. 
  
Les notes et les remarques sont automatiquement collectées dans la base de données et peuvent être retrouvées plus tard avec une interface graphique avec des capacités de filtarge (par élève, par semaine, etc).

## Architecture 
L'application est orientée projet : on ne l'utilise pas pour éditer un fichier isolé mais pour gérer un projet avec toutes ses ressources. Chaque projet est lié à un dossier et en porte le nom. Tous les paramètres de configuration, y compris le thème de l'interface de l'application, sont liés au projet et l'accompagnent lorsqu'on le déplace ailleurs. 



 

## licence

MIT

