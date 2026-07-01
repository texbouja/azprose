# Cahier de charge de l'utilisateur pour la charte graphique (voir rapport themes_audit_plan)

## Consignes générales
L'application en son état actuelle n'est pas bien organisée et beaucoup de redondances y résident encore. S'il le faut repartir from scrash. Établir un plan d'action par étapes et procéder étape par étape pour ne pas surcharger la fenêtre de contexte. Créer un rapport avec une analyse technique des besoins et un plan d'action (une liste ToDo dont l'état sera mis à jours au fur et à mesure de l'avancement). 

## Objectifs 
une UI thémable. Reconstruire l'aspect visuel de l'application en son état actuel mais avec une architecture CSS plus robuste et sans redondance. Respecter rigoureusement la séparation sémantique/style. 

## Détails 
- CodeMirror (avec coloration syntaxique), Preview markdown et ProseMark adoptent un style homogène avec celui de L'UI. SlideDeck a ses propres thèmes internes pour les decks, mais le style extérieur (pager) suit le thème global. 
- les propriétés de polices sont configurables séparément. Les polices UI ne sont pas accessibles, celles des composants peuvent être changées dans le modal de configuration selon le composant. Les espaces dans les textes et les alignements sont aussi réglables par interface de configuration. Les thèmes règlent seulement les couleurs. 
- la gestion des icônes reste la même, SVG inline générés à partir des icônes Lucide (lucide-svelte en tant que service ralenti l'application). 
- au buildtime, la base ce sont les thèmes Shiki (dejà importés dans le projet). Générer le style des autres variables UI (déjà présentes) à partir de ces thèmes. Le sous-thème Shiki lui même est un import CSS du fichier Shiki original. Prévoir le traitement du terminal avec Shiki aussi dans l'architecture CSS. Une piste (non obligatoire): un json unique qui contient tous les thèmes.  ;  
- au runtime :
    - dans l'état actuel, l'application change d'apparence au survol du nom d'un thème dans le breadcumb, le thème est validé par un clic (comme dans VScode). Conserver ce comportement et l'implémenter pour les thèmes ajoutés par l'utilisateur; 
    - l'application doit contenir une liste BUILTIN de thèmes préconfigurés. Ces thèmes sont ceux présents dans les sections neutre, catppuccin et gruvbox du menu breadcrumb actuel, ces thèmes sont permanents ; 
    - l'utilisateur peut ajouter des thèmes à partir de la liste précédemment préparée (et non extensible), chaque thème ajouté va dans la section crafted. Prévoir donc un bouton "Add Theme" à la racine du menu breadcrumb des thèmes. Ce bouton lance un modal de sélection avec un apercu du rendu HTML de chaque thème, sauf les BUILTIN; 
- Prendre en compte l'architecture projet, ajouter un dossier "themes" dans le dossier .azprose du projet et y inscrire le CSS individuel de chaque thème ajouté et (possiblement maintenir la liste des thèmes ajoutés dans .azprose/config.json). Les utilisateurs avancées peuvent ainsi apporter des modifications.    
- les noms des thèmes dans la breadcrumb ont une icône Light/Dark ("Sun"/"Moon") à gauche et une icône "Check" à droite pour celui qui est actif, ceux de la section crafted ont en plus une icone "Trash" à droite pour les supprimer (menu et filesystem) ;
- index.html contient le style de l'animation de départ alors qu'aucun code CSS n'est encore chargé, le compléter pour couvrir tous les thèmes, même ceux non encore "installés" par l'utilisateur. 

# Export markdown -> pdf 
La chaîne de conversion est rudimentaire pour l'instant. Il y plusieurs piste : 
- rendu HTML (déduit de celui de Preview) avec custom CSS configurable;   
- utiliser le moteur Typst intégré et les extensions [cmaker](https://typst.app/universe/package/cmarker/#math) et [mitex](https://typst.app/universe/package/mitex);
- utiliser pdflatex et des packages comme Markdown. 
Peut être rendre le moteur configurable. L'avantage des deux dernières méthodes est de permettre un export PDF directement dans l'application. 

