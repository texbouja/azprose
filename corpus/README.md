# Corpus des programmes officiels — guide de préparation

> **Document autoportant.** Il contient tout ce qu'il faut pour transcrire un
> programme officiel de CPGE en fichier indexé conforme. Suivre les étapes dans
> l'ordre.

## 0. Ce qu'on attend de vous

À partir d'un **PDF de programme officiel**, produire **un fichier markdown
indexé** dans ce dossier (`corpus/`), conforme au gabarit, et qui **passe le
vérificateur** sans anomalie grave.

**Un fichier par PROGRAMME RÉEL**, jamais par classe. Nommage :
`<matiere>-<portee>.md`, en minuscules, sans accent — la matière figure en
tête par son **raccourci**, la même convention que l'archive
`corpus/sources/` ; le champ `matiere:` du front matter porte le nom complet.

**Raccourcis de matières** (à étendre si besoin, une seule forme par matière) :

| Raccourci | Matière |
|---|---|
| `math` | mathématiques |
| `phys` | physique |
| `chim` | chimie |
| `si` | sciences industrielles de l'ingénieur |
| `inf` | informatique |
| `fr` · `en` | français-philosophie · anglais |

```
math-mpsi-mp2i.md     un même programme pour MPSI et MP2I
math-mp-mpi.md        MP et MPI
math-tsi1.md          TSI première année
si-commun.md          sciences industrielles, six filières, les deux années
phys-mp.md            physique, classe de MP
chim-mp.md            chimie, classe de MP
```

> ⚠️ **Ne dupliquez JAMAIS un fichier pour couvrir plusieurs filières.** Le
> champ `filiere:` est une **liste** : un seul document les déclare toutes. Le
> programme de sciences industrielles vaut pour MPSI, MP, PCSI, PSI, PTSI et PT
> — le dupliquer donnerait douze copies à corriger en parallèle, et la première
> divergence passerait inaperçue.

La matière en tête range le corpus par discipline, ce qui est la façon dont il
se parcourt quand il grossit.

### Matières combinées : un fichier PAR matière

Certains documents officiels réunissent deux disciplines — « Physique-Chimie »
en MP, par exemple. **Le corpus les scinde** : `phys-mp.md` et `chim-mp.md`,
chacun avec son front matter (`matiere: physique` / `matiere: chimie`) et sa
propre légende.

Motif : un professeur de physique qui ouvre son programme n'a rien à y faire
d'un chapitre de chimie, et l'assistant interrogé sur une notion de physique ne
doit pas citer un bandeau de thermodynamique chimique. **Chaque fichier ne
contient que la matière qu'il traite** — aucune référence au programme voisin.

Répartition des parties communes :

| Partie du document officiel | Traitement |
|---|---|
| Parties disciplinaires numérotées | dans le fichier de leur matière |
| Formation expérimentale | **scindée** : capacités de physique d'un côté, de chimie de l'autre |
| Prévention du risque | **scindée** par matière (risque électrique/optique vs risque chimique) |
| Annexe « matériel » | **scindée** par domaine (optique, électrique → physique ; chimie → chimie) |
| Annexes « outils mathématiques » et « outils numériques » | **dupliquées à l'identique** dans les deux fichiers (outils communs) |

Une phrase du document qui nomme le programme voisin s'adapte au strict
minimum (« mise en œuvre du programme **de physique** de la classe de MP » →
« du programme de la classe de MP »). C'est la seule réécriture autorisée.

> ⚠️ **Un fichier existe déjà pour votre programme ?** Vérifiez d'abord
> `corpus/`. S'il s'y trouve une transcription **partielle** (elle porte
> `statut: specimen` et un champ `couverture`), **remplacez-la** — même nom,
> même `id` — et **retirez ces deux champs** une fois le programme complet.
> Ne créez jamais un second fichier pour le même programme : le corpus en
> proposerait deux, et l'assistant ne saurait lequel fait foi.
>
> Aucun specimen ne figure actuellement dans le corpus : les programmes
> présents sont complets (`statut` et `couverture` absents).

> ⚠️ **Ces fichiers sont livrés avec l'application** et l'utilisateur ne peut
> pas les modifier. Une transcription fausse ne planterait rien : elle
> fausserait silencieusement son travail pédagogique, sans recours. C'est la
> raison d'être de toutes les règles qui suivent.

---

## 1. Lire le gabarit AVANT tout

**Le format normatif est un FICHIER, pas une description :**

```
corpus/math-mp-mpi.md      gabarit des programmes de mathématiques
corpus/phys-mp.md          gabarit des programmes de physique
corpus/chim-mp.md          gabarit des programmes de chimie
corpus/phys-mpsi.md        idem physique, classe de MPSI
corpus/chim-mpsi.md        idem chimie, classe de MPSI
```

Lisez le gabarit de votre matière en entier. Chacun porte sa propre légende
(« Comment lire ce document ») ; cette légende est **lue par l'utilisateur et
par l'assistant**, elle doit donc décrire ce que le fichier fait réellement.
Ce README explique la *démarche* ; le gabarit fait foi sur la *forme*.

---

## 2. Comprendre le document source

Les programmes alternent deux dispositions :

| Disposition | Contenu | Valeur limitative |
|---|---|---|
| **Une colonne** (bandeau, en italique) | objectifs de la section, cadre d'étude, portée | variable — **c'est souvent là que vivent les exclusions** |
| **Deux colonnes** | à gauche le programme lui-même ; à droite un commentaire ou une capacité, synchronisé paragraphe par paragraphe | forte en mathématiques, faible en physique-chimie |

Le document **définit lui-même sa structure**, en général dans une section
« Organisation du texte » du préambule. **Lisez-la** : elle énonce les
catégories officielles, et c'est sur elles que le gabarit s'aligne.

Pour le programme de mathématiques MP/MPI (2021), elle dit :

- sont **exigibles** « l'ensemble des points figurant dans la colonne de gauche » ;
- sont **hors programme** les points « indiqués dans les bandeaux et la colonne
  de droite comme étant "hors programme" » — ils « ne doivent pas être traités
  et ne peuvent faire l'objet d'aucune épreuve d'évaluation » ;
- relèvent d'**activités possibles ou souhaitables, mais non exigibles** les
  illustrations et travaux proposés.

### Ce que la colonne de droite contient, selon la discipline

C'est la différence la plus structurante entre les matières, et elle n'est pas
une question de style : elle tient à la nature des disciplines.

**En mathématiques**, la colonne de droite **borne le terrain**. Un intitulé de
notion ne dit pas où l'étude s'arrête : « réduction des endomorphismes » peut
s'entendre du calcul d'un polynôme caractéristique jusqu'à la théorie des
invariants de similitude. Sans délimitation explicite, la dérive va très loin —
d'où des exclusions **nombreuses et ciblées**, attachées à un résultat précis.
Le programme MP/MPI en porte plus de deux cents.

**En physique-chimie**, le thème porte lui-même ses limites. « Physique du
solide », « corrosion uniforme », « diffusion thermique » désignent des objets
d'étude déjà balisés par la discipline : le titre borne l'attendu, et la
colonne de droite sert alors à **énoncer ce qui est exigible** — les
« capacités exigibles » — plutôt qu'à retrancher. Les exclusions y sont donc
**rares**, et elles vivent presque toutes dans les **bandeaux** de tête de
section, où elles portent sur l'ensemble du thème.

> ⚠️ **N'inventez pas d'exclusions pour rapprocher un programme de physique
> d'un programme de mathématiques.** Une contrainte absente du texte officiel
> n'est pas un oubli à combler : c'est une information — la discipline n'a pas
> jugé nécessaire de retrancher. En ajouter une reviendrait à interdire à un
> professeur ce que le ministère autorise.

Deux conventions propres à la physique-chimie, à repérer dans la source :

- les items **en gras** de la colonne de droite désignent les **thèmes d'étude
  des travaux pratiques** ;
- les capacités préfixées « **Capacité numérique :** » mobilisent un langage de
  programmation ou un tableur.

---

## 3. Front matter

```yaml
---
id: phys-mp                       # = nom du fichier sans .md
filiere: [MP]                     # LISTE — toutes les classes concernées
matiere: physique                 # minuscules, sans accent (nom complet, pas le raccourci)
niveau: 2                         # 1 = première année, 2 = seconde
source: "Annexe 2 — Programme de physique-chimie, MESRI 2021"
---
```

**`id` = nom du fichier sans `.md`**, sans exception pour un nouveau programme.

> ⚠️ **Un `id` est un contrat, pas un détail interne.** L'utilisateur choisit
> ses programmes par cet identifiant, et son choix est persisté
> (`.azprose/config.json`). Renommer un `id` déjà livré invalide silencieusement
> sa sélection. Choisissez-le donc bien du premier coup, et ne le changez plus
> ensuite — c'est exactement pourquoi les identifiants des mathématiques
> (`mathematiques-mpsi-mp2i`, `mathematiques-mp-mpi`) restent **historiques**,
> hérités d'avant le passage aux noms courts de fichiers. Cette dérogation ne
> vaut que pour eux.

**`source`** cite le document officiel. Pour une matière combinée scindée, les
deux fichiers citent **le même document** : c'est la vérité, et c'est lui qu'il
faudra rouvrir en cas de doute.

**`filiere`** énumère les classes **telles que les enseignants les nomment** :
`MPSI`, `MP`, `MP2I`, `MPI`, `PCSI`, `PC`, `PSI`, `PTSI`, `PT`, `TSI`, `TPC`,
`BCPST`. Le document du PDF indique en général lui-même les classes visées.

**`niveau`** — à **OMETTRE** quand le programme couvre les deux années, ce qui
est le cas des sciences industrielles et de l'informatique. Un `niveau` absent
signifie « toutes les années » ; un `niveau` déclaré devient discriminant. Ne
le renseignez donc que s'il discrimine réellement.

Cas `TSI` : la première année n'a pas de nom propre. Deux fichiers,
`filiere: [TSI]` pour les deux, `niveau: 1` et `niveau: 2`.

Ajouter **uniquement si la transcription est partielle** :

```yaml
statut: specimen
couverture:
  - Structures algébriques usuelles
  - Réduction des endomorphismes et des matrices carrées
```

`couverture` énumère les **titres exacts** des sections transcrites. Sans elle,
une notion absente d'une section non transcrite serait indiscernable d'une
notion réellement hors sujet — et l'utilisateur perdrait l'information la plus
utile : « je n'en sais rien, cette partie n'est pas transcrite ».

> **Visez le programme COMPLET.** Une transcription partielle est un repli
> honnête quand vous devez vous arrêter, pas un objectif : chaque section
> manquante rend l'assistant muet là où l'enseignant attend une réponse. Si
> vous livrez complet, `statut` et `couverture` sont simplement **absents**.

---

## 4. Transposer

| Source | Devient |
|---|---|
| Titre de section (« Structures algébriques usuelles ») | `## Titre` |
| Sous-section (« a) Compléments sur les groupes ») | `### a) Compléments sur les groupes` |
| Bandeau en italique | citation `>` en tête de section |
| Chapeau de paragraphe (« Dans ce paragraphe, $\mathbb{K}$ est… ») | citation `>` en tête de sous-section |
| **Colonne de gauche** — un paragraphe | une puce de premier niveau `- …` |
| **Colonne de droite** — un commentaire limitatif (mathématiques) | un intitulé **indenté sous la puce qu'il vise** |
| **Colonne de droite** — une capacité exigible (physique-chimie) | une **puce indentée** `  - …` sous la notion qu'elle accompagne |
| Thème d'étude des TP (en gras dans la source) | la puce indentée en gras `  - **…**` |
| Énumération interne à un item (hypothèses d'un théorème, cas) | des **puces indentées** `  - …` |

L'appariement est **structurel** : ce qui est indenté appartient à la puce de
premier niveau qui le précède. C'est ce qui permet de dire plus tard *quel
résultat officiel* une contrainte vise.

Les formules restent en LaTeX : `$…$` en ligne, `$$…$$` en bloc.

### Ce que le vérificateur lit — trois règles mécaniques

Ces trois règles ne sont pas des conventions d'esthétique : le parseur
(`src-tauri/src/agent/programmes.rs`) s'appuie dessus.

1. **L'indentation porte du sens.** Une puce de premier niveau devient un
   *item* ; une puce indentée (deux espaces au moins) est un *détail* de l'item
   qui la précède et lui reste rattachée. Un intitulé placé après une notion
   **et ses capacités** vise donc la **notion**, jamais la dernière capacité.
2. **Une ligne blanche ferme un intitulé.** Le paragraphe qui suit une ligne
   blanche n'est plus dans la contrainte. Vous pouvez donc **conserver l'ordre
   du document** : un intitulé peut vivre au milieu d'un bandeau, suivi d'un
   paragraphe ordinaire, sans que la contrainte l'avale.
3. **Un item, lui, continue à travers les lignes blanches** — c'est ce qui
   permet à une formule affichée `$$…$$` et à son intitulé d'appartenir au bon
   fragment.

---

## 5. Choisir l'intitulé — le point délicat

Le texte officiel emploie **au moins six tournures pour trois statuts**. C'est
vous qui tranchez, **une fois** ; le programme n'aura plus à deviner.

| Tournure rencontrée | Intitulé |
|---|---|
| « … est hors programme » | `**Hors programme.**` |
| « la démonstration n'est pas exigible » | `**Non exigible.**` |
| « la démonstration n'est exigible que pour … » | `**Non exigible.**` |
| « activité possible / souhaitable, non exigible » | `**Non exigible.**` |
| « aucune connaissance … n'est exigible » | `**Non exigible.**` |
| « n'est pas un objectif du programme » | `**Limite.**` |
| « n'est pas un attendu du programme » | `**Limite.**` |
| « on se limite à … », « dans les exercices pratiques… » | `**Limite.**` |
| capacité attendue, notation, précision, exemple, lien | `**Commentaire.**` |

Règle de départage : **`**Hors programme.**` est la seule mention
prohibitive** — elle interdit de traiter *et* d'évaluer. `**Limite.**` et
`**Non exigible.**` restreignent sans exclure. `**Commentaire.**` ne restreint
rien.

**Un même item peut porter plusieurs intitulés.** C'est fréquent et c'est
voulu :

```markdown
- Irréductibles de $\mathbb{C}[X]$ et $\mathbb{R}[X]$.

  **Hors programme.** La démonstration du théorème de d'Alembert-Gauss.

  **Limite.** L'étude des irréductibles de $\mathbb{K}[X]$ pour un corps autre
  que $\mathbb{R}$ ou $\mathbb{C}$ n'est pas un objectif du programme.
```

Ici le résultat **est au programme** ; seule sa démonstration en est exclue.
Fusionner les deux, ou déplacer l'exclusion ailleurs, détruirait cette nuance.

**Scindez une exclusion ciblée.** Quand une phrase mêle un contenu exigible et
la part qui en est retranchée, coupez-la en deux : l'item porte le contenu,
l'intitulé la seule exclusion. Poser `**Hors programme.**` sur l'ensemble
interdirait du contenu exigible.

Une exclusion portée par un **bandeau** vaut pour **toute la section** :

```markdown
> L'objectif de cette section est double :
>
> - approfondir …
> - introduire …
>
> **Hors programme.** La notion de produit scalaire hermitien.
```

### Cas de la physique-chimie

Les capacités exigibles se transcrivent **sans intitulé** : ce sont des puces
indentées ordinaires. `**Commentaire.**` ne leur est pas nécessaire — leur
place sous la notion dit déjà ce qu'elles sont.

Attendez-vous à ne poser que quelques intitulés par fichier, presque tous dans
des bandeaux (§2). **Ce n'est pas un signe de travail incomplet** : la légende
du fichier doit d'ailleurs le dire à l'utilisateur, faute de quoi il lirait
l'absence d'intitulé comme un oubli de transcription.

---

## 6. Fidélité

**À faire**

- Reprendre le texte **mot pour mot**. Vous étiquetez, vous ne réécrivez pas.
- L'intitulé peut absorber la locution, la phrase gardant son sujet :
  *« La démonstration du théorème de X est hors programme »* →
  `**Hors programme.** La démonstration du théorème de X.`
- **Conserver l'ordre du document** — y compris à l'intérieur d'un bandeau. Le
  parseur ne vous oblige plus à rejeter les intitulés en fin de citation
  (§4, règle 2), et déplacer une phrase peut lui faire perdre son antécédent
  (« l'établissement de **cette expression** » a besoin de la formule qui
  précède).

**À ne pas faire**

- **Ne résumez pas.** Un item raccourci perd la notion qu'il fallait retrouver.
- **N'inventez aucune section** absente du source, ni aucune contrainte (§2).
- **N'ajoutez pas de section de synthèse des contraintes** : elle est
  **calculée** par l'application. En écrire une créerait une seconde source de
  vérité, qui divergerait à la première correction.
- **N'omettez rien en silence.** Une section non transcrite se déclare dans
  `couverture`.
- **Ne corrigez pas le programme officiel**, même s'il vous paraît fautif.

---

## 7. Vérifier — obligatoire

```bash
cargo run --quiet --manifest-path src-tauri/Cargo.toml \
  --example programme_check -- corpus/<votre-fichier>.md
```

L'outil affiche l'identité lue, **la liste des contraintes extraites avec le
résultat que chacune vise**, et les anomalies. Il sort en erreur si une
anomalie est **GRAVE**.

**Relisez la liste des contraintes** : c'est le meilleur contrôle de votre
travail. Si une exclusion du PDF n'y figure pas, son intitulé est mal placé ou
mal orthographié. Vérifiez aussi la ligne `porte sur :` — elle nomme l'item
visé ; si elle désigne une capacité au lieu de la notion, votre indentation est
fautive.

L'anomalie la plus insidieuse est l'**intitulé mal écrit** —
`**Hors-programme.**` avec un tiret redevient du texte ordinaire, la contrainte
**disparaît en silence**, et le document affirme alors qu'une notion exclue est
au programme. L'outil la détecte ; rien d'autre ne le ferait.

Vérification de tout le corpus d'un coup :

```bash
bun run corpus --check
```

---

## 8. Intégration

Le corpus est **livré avec l'application**. Une fois votre fichier vérifié :

```bash
bun run corpus     # vérifie TOUT le corpus, puis synchronise vers src/programmes/
```

Jumeau de `bun run help` : `corpus/` est la source de vérité, `src/programmes/`
en est le **miroir généré**, embarqué dans l'exécutable. La synchro est
**refusée** si un seul fichier porte une anomalie grave — distribuer un
référentiel faux serait pire que ne rien distribuer.

⚠️ Ne modifiez **jamais** `src/programmes/*.md` à la main : la synchro les
écrase, et les fichiers retirés de `corpus/` y sont purgés. **Relancez
`bun run corpus` juste avant de committer** : un miroir en retard d'une seule
retouche passe tous les contrôles de contenu et met pourtant dans le binaire un
fichier différent de la source.

Les deux dossiers se commitent **ensemble**, comme `docs/user/` et
`src/help/md/` — sans quoi le dépôt porterait une source et un miroir
divergents.

```bash
git add corpus/<votre-fichier>.md src/programmes/
git commit -m "corpus: programme de <matière> <filières>"
```

Avant de committer, passez la baseline du dépôt : `bun test`,
`bunx svelte-check`, `bun run build`. Si vous avez touché `src-tauri/`,
ajoutez `cargo test`.

### Ce que git suit, et ce qu'il ignore

| Chemin | Suivi ? | Pourquoi |
|---|---|---|
| `corpus/*.md` | ✅ | c'est le travail, il se relit et se corrige dans l'historique |
| `src/programmes/*.md` | ✅ | miroir généré, mais embarqué dans le binaire — il doit être reproductible depuis un clone |
| `corpus/sources/` | ❌ | les PDF officiels sont publics et retéléchargeables, plusieurs Mo chacun |

> ⚠️ **Tout travail temporaire va dans `/tmp`**, jamais dans le dépôt : une
> exploration de PDF (`pdftohtml`, images extraites) y déverse vite des
> milliers de fichiers.

### `corpus/sources/` — archive des documents et des extraits

```
corpus/sources/<matiere>/<classe(s)>/
    <classe>-<matiere>.pdf     document officiel source
    <classe>-<matiere>.md      extrait OCR brut, s'il y a eu OCR
    <classe>-<matiere>.json    réponse brute OCR (blocs + coordonnées)
    <classe>-<matiere>-N.md    tableaux CONTENUS/CAPACITÉS extraits
```

**Le PDF source y va toujours**, rangé dans l'arborescence — matière en tête
(le premier réflexe d'un professeur), classes ensuite. Un document qui couvre
deux matières scindées se range **une seule fois**, sous la **première matière
nommée dans son titre officiel** : « Physique-Chimie MP » → `phys/mp/`, quel
que soit le fichier transcrit en premier. L'index `corpus/sources/README.md`
signale alors qu'il sert **aussi** à l'autre matière. Déposez le PDF même si sa
transcription n'est pas encore faite : l'archive dit ce qui est disponible.

Quand une retranscription est produite par OCR (`tools/mistral_ocr.py`),
l'extrait brut est conservé **à côté** : c'est le « bien » payé, relisible dans
l'application pour la relecture mot à mot. Le md principal **transclut** ses
tableaux par wikilinks `![[<classe>-<matiere>-N]]` ; les noms sont **uniques
dans toute l'archive** — exigence LSP : markdown-oxide résout les wikilinks par
nom de fichier, deux `tbl-0.md` homonymes casseraient la résolution. Le JSON
est **conservé** : il permet de vérifier une formule douteuse sans relancer
l'OCR payant.

**Tenez l'index à jour** (`corpus/sources/README.md`) : il est la seule carte
de ce qui a été payé et de ce qui reste à faire.

---

## 9. Rappel — ce que ce corpus n'est pas

Ce n'est **pas** un index de recherche sémantique. L'application ne fait aucune
recherche vectorielle sur ces fichiers, et c'est délibéré : ce qui borne un
programme, ce sont des phrases d'**exclusion**, qui ne ressemblent pas
sémantiquement aux questions posées. Une recherche par similarité les écarterait
précisément quand elles comptent.

D'où l'étiquetage explicite : il transforme une espérance — « le modèle
respectera le texte » — en **vérification opposable**.
