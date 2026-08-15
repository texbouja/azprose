---
parent: index
---

# L'assistant

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
> contente de dialoguer avec le programme que vous avez configuré. Changer de
> modèle se fait dans OpenCode, pas ici.

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

## Vous gardez la main sur les fichiers

L'assistant peut lire et modifier les fichiers de votre coffre, mais **il vous
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

Ouvrez **Réglages** (`⌘,`) → **Markdown** → **Programmes**, et cochez les
filières qui vous concernent. Le premier programme coché devient celui que
l'assistant charge par défaut ; le bouton *définir par défaut* permet d'en
promouvoir un autre.

Les changements prennent effet à la **prochaine session** : le bouton *nouvelle
session* du panneau suffit, inutile de redémarrer l'application.

### Ce que l'assistant en fait

Quand une question touche au contenu pédagogique, il charge le programme **en
entier** — jamais un extrait, car les mentions limitatives y sont dispersées.
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

### Charger un autre programme en cours de route

Tapez `/ajouter` suivi de la filière, et éventuellement de la matière :

```
/ajouter MP mathematiques
```

L'assistant charge ce programme et vous en résume le périmètre.

### D'où viennent les programmes

AZprose est livré avec un **spécimen** de démonstration, installé
automatiquement au premier démarrage.

> [!warning] Le spécimen est partiel
> Il ne couvre que trois sections du programme de mathématiques MP/MPI, sur
> douze. C'est un exemple de format, pas un référentiel complet : une notion
> absente de ces trois sections donnera *indéterminé*, ce qui est le
> comportement correct mais peut surprendre.

Vous pouvez ajouter vos propres programmes en déposant des fichiers dans un
dossier nommé `programmes/` à la racine de votre coffre. Ils doivent respecter
le format du spécimen — c'est lui qui fait référence. À filière identique, votre
fichier remplace celui livré : la surcharge est délibérée.

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
