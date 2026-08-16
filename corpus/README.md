# Corpus des programmes officiels — guide de préparation

> **Document autoportant.** Il contient tout ce qu'il faut pour transcrire un
> programme officiel de CPGE en fichier indexé conforme. Suivre les étapes dans
> l'ordre.

## 0. Ce qu'on attend de vous

À partir d'un **PDF de programme officiel**, produire **un fichier markdown
indexé** dans ce dossier (`corpus/`), conforme au gabarit, et qui **passe le
vérificateur** sans anomalie grave.

Un fichier par couple **(filière(s) × matière × niveau)**. Nommage :
`<filiere(s)>-<matiere>.md`, en minuscules, sans accent —
`mp-mpi-mathematiques.md`, `mpsi-physique.md`, `pcsi-chimie.md`.

> ⚠️ **Ce corpus n'est pas embarqué dans l'application.** Il est publié à part
> (§7). Une transcription fausse ne planterait rien : elle fausserait
> silencieusement le travail pédagogique de l'utilisateur. C'est la raison
> d'être de toutes les règles qui suivent.

---

## 1. Lire le gabarit AVANT tout

**Le format normatif est un FICHIER, pas une description :**

```
src/programmes/mp-mpi-mathematiques.md
```

Lisez-le en entier. Il porte sa propre légende (« Comment lire ce document ») et
couvre **tous** les cas de figure : intitulés, bandeaux, formules affichées,
transcription partielle. Ce README explique la *démarche* ; le gabarit fait foi
sur la *forme*.

---

## 2. Comprendre le document source

Les programmes de mathématiques et de physique alternent deux dispositions :

| Disposition | Contenu | Valeur limitative |
|---|---|---|
| **Une colonne** (bandeau, en italique) | objectifs de la section, cadre d'étude, portée | généralement aucune — **mais parfois une exclusion** |
| **Deux colonnes** | à gauche le programme lui-même ; à droite un commentaire synchronisé, paragraphe par paragraphe | **forte** : c'est là que vivent « hors programme », « non exigible »… |

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
id: mp-mpi-mathematiques          # = nom du fichier sans .md
filiere: [MP, MPI]                # LISTE, même à un seul élément
matiere: mathematiques            # minuscules, sans accent
niveau: 2                         # 1 = première année, 2 = seconde
source: "Annexe 1 — Programme de mathématiques, MESRI 2021"
---
```

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

---

## 4. Transposer

| Source | Devient |
|---|---|
| Titre de section (« Structures algébriques usuelles ») | `## Titre` |
| Sous-section (« a) Compléments sur les groupes ») | `### a) Compléments sur les groupes` |
| Bandeau en italique | citation `>` en tête de section |
| Chapeau de paragraphe (« Dans ce paragraphe, 𝕂 est… ») | citation `>` en tête de sous-section |
| **Colonne de gauche** — un paragraphe | une puce `- …` |
| **Colonne de droite** — un paragraphe | un intitulé **indenté sous la puce qu'il vise** |

L'appariement est **structurel** : le commentaire de droite s'indente sous la
puce de gauche à laquelle il fait face. C'est ce qui permet de dire plus tard
*quel résultat officiel* une contrainte vise.

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

## 8. Publication

Le corpus **n'est pas embarqué dans l'application** : il est distribué à part,
en pièce jointe de release GitHub.

```bash
bun run corpus     # vérifie, archive, produit le manifeste avec empreintes
```

Produit `corpus-dist/` (ignoré par git) :

- `programmes-<version>.tar.gz`
- `manifeste.json` — version, liste, **empreintes SHA-256**

Puis :

```bash
gh release create corpus-v<version> corpus-dist/* --title "Programmes <version>"
```

### Ce que git suit, et ce qu'il ignore

| Chemin | Suivi ? | Pourquoi |
|---|---|---|
| `corpus/*.md` | ✅ | c'est le travail, il se relit et se corrige dans l'historique |
| `corpus/sources/` | ❌ | les PDF officiels sont publics et retéléchargeables, plusieurs Mo chacun |
| `corpus-dist/` | ❌ | artefact reconstructible, publié en release |

Déposez les PDF sources dans `corpus/sources/` pendant votre travail : ils
restent locaux, et la transcription garde leur référence dans `source:`.

---

## 9. Rappel — ce que ce corpus n'est pas

Ce n'est **pas** un index de recherche sémantique. L'application ne fait aucune
recherche vectorielle sur ces fichiers, et c'est délibéré : ce qui borne un
programme, ce sont des phrases d'**exclusion**, qui ne ressemblent pas
sémantiquement aux questions posées. Une recherche par similarité les écarterait
précisément quand elles comptent.

D'où l'étiquetage explicite : il transforme une espérance — « le modèle
respectera le texte » — en **vérification opposable**.
