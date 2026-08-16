#!/usr/bin/env python3
"""Extraction OCR de programmes officiels CPGE via l'API Mistral OCR.

Convertit un PDF en markdown exploitable par la chaîne corpus (charte
`corpus/README.md`), en gardant les métadonnées utiles à la mise en
conformité :

- `include_blocks=True` : chaque page porte des blocs étiquetés
  (`text`, `title`, `list`, `aside_text`, `table`, `equation`, `header`,
  `footer`…) avec leurs coordonnées de boîte englobante. C'est ce qui permet
  de reconstituer l'appariement des deux colonnes (contenus à gauche,
  commentaires à droite) du BO — l'étape la plus délicate de la charte.
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
import sys
from pathlib import Path

# Modèle OCR officiel actuel (alias stable vers le dernier modèle — v4.1).
# Identifiant précis : mistral-ocr-4-1+2.
DEFAULT_MODEL = "mistral-ocr-latest"

# Répertoire de sortie par défaut (relatif au dépôt).
DEFAULT_OUT = "tools/ocr-out"


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
    pour vérifier la fidélité page par page pendant la transcription.
    """
    morceaux: list[str] = []
    for page in donnees.get("pages", []):
        index = page.get("index", 0) + 1
        md = (page.get("markdown") or "").strip()
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
    base = out_dir / pdf.stem
    (out_dir / f"{pdf.stem}.md").write_text(concatener_pages(donnees), encoding="utf-8")
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
