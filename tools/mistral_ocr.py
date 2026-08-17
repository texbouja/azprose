#!/usr/bin/env python3
"""Extraction OCR de programmes officiels CPGE via l'API Mistral OCR.

Convertit un PDF en markdown exploitable par la chaîne corpus (charte
`corpus/README.md`), en gardant les métadonnées utiles à la mise en
conformité :

- `include_blocks=True` : chaque page porte des blocs étiquetés (`type` :
  `text`, `title`, `list`, `equation`, `header`, `footer`, `table`,
  `aside_text`…) avec leurs coordonnées de boîte englobante
  (`top_left_x/top_left_y` → `bottom_right_x/bottom_right_y`). C'est ce qui
  permet de reconstituer l'appariement des deux colonnes (contenus à gauche,
  commentaires à droite) du BO — l'étape la plus délicate de la charte.
  ⚠️ Le SDK nomme le champ `type` (et non `b_type`), les coordonnées sont en
  pixels, origine coin supérieur gauche.
- `extract_header/extract_footer=True` : les bandeaux répétés de pagination
  (« © Ministère … », « N/36 ») sont isolés dans des champs séparés au lieu
  de polluer le corps.
- `table_format="markdown"` : les tableaux (rares dans ces documents) sortent
  en markdown exploitable.

Usage
-----
    python3 tools/mistral_ocr.py <fichier.pdf> [<fichier2.pdf> …] [options]

Clé API
-------
Lue dans cet ordre :
1. option `--api-key` (déconseillée, la clé resterait dans l'historique shell) ;
2. variable d'environnement `MISTRAL_API_KEY` ;
3. fichier `tools/.env` au format `MISTRAL_API_KEY=…` (recommandé — ce fichier
   est ignoré par git).

Sortie
------
Pour chaque PDF, dans `tools/ocr-out/` (ou `--out`) :
- `<nom>.md`   — markdown des pages concaténées, séparées par
  `<!-- page N -->` (l'index de page source est conservé pour la relecture) ;
- `<nom>.json` — réponse brute complète : blocs, coordonnées, images, tables,
  en-têtes/pieds de page, confiance par bloc. C'est la matière première de la
  mise en conformité.

Ce script produit un extrait BRUT : il ne fabrique pas le fichier conforme à
la charte (front matter, intitulés `**Commentaire.**`…). La conformité reste
un travail éditorial, assisté par les blocs/coordonnées du JSON.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

# Modèle OCR officiel actuel (alias stable vers le dernier modèle — v4.1).
# Identifiant précis : mistral-ocr-4-1+2.
DEFAULT_MODEL = "mistral-ocr-latest"

# Répertoire de sortie par défaut (relatif au dépôt).
DEFAULT_OUT = "tools/ocr-out"

# ── Normalisation unicode → LaTeX ────────────────────────────────────────
# Le modèle OCR restitue les symboles mathématiques en caractères unicode
# (∞, Ω, ∈, λ…). La charte du corpus interdit l'unicode pour les maths
# (« formules en LaTeX pur ») : ces caractères sont remplacés ici par leurs
# commandes LaTeX, à la fois dans les segments délimités ($…$, \(…\)) et dans
# le texte courant. L'ordre compte : le plus long d'abord (R⁺ avant R).
UNICODE_MATH = [
    # paires : (unicode, commande LaTeX)
    ("⁺", "^+"),          # R⁺ → R^+
    ("−", "-"),           # signe moins typographique
    ("–", "-"),           # tiret en-dash (usage math)
    ("×", r"\times"),
    ("÷", r"\div"),
    ("±", r"\pm"),
    ("∓", r"\mp"),
    ("≤", r"\leqslant"),
    ("≥", r"\geqslant"),
    ("≠", r"\neq"),
    ("≈", r"\approx"),
    ("≡", r"\equiv"),
    ("≃", r"\simeq"),
    ("∼", r"\sim"),
    ("∝", r"\propto"),
    ("∞", r"\infty"),
    ("∈", r"\in"),
    ("∉", r"\notin"),
    ("⊂", r"\subset"),
    ("⊆", r"\subseteq"),
    ("⊃", r"\supset"),
    ("⊇", r"\supseteq"),
    ("∪", r"\cup"),
    ("∩", r"\cap"),
    ("∅", r"\varnothing"),
    ("√", r"\sqrt"),
    ("∫", r"\int"),
    ("∑", r"\sum"),
    ("∏", r"\prod"),
    ("⇒", r"\Rightarrow"),
    ("⇔", r"\Leftrightarrow"),
    ("→", r"\rightarrow"),
    ("↦", r"\mapsto"),
    ("⊥", r"\perp"),
    ("∥", r"\parallel"),
    ("∂", r"\partial"),
    ("∇", r"\nabla"),
    ("∀", r"\forall"),
    ("∃", r"\exists"),
    # lettres grecques (hors segments : en texte courant elles restent des
    # symboles mathématiques et doivent être en LaTeX)
    ("α", r"\alpha"), ("β", r"\beta"), ("γ", r"\gamma"), ("δ", r"\delta"),
    ("ε", r"\varepsilon"), ("ζ", r"\zeta"), ("η", r"\eta"), ("θ", r"\theta"),
    ("ι", r"\iota"), ("κ", r"\kappa"), ("λ", r"\lambda"), ("μ", r"\mu"),
    ("ν", r"\nu"), ("ξ", r"\xi"), ("π", r"\pi"), ("ρ", r"\rho"),
    ("σ", r"\sigma"), ("τ", r"\tau"), ("υ", r"\upsilon"), ("φ", r"\varphi"),
    ("χ", r"\chi"), ("ψ", r"\psi"), ("ω", r"\omega"),
    ("Γ", r"\Gamma"), ("Δ", r"\Delta"), ("Θ", r"\Theta"), ("Λ", r"\Lambda"),
    ("Ξ", r"\Xi"), ("Π", r"\Pi"), ("Σ", r"\Sigma"), ("Φ", r"\Phi"),
    ("Ψ", r"\Psi"), ("Ω", r"\Omega"),
    # lettres doubles (ensembles de nombres) : à conserver telles quelles si
    # déjà en gras LaTeX ; sinon remplacer par la forme \mathbb
    ("ℝ", r"\mathbb{R}"), ("ℕ", r"\mathbb{N}"), ("ℤ", r"\mathbb{Z}"),
    ("ℚ", r"\mathbb{Q}"), ("ℂ", r"\mathbb{C}"),
]


def normaliser_unicode_math(texte: str) -> str:
    """Remplace les symboles mathématiques unicode par leurs commandes LaTeX.

    Le modèle OCR produit des symboles unicode (∞, Ω, ∈, λ…) que la charte
    du corpus interdit pour les maths. Cette passe s'applique au markdown
    concaténé ET au contenu des tables, pour que l'archive reste en LaTeX pur
    — la même règle que pour les transcriptions conformes.

    L'espace de séparation est intégré À LA CONVERSION (λX → « \\lambda X »),
    jamais appliqué après coup aux commandes du modèle : séparer globalement
    scinderait \int en \in t (commande ambiguë) sans rien corriger.
    """
    for uni, latex in UNICODE_MATH:
        if re.match(r"^\\[a-zA-Z]+$", latex):
            # commande simple : sépare de la lettre qui suivait l'unicode,
            # sinon commande ambiguë (\lambdaX, \inE…). Le backslash de la
            # commande doit être échappé pour la substitution.
            texte = re.sub(re.escape(uni) + r"(?=[A-Za-z])",
                           lambda _m: latex + " ", texte)
            texte = texte.replace(uni, latex)
        else:
            texte = texte.replace(uni, latex)
    return texte


# ── Délimitation des îlots mathématiques en texte courant ─────────────────
# Un \lambda (ou tout autre commande LaTeX) en texte courant n'est jamais
# composé par MathJax : seul un bloc $…$, \(…\), $$…$$ ou \[…\] l'est. Le
# modèle OCR délimite déjà la plupart des formules, mais laisse parfois des
# symboles isolés (∞, Ω, λ…) dans le texte des phrases. Cette passe détecte
# ces îlots et les enveloppe dans $…$.

# Caractères qui peuvent appartenir à un îlot mathématique en texte courant.
_MATH_TOKENS = set("+-*/=<>≤≥≠±×÷^_()[]{}.,\\" + "0123456789")


def delimiter_math(texte: str) -> str:
    """Enveloppe dans $…$ les îlots mathématiques restés en texte courant.

    Les segments déjà délimités ($$…$$, [..], (..), $..$) sont protégés et
    rendus intacts ; seul le texte des phrases est analysé. Un îlot est une
    séquence contiguë de tokens mathématiques (au moins une commande LaTeX)
    bornée par du texte non-math ou la ponctuation de phrase. La passe est
    NON destructive : le texte entre les îlots est conservé à l'identique.
    """
    # 1. Protéger les segments déjà délimités (placeholders).
    protégés: list[str] = []

    def _garder(m: re.Match) -> str:
        protégés.append(m.group(0))
        return f"\x00P{len(protégés)-1}\x00"

    texte = re.sub(r"\$\$.*?\$\$|\\\[.*?\\\]|\\\(.*?\\\)|\$(?!\$).*?\$",
                   _garder, texte, flags=re.S)

    def _math(c: str) -> bool:
        """Caractère susceptible d'appartenir à un îlot mathématique."""
        return c.isalnum() or c in "+-*/=<>,;:^_{}()[]\\"

    def _remplacer(m: re.Match) -> str:
        seg = m.group(0)
        out: list[str] = []
        i, n = 0, len(seg)
        while i < n:
            if seg[i] == "\\":
                # début d'îlot : une commande LaTeX (ou un run la contenant)
                j = i
                while j < n and _math(seg[j]):
                    j += 1
                # extension : ne pas avaler un mot français (≥2 lettres
                # minuscules sans chiffre/opérateur) ni la ponctuation forte
                while j < n and (seg[j].isalpha() or seg[j] in "+-*/=<>,:;^_{}()[]"):
                    k = j
                    while k < n and seg[k].isalpha():
                        k += 1
                    if k - j >= 2 and seg[j:j+k].isalpha() and seg[j:j+k].islower() \
                       and k < n and not seg[k].isdigit() and seg[k] not in "+-*/=<>,:;^_{}()[]":
                        break  # mot français, on s'arrête
                    j = k
                # retirer ponctuation de fin de liste
                while j > i and seg[j-1] in ".,;:":
                    j -= 1
                morceau = seg[i:j]
                out.append("$" + morceau + "$")
                i = j
            else:
                out.append(seg[i])
                i += 1
        return "".join(out)

    texte = re.sub(r"[^\x00]+", _remplacer, texte)

    # 3. Restaurer les segments protégés.
    for idx, seg in enumerate(protégés):
        texte = texte.replace(f"\x00P{idx}\x00", seg)
    return texte


def lire_cle(args_cle: str | None) -> str:
    """Résout la clé API selon l'ordre : option, environnement, tools/.env."""
    if args_cle:
        return args_cle
    env = os.environ.get("MISTRAL_API_KEY")
    if env:
        return env
    # Fichier tools/.env au format « MISTRAL_API_KEY=… » (lignes « # » ignorées).
    env_file = Path(__file__).resolve().parent / ".env"
    if env_file.is_file():
        for ligne in env_file.read_text(encoding="utf-8").splitlines():
            ligne = ligne.strip()
            if not ligne or ligne.startswith("#") or "=" not in ligne:
                continue
            clef, _, valeur = ligne.partition("=")
            if clef.strip() == "MISTRAL_API_KEY" and valeur.strip():
                return valeur.strip()
    raise SystemExit(
        "Clé API introuvable. Ajoutez MISTRAL_API_KEY dans tools/.env "
        "(modèle : MISTRAL_API_KEY=…), ou exportez-la dans l'environnement."
    )


def ocr_un_pdf(client, pdf: Path, model: str) -> dict:
    """Transmet un PDF à Mistral OCR et rend la réponse brute (dict).

    Le PDF est d'abord uploadé (purpose="ocr"), puis référencé par une URL
    signée : c'est la voie documentée pour les fichiers locaux, elle évite de
    dépendre d'un hébergement public.
    """
    print(f"[ocr] upload {pdf.name}…", flush=True)
    upload = client.files.upload(
        file={
            "file_name": pdf.name,
            "content": pdf.read_bytes(),
            "content_type": "application/pdf",
        },
        purpose="ocr",
    )
    url = client.files.get_signed_url(file_id=upload.id).url

    print(f"[ocr] extraction ({model})…", flush=True)
    reponse = client.ocr.process(
        model=model,
        document={"type": "document_url", "document_url": url},
        table_format="markdown",
        extract_header=True,
        extract_footer=True,
        include_blocks=True,
        confidence_scores_granularity="block",
    )
    return reponse.model_dump(mode="json")


def concatener_pages(donnees: dict) -> str:
    """Concatène le markdown des pages en conservant l'index source.

    Le séparateur `<!-- page N -->` garde la pagination du PDF : indispensable
    pour vérifier la fidélité page par page pendant la transcription. Le
    markdown passe par `normaliser_unicode_math` puis `delimiter_math` — le
    modèle OCR restitue les symboles en unicode (à convertir en LaTeX) et
    laisse parfois des commandes isolées en texte courant (à délimiter, sinon
    MathJax ne les compose jamais).
    """
    morceaux: list[str] = []
    for page in donnees.get("pages", []):
        index = page.get("index", 0) + 1
        md = (page.get("markdown") or "").strip()
        md = normaliser_unicode_math(md)
        md = delimiter_math(md)
        morceaux.append(f"<!-- page {index} -->\n\n{md}\n")
    return "\n".join(morceaux)


def traiter(pdf: Path, args) -> None:
    """OCR un PDF et écrit le markdown + le JSON brut."""
    if not pdf.is_file():
        raise SystemExit(f"fichier introuvable : {pdf}")

    from mistralai.client import Mistral

    client = Mistral(api_key=args.api_key)
    try:
        donnees = ocr_un_pdf(client, pdf, args.model)
    except Exception as e:  # noqa: BLE001 — remonter un message utile au CLI
        raise SystemExit(f"[ocr] échec pour {pdf.name} : {e}") from e

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"{pdf.stem}.md").write_text(concatener_pages(donnees), encoding="utf-8")

    # Le JSON (matière brute) est normalisé pour ses tables : leur contenu
    # markdown alimente l'archive (fichiers tbl-*), il doit être en LaTeX pur
    # et délimité (mêmes passes que le markdown des pages).
    for page in donnees.get("pages", []):
        for table in page.get("tables", []):
            content = table.get("content") or ""
            content = normaliser_unicode_math(content)
            content = delimiter_math(content)
            table["content"] = content

    (out_dir / f"{pdf.stem}.json").write_text(
        json.dumps(donnees, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    pages = len(donnees.get("pages", []))
    usage = donnees.get("usage_info", {}) or {}
    processees = usage.get("pages_processed", pages)
    cout = processees * 4 / 1000  # tarif OCR : 4 $ / 1000 pages
    print(
        f"[ocr] OK — {pages} pages, ~{cout:.3f} $ → "
        f"{out_dir / (pdf.stem + '.md')}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="OCR Mistral d'un PDF de programme officiel CPGE → markdown + JSON.",
    )
    parser.add_argument("pdfs", nargs="+", metavar="pdf", help="PDF à transcrire")
    parser.add_argument("--model", default=DEFAULT_MODEL,
                        help=f"modèle OCR (défaut : {DEFAULT_MODEL})")
    parser.add_argument("--out", default=DEFAULT_OUT,
                        help=f"dossier de sortie (défaut : {DEFAULT_OUT})")
    parser.add_argument("--api-key", default=None, metavar="KEY",
                        help="clé API (préférer tools/.env ou l'environnement)")
    args = parser.parse_args()

    # Résolution anticipée : échoue proprement avant tout appel réseau.
    args.api_key = lire_cle(args.api_key)

    for p in args.pdfs:
        traiter(Path(p), args)


if __name__ == "__main__":
    main()
