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

Si l'assistant affiche « Agent introuvable », c'est qu'OpenCode n'est pas
accessible : vérifiez qu'il est installé et qu'il répond à la commande
`opencode` dans un terminal.

## Ouvrir l'assistant

Cliquez sur l'icône **étincelles** dans la barre de chemin, en haut de la
fenêtre. L'assistant s'ouvre dans le panneau latéral, à côté de votre document.

Écrivez votre demande en bas, envoyez avec `Entrée`. Pendant qu'il travaille, un
bouton **stop** interrompt la réponse en cours.

> [!note] Les réflexions sont repliées
> Certains modèles exposent leur raisonnement avant de répondre. Il s'affiche
> replié sous le libellé *réflexion* — dépliez-le si vous voulez suivre son
> cheminement, ignorez-le sinon.

## Choisir le modèle

L'en-tête du panneau porte un sélecteur **Modèle** : il liste les modèles que
votre OpenCode met à disposition — c'est-à-dire ceux des fournisseurs que vous
avez connectés avec `opencode auth login`. Un champ de filtre permet de se
retrouver dans une longue liste.

- **Défaut OpenCode** ne surcharge rien : c'est OpenCode qui choisit son
  modèle par défaut.
- Choisir un modèle l'applique **immédiatement**, sans perdre la conversation
  en cours.
- Si votre modèle n'apparaît pas — fournisseur récent, modèle confidentiel —,
  tapez directement son identifiant `fournisseur/modèle` dans le champ de
  filtre et validez avec `Entrée`.

Le choix est conservé d'une session à l'autre et vaut pour tous vos projets.
Revenir à **Défaut OpenCode** prend effet à la prochaine session (bouton
*nouvelle session*).

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
