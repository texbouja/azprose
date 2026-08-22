---
parent: index
---

# L'assistant IA

AZprose peut accueillir un **assistant conversationnel** dans un onglet du
panneau latéral : vous lui parlez en français, il lit et rédige vos notes, et il
connaît les conventions de votre coffre.

Ce chapitre décrit ce qu'il sait faire, ce qu'il ne fait pas, et surtout **ce
qui reste sous votre contrôle**.

## Ce qu'il faut installer d'abord

L'assistant ne contient aucun modèle : il s'appuie sur un programme séparé,
**OpenCode**, que vous installez vous-même une fois pour toutes.

1. Installez OpenCode en suivant les instructions de son site.
2. Ouvrez un terminal et lancez `opencode auth login` pour choisir votre
   fournisseur (OpenAI, Google, Anthropic, un modèle local avec Ollama…).

> [!important] AZprose ne voit jamais vos clés
> C'est OpenCode qui gère la connexion, les abonnements et les clés d'API.
> AZprose ne les stocke pas, ne les affiche pas et ne les transmet pas : il se
> contente de dialoguer avec le programme que vous avez configuré. Le choix du
> modèle, lui, se fait dans le panneau même — voir plus bas.

Si le **pied du panneau** affiche « Agent introuvable » en rouge, c'est
qu'OpenCode n'est pas accessible : vérifiez qu'il est installé et qu'il répond
à la commande `opencode` dans un terminal. Le message disparaît de lui-même
dès qu'une session démarre.

## Ouvrir l'assistant

Cliquez sur l'icône **étincelles** dans la barre de chemin, en haut de la
fenêtre. L'assistant s'ouvre dans le panneau latéral, à côté de votre document.

Écrivez votre demande en bas, envoyez avec `Entrée`. Pendant qu'il travaille, un
bouton **stop** interrompt la réponse en cours.

> [!note] Les réflexions sont repliées
> Certains modèles exposent leur raisonnement avant de répondre. Il s'affiche
> replié sous le libellé *réflexion* — dépliez-le si vous voulez suivre son
> cheminement, ignorez-le sinon.

## Le bandeau du bas

Le **pied du panneau** est réservé à ce qui concerne la *tuyauterie* :
connexion, catalogue, quota, changement de modèle. Rien de tout cela
n'appartient à la conversation, et rien de tout cela ne figure donc dans une
transcription exportée. Le corps du panneau, lui, reste la discussion.

Trois niveaux, avec chacun sa durée de vie :

| Couleur | Ce que c'est | Combien de temps |
|---|---|---|
| discret | une information | jusqu'à votre prochaine action dans le panneau |
| accentué | un avertissement | jusqu'à la fin de l'échange suivant |
| rouge | un blocage | jusqu'à ce que la cause disparaisse, ou que vous fermiez le message |

Un blocage ajoute aussi une **pastille rouge dans l'en-tête** du panneau : le
bas de l'écran est facile à ne pas voir, l'en-tête beaucoup moins. Quand le
message cite une adresse — le refus d'une passerelle indique souvent où
réactiver son forfait —, un bouton **Ouvrir** vous y emmène.

Un message plus grave chasse un message plus léger, jamais l'inverse : une
information périmée ne réapparaît pas une fois l'erreur résolue.

## Joindre un fichier avec `@`

Tapez **`@`** dans le champ de saisie : une liste de fichiers et de dossiers
du coffre apparaît au-dessus du champ. Continuez à taper pour filtrer par
chemin, naviguez aux flèches (`Échap` referme). `Entrée` valide : le chemin
complet s'insère — `@notes/cours/limites.md` — brièvement surligné pour
marquer l'insertion. Sur un **dossier**, `Tab` et le clic déroulent au lieu
de valider : la liste reste ouverte sur son contenu pour descendre dans
l'arborescence ; seul `Entrée` fige un dossier dans le message. Vous pouvez
mentionner plusieurs éléments dans la même demande :

```text
Compare @notes/mpsi/limites.md et @notes/mp2/continuite.md : où divergent-ils ?
```

Le contenu des fichiers mentionnés **accompagne le message** : l'assistant
n'a pas besoin d'aller les lire, il répond directement sur ce qu'ils
contiennent. Une mention de dossier n'attache rien — l'assistant explorera
le dossier lui-même si votre demande le nécessite. Seuls les fichiers texte
éditables sont proposés (notes, LaTeX, tableurs) ; pour un PDF, demandez-le
simplement par son nom — il ira le consulter lui-même.

## Rappeler une demande précédente

Comme dans un terminal : `↑` en haut du champ rappelle votre dernière
demande envoyée, `↑` encore remonte plus loin dans l'historique de la
session, `↓` redescend. Le texte en cours d'écriture est mis de côté au
premier rappel et restitué quand vous redescendez jusqu'au bout. Dans une
demande multiligne, les flèches ne rappellent l'historique qu'aux bornes —
au milieu du texte, elles déplacent simplement le curseur.

## Exporter la transcription

L'icône **télécharger** dans l'en-tête du panneau écrit la conversation
(demandes et réponses) dans un fichier Markdown horodaté —
`.azprose/export/transcription-2026-08-21-143205.md` — et l'ouvre
immédiatement dans un onglet de l'éditeur. Vous pouvez l'annoter, le lier
depuis vos notes ou l'archiver ; les exports restent dans le dossier caché
`.azprose/`, hors de votre arborescence de notes.

Pour ne récupérer qu'un message, **clic droit sur une demande ou une
réponse → Copier en Markdown** : c'est la source brute qui est copiée
(maths, code et tableaux compris), pas le rendu — collez-la dans une note,
elle reste vivante.

## Choisir le modèle

L'en-tête du panneau porte un sélecteur **Modèle**, organisé en deux sections :

- **Connectés** — les fournisseurs déjà authentifiés, dont les modèles sont
  immédiatement utilisables ;
- **Autres fournisseurs** — ceux que vous avez choisis parmi le catalogue
  complet d'OpenCode (centaines de fournisseurs, des milliers de modèles) ;
  voir [Choisir les fournisseurs affichés](#choisir-les-fournisseurs-affichés)
  plus bas. Choisir un modèle de cette section ouvre une **connexion
  intégrée** : voir plus bas.

Un champ de filtre permet de se retrouver dans une longue liste ; il fouille
les deux sections à la fois.

Si votre modèle n'apparaît pas — fournisseur récent, modèle confidentiel —,
tapez directement son identifiant `fournisseur/modèle` dans le champ de filtre
et validez avec `Entrée`.

Le sélecteur affiche le modèle **réellement en cours** : si OpenCode change de
modèle de son propre chef — par exemple pour contourner une limite temporaire —,
l'affichage suit.

### Essayer un modèle, ou en faire son défaut

Ce sont deux gestes différents, sur la même ligne du menu :

| Geste | Effet |
|---|---|
| clic sur la **ligne** | applique le modèle **tout de suite**, pour la session en cours — rien n'est mémorisé |
| clic sur la **punaise**, à droite | ce modèle devient votre **défaut** : mémorisé, appliqué à chaque nouvelle session, et appliqué immédiatement |

Essayer un modèle ne change donc plus votre défaut à votre insu. La punaise
pleine, en couleur d'accent, marque le défaut actuel ; il n'y en a **qu'un**,
et recliquer sa punaise ne fait rien — pour en changer, punaisez-en un autre.

> [!note] Tant que rien n'est punaisé
> AZprose n'impose aucun modèle : l'assistant suit le comportement par défaut
> d'OpenCode, y compris ce que vous avez pu écrire dans votre `opencode.json`.
> C'est l'état de départ, pas un réglage manquant. Dès que vous punaisez un
> modèle, en revanche, il passe devant.

Le défaut vaut pour tous vos projets, comme le chemin du binaire.

### Connecter un fournisseur

Le chemin complet : **Réglages** (`⌘,`) → *Assistant IA* → *Fournisseurs*,
cochez le fournisseur voulu — puis, dans l'en-tête du panneau assistant,
**Modèle** → section *Autres fournisseurs* → cliquez l'un de ses modèles. Le
dialogue de connexion s'ouvre. Selon ce que le fournisseur propose :

- **Clé API** — collez la clé obtenue sur le site du fournisseur ; elle est
  enregistrée dans le stockage d'OpenCode, comme le ferait `opencode auth login`.
  C'est la voie des grands fournisseurs (Anthropic, Google, DeepSeek…),
  même quand OpenCode n'annonce pas de méthode pour eux.
- **Navigateur** — votre navigateur s'ouvre sur la page d'authentification du
  fournisseur (ChatGPT, GitHub Copilot…) ; AZprose détecte la connexion dès
  qu'elle est confirmée.

Une fois connecté, le modèle demandé est appliqué et le fournisseur rejoint la
section *Connectés*. Si le modèle n'est pas actif immédiatement, lancez une
nouvelle session (bouton ↺).

> [!note] Validation à la sélection
> Pour les fournisseurs maison d'OpenCode (*zen/go*), AZprose interroge la
> passerelle dès que vous choisissez le modèle : si votre forfait est épuisé,
> le refus exact s'affiche **en pied de panneau**, en rouge — avec le délai de
> réinitialisation et un bouton vers votre espace de travail — et le modèle
> précédent reste actif.
>
> Si la vérification **n'aboutit pas** (passerelle injoignable, clé
> introuvable), le modèle est appliqué quand même, mais le pied du panneau le
> dit en avertissement. « Pas pu vérifier » n'est pas « tout va bien ».

> La connexion se fait depuis AZprose mais l'authentification appartient à
> OpenCode : les modèles connectés ici le sont aussi pour l'usage en terminal.

### Choisir les fournisseurs affichés

Le catalogue complet compte près de **deux cents fournisseurs** : tout
afficher rendrait le menu illisible. Par défaut, la section *Autres
fournisseurs* est donc vide — c'est vous qui la remplissez.

Ouvrez **Réglages** (`⌘,`) → **Assistant IA** → **Fournisseurs**, et cochez
ceux que vous voulez voir dans le menu. La liste est rangée **par popularité** :
la maison (OpenCode zen/go) et les grands éditeurs d'abord — OpenAI,
Anthropic, Google, Alibaba, DeepSeek, Moonshot, Z.ai… — puis les agrégateurs
et fournisseurs d'accès ; un champ de filtre (nom ou identifiant) permet de
se retrouver dans la liste complète.

- Les fournisseurs **connectés** apparaissent en tête : ils sont visibles dans
  le menu de toute façon, cochés ou non.
- Décocher un fournisseur le retire du menu ; si l'un de ses modèles est
  appliqué, il **reste actif** — il n'est juste plus proposé. AZprose vous
  prévient dans ce cas : rien n'est cassé, mais pour retrouver ce modèle
  dans le sélecteur, recochez le fournisseur.

> [!tip] Le filtre du menu garde la saisie libre
> Même sans fournisseur coché, taper directement un identifiant
> `fournisseur/modèle` dans le champ du sélecteur fonctionne toujours — et
> déclenche la connexion intégrée si nécessaire.

### Recharger le catalogue

Le catalogue est **conservé sur votre machine** après sa première
récupération : ouvrir le menu des modèles ne demande plus rien à OpenCode, la
liste s'affiche instantanément. Elle ne bouge que si vous le demandez, avec le
bouton **Recharger le catalogue** en haut de *Réglages* → *Assistant IA* →
*Fournisseurs*. C'est la seule action qui lance le serveur d'OpenCode : elle
prend quelques secondes, et c'est normal.

Rechargez après avoir **mis à jour OpenCode** (le catalogue mémorisé est alors
ignoré, la liste apparaît vide jusqu'au rechargement), ou si un fournisseur
que vous savez récent ne figure pas dans la liste. Une connexion réussie
rafraîchit le catalogue toute seule — le serveur tourne déjà à cet instant.

Ce fichier vit dans le dossier applicatif d'AZprose, à côté du corpus des
programmes ; il ne contient **aucune clé d'API** et n'est pas déposé dans vos
coffres.

## Vous gardez la main sur les fichiers

L'assistant IA peut lire et modifier les fichiers de votre coffre, mais **il vous
demande l'autorisation** avant chaque écriture. La demande apparaît dans le fil
de la conversation, avec l'aperçu des modifications proposées.

Trois réponses :

| Réponse | Effet |
|---|---|
| **une fois** | autorise cette action précise, et rien d'autre |
| **toujours (session)** | n'autorise plus à redemander pour ce type d'action, jusqu'à la fermeture |
| **refuser** | l'action n'a pas lieu |

> [!warning] « Toujours » ne dure que la session
> Cette autorisation n'est jamais enregistrée sur le disque. Fermez l'assistant
> ou démarrez une nouvelle session, et tout est à réautoriser. C'est voulu : une
> permission permanente s'oublie.

Un accès **en dehors** de votre coffre déclenche toujours une demande, quelles
que soient vos réponses précédentes.

## Ce qu'il sait de votre coffre

L'assistant n'a pas à deviner vos conventions : il dispose d'outils qui lui
donnent la réponse qui fait foi.

- **Vos macros mathématiques** — le préambule défini dans les réglages MathJax.
  Il l'interroge avant d'écrire une formule, plutôt que de réinventer une
  notation que vous avez déjà.
- **Vos callouts** — y compris ceux que vous avez créés (voir
  [[callouts|Les encadrés]]).
- **Le dossier `.azprose/`** — les données de votre projet, dont il connaît le
  rôle de chaque fichier.
- **La base de données** (calendrier, tableurs, grilles) — en **lecture seule**.
  Il peut la consulter pour répondre à une question, jamais la modifier.

> [!note] Un fichier protégé contre lui-même
> La base `.azprose/data.db` est un fichier binaire : l'ouvrir comme du texte le
> corromprait. AZprose interdit purement et simplement cet accès à l'assistant,
> et lui fournit à la place un moyen de la consulter proprement.

## Le respect du programme officiel

C'est la fonction pensée pour l'enseignement en classe préparatoire :
l'assistant peut **situer une notion par rapport au programme officiel** avant
de rédiger.

### Choisir vos programmes

Les programmes officiels sont **livrés avec AZprose** : rien à télécharger, rien
à installer.

Ouvrez **Réglages** (`⌘,`) → **Assistant IA** → **Programmes**, et cochez ceux
qui s'appliquent à ce projet. **Plusieurs sont possibles**, et c'est le cas
courant : un professeur de seconde année veut souvent aussi les limites de la
première, et un polycopié destiné à deux filières doit respecter les deux.

Quand plusieurs programmes sont cochés, ils s'appliquent **tous** — l'assistant
retient la contrainte la plus stricte, et vous signale les divergences.

> [!note] Sans sélection, aucune contrainte
> Si vous ne cochez rien, l'assistant travaille normalement, sans jamais
> invoquer de programme. C'est un état légitime, pas une configuration
> incomplète.

Les changements prennent effet à la **prochaine session** : le bouton *nouvelle
session* du panneau suffit, inutile de redémarrer l'application.

### Ce que l'assistant en fait

Quand une question touche au contenu pédagogique, il **cherche la section qui
traite du sujet** et ne lit que celle-là. Un programme est un gros document —
celui de mathématiques MPSI fait près de cent pages —, et tout ce qu'un
assistant charge lui est représenté à chaque échange : le lire en entier pour
une question sur les nombres complexes coûterait cher sans rien apporter.

Chaque section qu'il consulte lui arrive **avec les contraintes qui la
visent** : les siennes, celles des chapitres qui l'englobent, et celles qui
valent pour tout le document. Chacune indique le résultat officiel visé et sa
nature — exclusion, limite de portée, démonstration non exigible. Elles ne
voyagent jamais seules : une interdiction ne se comprend qu'avec le contenu
qu'elle restreint.

Vous pouvez aussi lui demander la liste complète des contraintes d'un programme
— « qu'est-ce qui est hors programme en MP ? » — ou le document entier, si vous
le voulez vraiment.

Il peut ensuite situer une notion précise et vous répondre :

| Verdict | Signification |
|---|---|
| **dans** | la notion figure au programme |
| **hors** | elle en est explicitement exclue : à ne pas traiter |
| **limitrophe** | au programme, mais avec une restriction (démonstration non exigible, portée limitée…) |
| **indéterminé** | le programme consulté ne permet pas de conclure |

> [!important] L'absence de mention n'est pas une exclusion
> Un programme énumère ce qu'il inclut, rarement ce qu'il exclut. Si une notion
> n'y figure pas, l'assistant répond **indéterminé** — jamais « hors
> programme ». À vous de trancher : lui laisser conclure à votre place serait le
> plus sûr moyen d'obtenir un refus injustifié.

### Consulter un autre programme

Vos réglages fixent les programmes habituels du projet, et l'assistant y
cherche de lui-même. Pour en consulter un autre ponctuellement — préparer un
sujet commun, vérifier ce qu'un chapitre suppose acquis de l'année précédente —
**dites-le simplement** :

> Ce que je viens d'écrire, est-ce au programme de MPSI ?

Il n'y a aucune commande à retenir, ni aucune orthographe à respecter : c'est la
question elle-même qui indique où chercher. Cela ne vaut que pour la
conversation en cours ; vos réglages ne changent pas.

> [!tip] Lever une contrainte ponctuellement
> Vous pouvez aussi demander explicitement à l'assistant d'ignorer une limite
> — pour un travail d'approfondissement, un TIPE, un élève en avance. Il vous
> suivra, en le signalant. Et si vous voulez que cette exception vaille pour la
> suite, demandez-lui de la consigner dans la mémoire du projet.

### D'où viennent les programmes

Ils sont **livrés avec l'application** et ne sont pas modifiables : c'est ce qui
garantit qu'un référentiel de conformité reste conforme. Les corrections
officielles vous parviennent avec les mises à jour d'AZprose.

> [!warning] Couverture en cours de constitution
> Le corpus est en cours de préparation. Un programme peut n'être transcrit que
> partiellement : dans ce cas les réglages l'indiquent, et une notion relevant
> d'une section non transcrite donnera *indéterminé* — ce qui est le
> comportement correct, mais peut surprendre.

## Ce que l'assistant ne fait pas

- **Il ne garde pas la conversation.** Chaque ouverture repart de zéro. Rien
  n'est enregistré, ni en local ni ailleurs.
- **Il ne voit pas vos modifications non enregistrées.** Il travaille sur les
  fichiers tels qu'ils sont sur le disque : pensez à `⌘S` avant de lui demander
  de relire un passage.
- **Il n'écrit pas dans votre texte à votre place.** Il modifie des fichiers,
  avec votre accord ; il n'insère rien au curseur.

> [!tip] Si un fichier change pendant que vous l'éditez
> Quand l'assistant modifie un document que vous avez ouvert, AZprose le
> recharge tout seul s'il n'avait pas de modification en attente. Sinon, il vous
> signale le conflit et vous laisse arbitrer — vos modifications ne sont jamais
> écrasées en silence.

## Voir aussi

- Les encadrés qu'il sait employer : [[callouts|Les encadrés]]
- Les données en tête de note : [[front-matter|Les métadonnées]]
- Le cas d'usage complet des colles : [[colles|Les colles]]

#guide #assistant #ia
