<h1 align="center">AZprose</h1>

<p align="center"><em>éditeur de texte— Markdown · LaTeX · Typst</em></p>

Application de bureau multi-platforme (**macOS · Windows · Linux**) conçue pour les professeurs de mathématiques en CPGE et toute personne à la recherche d'une application multi-langage pour la gestion et la rédaction de contenu scientifique. **Markdwon, LaTeX et Typst** sont pris en charge.

L'application permet de rassembler en une seule interface plusieurs technologies ouvertes. Votre contenu sera entièrement traité en local sans recours à aucun service cloud.  

## Modes 
### Markdown : 
un format de balisage très simple devenu omniprésent sur Internet. Il est très utilisé pour la rédaction de contenu pour le web. C'est le format utilisé par presque tous les modèles IA pour formater leurs réponses. L'application permet de rédiger en markdown selon deux modes et de visualiser le contenu comme une page Web. La syntaxe LaTeX est prise en charge pour le texte mathématique. 
- deux modes d'édition, un mode brute et un mode "prose". Le second applique visuellement sur place le balisage markdown et le rendu des formules mathématiques avec MathJax. 
- deux modes de visualisation : un mode normal et un mode présentation basique. Le second permet de transformer le rendu HTML en une présentation multi-pages navigable. Le séparateur markdown usuel `---` permet de créer les diapositives.

### LaTeX :
Le standard de fait de la rédaction de texte scientifique.  
L'éditeur contient déjà les fonctions de base d'un éditeur LaTeX, y compris la recherche inverse par ctrl+clic. Il faut disposer d'une installation TeX/LaTeX fonctionnelle pour pouvoir compiler vos fichiers. La détection se fait automatiquement. D'autres fonctionnalités sont à venir. 

### Typst :
Typst est le LaTeX des temps modernes. Très léger et extrêmement rapide, il offre déjà la plupart des fonctionnalités de LaTeX, plus des capacités que ce dernier ne possède pas. Comme la gestion native des liens hypertextes et l'export directe en HTML. Son interface de programmation est en outre moins mystérieuse que celle de TeX.  Aucune installation n'est nécessaire, l'application vient avec son propre moteur de compilation typst.  

## Architecture 
L'application est orientée projet : on ne l'utilise pas pour éditer un fichier isolé mais pour gérer un projet avec toutes ses ressources. Chaque projet est lié à un dossier et en porte le nom. Tous les paramètres de configuration, y compris le thème de l'interface de l'application, sont liés au projet et l'accompagnent lorsqu'on le déplace ailleurs. 

Pour donner un exemple, il est déjà possible de définir, dans l'interface de configuration, un préambule LaTeX qui sera reconnu dans tous les fichiers markdown du projet. On peut ainsi envisager une configuration Mathjax par projet. À terme des fonctionnalités similaires seront mise en place pour LaTeX (et Typst). Il suffit de rédiger le contenu et un préambule lui sera ajouté au moment de la compilation. 

Une syntaxe commune très légère (YAML), permettra de renseigner les métadonnées du fichier quelque soit son format : type de document, auteur, date, échéances, package à charger... Ces données seront traduites à la volée en code latex/typst avant compilation. Ces mêmes métadonnées seront utilisée dans d'autres parties de l'application pour des opérations d'indexation, de filtrage et d'agrégation de contenu.         

## licence

MIT


