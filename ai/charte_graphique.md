# Cahier de charge pour la charte graphique 

## Consignes générales
S'il le faut repartir from scrash. Établir un plan d'action par étapes et procéder étape par étape pour ne pas surcharger la fenêtre de contexte. Inscrire le pan d'action dans la section "Plan d'action", une liste ToDo dont l'état sera mis à jours au fur et à mesure.  
S'il y a des commentaires les reporter dans la section "Commentaires".

## Objectifs 
une UI thémable. Reconstruire l'aspect visuel de l'application en son état actuel mais avec une architecture CSS plus consistante, sans redondance. Respecter rigoureusement la séparation sémantique/style. 

## Détails 
- CodeMirror (avec coloration syntaxique), Preview markdown et ProseMark adoptent un style homogène avec celui de L'UI. SlideDeck a ses propres thèmes internes pour les decks, mais le style extérieur suit le thème global. 
- les propriétés de polices sont configurables séparèment. Les polices UI sont figées, celles des composants peuvent être changées dans le modal de configuation. Les thème règlent seulement les couleurs. 
- la gestion des icones reste la même, SVG inline générés à partir des icones Lucide (lucide-svelte ralenti l'application à cause des multiples requetes http). 
- au buildtime, la base ce sont les thèmes Shiki (dejà importés dans le projet). Générer le style des autres variables UI (déjà présentes) à partir de ces thèmes. Le sous-thème Shiki lui même est un import CSS du fichier Shiki original. Une piste (non obligatoire): un json unique qui contient tous les thèmes ;  
- au runtime :
    - dans l'état actuel, l'application change d'apparence au survol du nom d'un thème dans le breadcumb, le thème est validé par un clic (comme dans VScode). Conserver ce comportement et l'implémenter pour les thèmes ajoutés par l'utilisateur; 
    - l'application doit contenir une liste BUILTIN de thèmes préconfigurés. Ces thèmes sont ceux présents dans les sections neutre, catppuccin et gruvbox du menu breadcrumb actuel, ces thèmes sont permanents ; 
    - l'utilisateur peut ajouter des thèmes à partir de la liste précédemment préparée, chaque thème ajouté va dans la section crafted. Prévoir donc un bouton "Add Theme" à la racine du menu breadcrumb des thèmes. Ce bouton lance un modal de sélection avec un apercu du rendu HTML de chaque thème, sauf les BUILTIN; 
- Prendre en compte l'architecture projet, ajouter un dossier "themes" dans le dossier .azprose du projet et y inscrire le CSS individuel de chaque thème ajouté et (possiblement maintenir la liste des thèmes ajoutés dans .azprose/config.json). Les utilisateurs avancées peuvent ainsi apporter des modifications. Les thèmes BUILTIN ne sont pas concernés par cette procédure.   
- les noms des thèmes dans la breadcrumb ont une icone Light/Dark ("Sun"/"Moon") à gauche et une icone "Check" à droite pour celui qui est actif, ceux de la section crafted ont en plus une icone "Trash" à droite pour les supprimer (menu et filesystem) ;
- index.html contient le style de l'animation de départ alors qu'aucun code CSS n'est encore chargé, le compléter pour couvrir tous les thèmes, même ceux non encore "installés" par l'utilisateur. 

## Plan d'action 

## Commentaires