<h1 align="center">AZprose</h1>

<p align="center"><em>éditeur de texte— Markdown · LaTeX · Typst</em></p>

Application de bureau multi-platforme (**macOS · Windows · Linux**) conçue pour les professeurs de mathématiques en CPGE et toute personne à la recherche d'une application multi-langage pour la gestion et la rédaction de contenu scientifique. **Markdwon, LaTeX et Typst** sont pris en charge.

L'application permet de rassembler en une seule interface plusieurs technologies ouvertes. Votre contenu sera entièrement traité en local sans recours à aucun service cloud.  

## Modes 
### Markdown : 
un format de balisage très simple devenu omniprésent sur Internet. Il est très utilisé pour la rédaction de contenu pour le web et c'est le format utilisé par presque tous les modèles IA pour formater leurs réponses. L'application permet de rédiger en markdown selon deux modes et de visualiser le contenu comme une page Web. La syntaxe LaTeX est prise en charge pour le texte mathématique. 
- deux modes d'édition, un mode brute et un mode "prose". Le second applique visuellement sur place le balisage markdown et le rendu des formules mathématiques avec MathJax. 
- deux modes de visualisation : un mode normal et un mode présentation basique. Le second permet de transformer le rendu HTML en une présentation multi-pages navigable. Le séparateur markdown usuel `---` permet de créer les diapositives.

### LaTeX :
Le standard de fait de la rédaction de texte scientifique.  
L'éditeur contient les fonctions de base d'un éditeur LaTeX, y compris la recherche inverse par ctrl+clic. 

Il faut disposer d'une installation TeX/LaTeX fonctionnelle pour pouvoir compiler vos fichiers. La détection se fait automatiquement. En outre l'application a besoin que le programme TeXlab soit présent dans le système.

### Typst :
Typst est le LaTeX des temps modernes. Très léger et extrêmement rapide, il offre déjà la plupart des fonctionnalités de LaTeX, plus des capacités que ce dernier ne possède pas. Comme la gestion native des liens hypertextes et l'export directe en HTML. Son interface de programmation est en outre moins mystérieuse que celle de TeX. 

L'application a besoin pour son fonctionnement d'une installation fonctionnelle du programme tinymist. 

## Architecture 
L'application est orientée projet : on ne l'utilise pas pour éditer un fichier isolé mais pour gérer un projet avec toutes ses ressources. Chaque projet est lié à un dossier et en porte le nom. Tous les paramètres de configuration, y compris le thème de l'interface de l'application, sont liés au projet et l'accompagnent lorsqu'on le déplace ailleurs. 

Pour donner un exemple, il est déjà possible de définir, dans l'interface de configuration, un préambule LaTeX qui sera reconnu dans tous les fichiers markdown du projet. On peut ainsi envisager une configuration Mathjax par projet. À terme des fonctionnalités similaires seront mise en place pour LaTeX (et Typst). Il suffit de rédiger le contenu et un préambule lui sera ajouté au moment de la compilation. 

 

## licence

MIT


Réecris la routine d'import de colloscope. 

Le datagrid doit être éditable car le coloscope peut changer en cours d'années (changement de crénaux, de salles, rotation des profs...). Si changement, calendrier est maintenant prémuni contre les repétitions et va merger les nouvelles données après export.
 
Seule les colonnes : Matière, Colleur, Jour, Horaire, Salle doivent avoir un entête obligatoire, les autres colonnes sont plus libre (des dates ou bien sem 1, sem 2,...). Les semaine commencent à partir de 6eme colonne. Reprendre les entêtes de ces colonnes verbatim à ce stade. L'utilisateur pourra éditer les dates après coup. 
Le json des colles ne doit pas être crée à ce stade mais lorsque l'utilisateur utilisera la fonction d'export vers calendrier (pour garantir une synchronisation json/calendrier). Chaque export doit être une mise à jour sans répitition.  

Les cellules des entetes des colonnes de semaine doivent fournir une assistance d'édition sous forme d'un calendrier où on pick une date. Si on édite une cellule les suivantes s'en déduisent automatiquement par translation d'une semaine. L'utilisateur n'aura donc à intervenir que sur des colonnes particulières pour renseigner toutes les dates (sauter les semaines de vacances). 

À l'export, vers Calendar et json :
Si TOUS les entêtes des semaines contiennent un format "date" valide se baser dessus pour l'export vers calendrier et json. 
Si au moins un contient une chaine de caractères quelconque avertir l'utilisateur et s'il valide se baser uniquement sur date de début et date de fin pour l'export. 


Changements dans la formation du code md par click dans calendar de la vue Journal dans sidebar. 

États des lieux : un double --- annonce le début des colles et un --- simple sert de séparateur entre planches. Chaque planche commence par un codefence ```colle suivi du texte de la planche. Tout texte avant le codefence est ignoré dans CollePreview mais reste visible dans le Preview Général. 

Ce comportement peut être conservé. Mais on va l'enrichir pour que le Preview normal d'une daily note soit plus structuré :
- après le double --- insérer une section `# Colles`
- avant chaque codefence insérer une section H2 (`##`) avec le nom de l'élève. 

Ces changements resteront invisibles dans CollePreview. Ils seront visibles dans le Preview md normal et dans la TOC sidebar.  Tout cela sans rien changer dans les codes des preview et de la TOC. 

Par contre un comportement global de la gestion TOC doit changer. La TOC doit être construite post-transclusion md (le texte transclu doit être traité comme faisant partie de la note). Le click dans la toc sur un titre transclu dois mener à sa localisation dans la note courante, pas au md d'origine.  

Encore des ajouts :
- ajoutes les boutons zoom dans TabAction CollePreview (au milieu), selon le même principe que le zoom dans Preview md normal. Le zoom ne doit concerner que le texte md, pas les métadonnées YAML. La largeur de la zone de texte ne doit pas être altérée par le zoom. 
- les trois zones (cartes) d'une planche doivent rester visibles en tout temps. La carte du contenu doit être scrollable ;
- pour compactifier le texte "Note globale" dans le corps de la carte "Évaluation" doit être déplacé dans la zone entête de la carte (placé à droite, à gauche du chevron de repli). 
- toutes les métadonnées de la première carte doivent devenir éditable (des champs forms, à l'exception peut être de date qui est la date de la daily note). 

