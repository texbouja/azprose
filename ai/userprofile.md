Je suis un prof de math dans les classes préparatoires (système français). 

Aucune formation académique en informatique et, à part quelques compétences éparpillés dont aucune n'est complète, je ne suis pas un développeur. Mais je suis un utilisateur acharné qui sait récupérer un dépôt Github et le faire tourner sur son ordinateur quelque soit sa complexité. J'utilise Linux et/ou macOS, pas très grand fan de Windows. 

Je connais bien latex et j'ai créée mon propre kit (cpgekit) pour traiter tous les types de documents qu'on utilise en classes prépas. 

Je connais un peu Python, HTML, Javascript et CSS. J'ai par exemple déjà réussi à monter un site web pour les maths en prépas (que j'ai vite abondonné :)) rédigé en XML (preTeXt) et transformé avec Jekyll/ruby/sass pour fonctionner sur github.io avec un thème Jekyll. 

Ce projet est la concrétisation d'un rêve. Celui de monter mon propre environnement de travail pour la gestion et la création de contenu pédagogique (à dominate scientifique). Je m'inspire des applications que j'utilise le plus. Par rapport à une autre application généraliste je cherche à intégrer toute la logique métier dans un seul logiciel. Quelque chose que d'autres professeurs pourront utiliser de manière intuitive 
mais avec toutes les fonctions dont ils ont besoin. 

Le point d'entrée, c'est le Markdown pour sa simplicité et son omniprésence. LaTeX est incontournable en tant que standard de fait . Typst est ajouté pour sa modernité et son audace (oser défier TeX/LaTeX). 

L'application ne sera pas qu'une interface passive d'utilisation de ces langages. Elle intégrera une couche de personnalisation modifiable par l'utilisateur. Une idée simple pour illustrer le concept : utiliser du YAML dans la chaîne LaTeX pour récupérer les métadonnées d'un document et ajouter le préambule adéquat avec recours à des fichiers cls/sty personnels de l'utilisateur avant de compiler.