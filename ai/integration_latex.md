# Integration LaTeX
Intégration des fonctions de base d'un éditeur LaTeX. La partie difficile est l'intégration de Synctex avec le lecteur PDF déjà mis en place (PDFjs).

**Le comportement sera calqué sur celui du mode typst déjà implémenté**. 

## Outils dans la breadcrumb 
- breadcrumb : un mode "latex" similaire à "markdown" et "typst"
- 3 boutons :
  - éditeur (CodeMirror avec support lexer latex) 
  - preview: vérifier le timestamp du .tex et du .pdf, si .tex plus récent compiler, afficher le pdf
  - build : bouton de compilation (fonction invoquée aussi preview avant affichage), moteur par défaut latexmk -pdf, si clic long pour selectionner un moteur (qui devient le moteur de compilation du fichier). Moteurs latexmk avec pdflatex, xelatex ou lualatex. Seuls ces derniers nom apparaissent dans la liste des choix.  

## Mode éditeur 
pas de live view (contrairement à Typst), mais un mode split 
- split déclenché par eye dans le handle onglet. Le .tex est compilé à la demande de l'utilisateur avec un bouton à droite de eye, même fonction de compialtion que bouton build .
- au split volet droit occupé par PDFviewer qui surveille l'état du PDF et se met à jour si changement en restant sur la même vue

## Synctex 
Explorer les options d'implémentations, chercher des projets de support Synctex avec pdfjs (extension Latex Workshop pour VScode par exemple). Disponible dans preview et dans split view. Si preview basculer vers éditeur sans split. Si dans split, utiliser volet éditeur. 

## Erreurs 
Canalisation des erreurs vers l'onglet Diagnostics de la console. Cliquer sur une erreur ramène vers la ligne fautive dans l'éditeur (en respectant le mode actif editeur seul ou split.)
