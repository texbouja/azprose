#!/usr/bin/env perl
# Normalise les pipes DANS les segments LaTeX des fichiers de l'archive OCR.
# Les pipes hors segments (séparateurs de colonnes markdown) restent intacts.
# Usage : perl fix-pipes.pl <fichier.md>…  (en place)
# Sémantique (à l'intérieur de \(…\), $…$, \[…\], $$…$$) :
#   |x|  valeur absolue            → \abs{x}      (macro du préambule)
#   \|x\|  norme                   → \nm{x}       (macro du préambule)
#   d|n  divisibilité              → d \mid n
#   P(A|B)  conditionnelle         → P(A \mid B)
#   (x|y)  produit scalaire        → (x \mid y)
#   f|_{A}  restriction            → f_{\mid A}
#   \int_{|a,b|}  erreur OCR       → \int_{[a,b]} (crochets, pas valeur abs)
#   (P(|ω|))  erreur OCR           → (P(\{\omega\}))
#   |0,\alpha| / |-R,R|  interv.   → ]0,\alpha] / ]-R,R[  (erreurs OCR)

use strict;
use warnings;
use utf8;
binmode(STDIN,  ':utf8');
binmode(STDOUT, ':utf8');

# Nettoie un segment LaTeX (sans les délimiteurs) : applique le mapping.
sub fix_math {
    my ($s) = @_;

    # ── corrections d'OCR (contextes précis, AVANT toute valeur absolue) ──
    $s =~ s/\\int_\{\|a,b\|\}/\\int_{[a,b]}/g;             # crochets
    $s =~ s/P\(\|\\omega\|\)/P(\\{\\omega\\})/g;           # {ω}
    $s =~ s/\|0,\s*\\alpha\|/]0, \\alpha]/g;               # intervalle ]0,α]
    $s =~ s/\|-R,\s*R\|/]-R, R[/g;                         # intervalle ]-R,R[
    $s =~ s/\|-1,\s*1\|/]-1, 1[/g;                         # intervalle ]-1,1[

    # ── normes : \|x\| et \left\|x\right\| → \nm{x} ──
    $s =~ s/\\left\\\|(.*?)\\right\\\|/\\nm{$1}/gs;
    $s =~ s/\\\|([^\\|]+?)\\\|/\\nm{$1}/g;

    # ── valeurs absolues \left|x\right| et |x| → \abs{x} ──
    #    (le contenu peut contenir des backslashes LaTeX : |f(x,\cdot)|)
    $s =~ s/\\left\|(.*?)\\right\|/\\abs{$1}/gs;
    $s =~ s/\|([^|]{1,160})\|/\\abs{$1}/g;

    # ── restriction f|_{A} → f_{\mid A} (avant les pipes isolés) ──
    #    Lookbehind : ne pas toucher aux \| échappés (normes \|x\|_{\infty})
    $s =~ s/(?<!\\)\|_\{/\\mid_{/g;

    # ── pipes isolés : divisibilité / conditionnelle / produit scalaire ──
    $s =~ s/(\w)\|(\w)/$1 \\mid $2/g;

    return $s;
}

for my $f (@ARGV) {
    open my $fh, '<:utf8', $f or die "impossible d'ouvrir $f: $!";
    local $/;
    my $txt = <$fh>;
    close $fh;
    my $orig = $txt;

    # Applique fix_math à chaque segment LaTeX délimité.
    # Ordre : les délimiteurs les plus longs d'abord ($$…$$, \[…\], \(…\), $…$)

    # ── motif hybride AVANT le découpage : normes infinies mal rendues par
    #    l'OCR : « Notation ||\( \|_{\infty} \). » — les || littéraux sont
    #    HORS du segment \(…\), ils cassent la table ; la chaîne entière
    #    devient \(\nm{\cdot}_{\infty}\).
    my $avant = $txt;
    $txt =~ s/\|\|\\\( \\\|_\{((?:\\\w+|\w+))\} \\\)/\\(\\nm{\\cdot}_{$1}\\)/g;
    my $nb = ($txt ne $avant) ? 1 : 0;
    $txt =~ s{(\$\$.*?\$\$|\\\[.*?\\\]|\\\(.*?\\\)|\$(?!\$).*?\$)}{  # guard $$
        my $seg = $1;
        my $fix = fix_math($seg);
        $nb++ if $fix ne $seg;
        $fix;
    }gse;

    # ── pipes nus HORS segments LaTeX dans les lignes de table ──
    #    Une ligne valide a exactement 3 pipes (2 cellules) ; tout pipe
    #    supplémentaire est une formule en texte brut qui casse la table.
    #    Les séparateurs sont le 1er et le dernier pipe ; on neutralise les
    #    autres en isolant le contenu entre eux.
    my @lignes = split /\n/, $txt, -1;
    for my $l (@lignes) {
        next unless $l =~ /^\|/ && $l !~ /^\| ---/;
        my $nb_pipes = ($l =~ tr/\|//);
        next unless $nb_pipes > 3;
        # isole le contenu entre le 1er et le dernier pipe
        if ($l =~ /^(\|)(.*)(\|)$/s) {
            my ($pre, $mid, $post) = ($1, $2, $3);
            my $orig_mid = $mid;
            # formules de probabilités en texte brut (OCR) : (P(|ω|))ω∈Ω → (P({ω}))_ω∈Ω
            $mid =~ s/\(P\(\|ω\|\)\)ω∈Ω/\(P(\\{\\omega\\}))_{\\omega \\in \\Omega}/g;
            $mid =~ s/\(P\(\|\\omega\|\)\)/\(P(\\{\\omega\\})\)/g;   # variante LaTeX
            $mid =~ s/P\(([A-Za-z0-9]+)\|([A-Za-z0-9]+)\)/P($1 \\mid $2)/g;  # P(A|B)
            $mid =~ s/(\w)\|(\w)/$1 \\mid $2/g;   # d|n et autres
            if ($mid ne $orig_mid) {
                $l = $pre . $mid . $post;
                $nb++;
            }
        }
    }
    $txt = join "\n", @lignes;

    if ($nb) {
        open my $out, '>:utf8', $f or die "impossible d'écrire $f: $!";
        print $out $txt;
        close $out;
        print "✓ $f ($nb segment(s) modifié(s))\n";
    } else {
        print "— $f (aucun changement)\n";
    }
}
