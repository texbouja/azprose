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
tête par son **raccourci** (`math`, `phy`, `chi`, `si`, `inf`…), la même
convention que l'archive `corpus/sources/` ; le champ `matiere:` du front
matter porte le nom complet.

```
math-mpsi-mp2i.md                   un même programme pour MPSI et MP2I
math-mp-mpi.md                      MP et MPI
math-tsi1.md                        TSI première année
si-commun.md                        sciences industrielles, six filières, les deux années
phy-chim-mp.md                      physique-chimie, classe de MP
```

> ⚠️ **Ne dupliquez JAMAIS un fichier pour couvrir plusieurs filières.** Le
> champ `filiere:` est une **liste** : un seul document les déclare toutes. Le
> programme de sciences industrielles vaut pour MPSI, MP, PCSI, PSI, PTSI et PT
> — le dupliquer donnerait douze copies à corriger en parallèle, et la première
> divergence passerait inaperçue.

La matière en tête range le corpus par discipline, ce qui est la façon dont il
se parcourt quand il grossit.

**Matières combinées** : certains programmes officiels réunissent deux
disciplines dans un seul document — « Physique-Chimie » en MP, par exemple.
Suivez le document : un fichier, `matiere: physique-chimie`. Ne le scindez pas.

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
corpus/math-mp-mpi.md             gabarit des programmes de mathématiques
corpus/physique-chimie-mp.md      gabarit des programmes de physique-chimie
```

Lisez le gabarit de votre matière en entier. Chacun porte sa propre légende
(« Comment lire ce document ») et couvre tous les cas de figure : intitulés,
bandeaux, formules affichées, transcription partielle. Ce README explique la
*démarche* ; le gabarit fait foi sur la *forme*.

> ⚠️ **Physique-chimie** : la structure diffère des mathématiques. La colonne
> de droite y contient des **capacités exigibles** (pas des commentaires) ;
> elles se transcrivent en **sous-puces indentées** sous la notion qu'elles
> accompagnent, et les items identifiés **en gras** dans le document source
> sont des **thèmes d'étude à aborder en priorité en travaux pratiques** — ils
> se transcrivent en caractères gras **…**. Les parties « Formation
> expérimentale » et les annexes se transcrivent comme le reste du programme.

---

## 2. Comprendre le document source

Les programmes de mathématiques et de physique alternent deux dispositions :

| Disposition | Contenu | Valeur limitative |
|---|---|---|
| **Une colonne** (bandeau, en italique) | objectifs de la section, cadre d'étude, portée | généralement aucune — **mais parfois une exclusion** |
| **Deux colonnes** | à gauche le programme lui-même ; à droite un commentaire synchronisé, paragraphe par paragraphe | **forte** : c'est là que vivent « hors programme », « non exigible »… |

En physique-chimie, la colonne de droite contient des **capacités exigibles**
— le socle évaluable — et les exclusions y sont plus rares : elles vivent
presque toutes dans les **bandeaux** en tête de section. Les items en **gras**
de la colonne de droite désignent les **thèmes d'étude des travaux pratiques**.

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

---

## 3. Front matter

```yaml
---
id: physique-chimie-mp            # = nom du fichier sans .md
filiere: [MP]                     # LISTE — toutes les classes concernées
matiere: physique-chimie          # minuscules, sans accent (nom complet, pas le raccourci)
niveau: 2                         # 1 = première année, 2 = seconde
source: "Annexe 2 — Programme de physique-chimie, MESRI 2021"
---
```

> ℹ️ Les identifiants des programmes de mathématiques (`mathematiques-mpsi-mp2i`,
> `mathematiques-mp-mpi`) sont **historiques** : ils datent d'avant le passage
> aux noms courts de fichiers et sont conservés tels quels — c'est l'identifiant
> que l'application expose. Ne les alignez pas sur le nom du fichier ; un
> **nouveau** programme reçoit `id:` = nom du fichier sans `.md`.

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
| **Colonne de gauche** — un paragraphe | une puce `- …` |
| **Colonne de droite** — un paragraphe | un intitulé **indenté sous la puce qu'il vise** |
| *Physique-chimie* — capacité exigible de la colonne de droite | une **sous-puce indentée** `  - …` sous la notion qu'elle accompagne |
| *Physique-chimie* — thème d'étude des travaux pratiques (en gras dans la source) | la capacité en caractères gras `  - **…**` |

L'appariement est **structurel** : le commentaire — ou la capacité exigible —
de droite s'indente sous la puce de gauche à laquelle il fait face. C'est ce
qui permet de dire plus tard *quel résultat officiel* une contrainte vise.

Les formules restent en LaTeX : `$…$` en ligne, `$$…$$` en bloc.

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

Une exclusion portée par un **bandeau** vaut pour **toute la section** :

```markdown
> L'objectif de cette section est double :
>
> - approfondir …
> - introduire …
>
> **Hors programme.** La notion de produit scalaire hermitien.
```

---

## 6. Fidélité

**À faire**

- Reprendre le texte **mot pour mot**. Vous étiquetez, vous ne réécrivez pas.
- L'intitulé peut absorber la locution, la phrase gardant son sujet :
  *« La démonstration du théorème de X est hors programme »* →
  `**Hors programme.** La démonstration du théorème de X.`
- Conserver l'ordre du document.

**À ne pas faire**

- **Ne résumez pas.** Un item raccourci perd la notion qu'il fallait retrouver.
- **N'inventez aucune section** absente du source.
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
mal orthographié.

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
écrase, et les fichiers retirés de `corpus/` y sont purgés.

Les deux dossiers se commitent **ensemble**, comme `docs/user/` et
`src/help/md/` — sans quoi le dépôt porterait une source et un miroir
divergents.

```bash
git add corpus/<votre-fichier>.md src/programmes/
git commit -m "corpus: programme de <matière> <filières>"
```

Avant de committer, passez la baseline du dépôt : `bun test`,
`bunx svelte-check`, `bun run build`.

### Ce que git suit, et ce qu'il ignore

| Chemin | Suivi ? | Pourquoi |
|---|---|---|
| `corpus/*.md` | ✅ | c'est le travail, il se relit et se corrige dans l'historique |
| `src/programmes/*.md` | ✅ | miroir généré, mais embarqué dans le binaire — il doit être reproductible depuis un clone |
| `corpus/sources/` | ❌ | les PDF officiels sont publics et retéléchargeables, plusieurs Mo chacun |

Déposez les PDF sources dans `corpus/sources/` pendant votre travail : ils
restent locaux, et la transcription garde leur référence dans `source:`.

### `corpus/sources/` — structure d'archive des retranscriptions

Quand une retranscription est produite par OCR (`tools/mistral_ocr.py`), son
extrait brut est **également** conservé dans `corpus/sources/` — c'est le
« bien » payé (API Mistral), qui reste lisible dans l'application pour la
relecture mot à mot. Arborescence et conventions (cf. l'index local
`corpus/sources/README.md`) :

```
corpus/sources/<matiere>/<classe(s)>/
    <classe>-<matiere>.md      retranscription principale (extrait OCR brut)
    <classe>-<matiere>.pdf     document officiel source
    <classe>-<matiere>.json    réponse brute OCR (blocs + coordonnées)
    <classe>-<matiere>-N.md    tableaux CONTENUS/CAPACITÉS
```

La matière est en tête (le premier réflexe d'un professeur), les classes
ensuite. Le md principal **transclut** ses tableaux par wikilinks
`![[<classe>-<matiere>-N]]` ; les noms des fichiers de tableaux sont
**uniques dans toute l'archive** (base du md principal + suffixe) — exigence
LSP : markdown-oxide résout les wikilinks par nom de fichier, deux `tbl-0.md`
homonymes casseraient la résolution ; matière = **raccourci** (`math`, `phy`,
`chi`, `fr`, `en`, `si`, `inf`…) ; le JSON est **conservé** : il permet de
vérifier une formule douteuse sans relancer l'OCR payant.

---

## 9. Rappel — ce que ce corpus n'est pas

Ce n'est **pas** un index de recherche sémantique. L'application ne fait aucune
recherche vectorielle sur ces fichiers, et c'est délibéré : ce qui borne un
programme, ce sont des phrases d'**exclusion**, qui ne ressemblent pas
sémantiquement aux questions posées. Une recherche par similarité les écarterait
précisément quand elles comptent.

D'où l'étiquetage explicite : il transforme une espérance — « le modèle
respectera le texte » — en **vérification opposable**.
