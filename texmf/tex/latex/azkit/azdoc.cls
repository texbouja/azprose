%% azdoc.cls — la classe des documents de cours
%%
%% Un cours, un recueil d'exercices, un polycopié : tout ce qui s'écrit en
%% chapitres, énonce des résultats et propose des exercices.
%%
%% La classe elle-même est mince. Elle assemble les modules du kit, déclare le
%% vocabulaire du cours et donne aux titres de section leur forme. Tout le reste
%% — couleurs, mise en page, listes, blocs sémantiques, solutions — vit dans des
%% .sty que les autres classes du kit partagent.
%%
%% Sadik Boujaida — licence LPPL 1.3c

\NeedsTeXFormat{LaTeX2e}[2022/06/01]
\ProvidesExplClass {azdoc} {2026-08-20} {0.1}
  {azkit — documents de cours}

\RequirePackage { l3keys2e }

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%% Options
%%
%% Les drapeaux sont déclarés AVANT tout chargement : les modules du kit les
%% consultent dès leur lecture, et un \newif tardif les remettrait à faux.
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\newif \ifdraft      \newif \iffinal      \newif \ifprint
\newif \ifdark       \newif \ifnocolors   \newif \ifcompact
\newif \ifserie      \newif \ifbackground \newif \ifrelecture
\newif \ifstriptitle \newif \iftitlepage  \newif \iflandscape
\newif \ifsingleimage
\newif \ifsolution   \newif \ifsolutiondelayed
\newif \ifproof      \newif \ifproofdelayed

\tl_new:N \g_az_doc_class_tl
\tl_new:N \g_az_doc_options_tl
\tl_gset:Nn \g_az_doc_class_tl { report }
\tl_gset:Nn \g_az_doc_options_tl { 11pt }

\bool_new:N \g_az_doc_solution_bool
\bool_new:N \g_az_doc_solution_delayed_bool
\bool_new:N \g_az_doc_proof_bool
\bool_new:N \g_az_doc_proof_delayed_bool

\keys_define:nn { az / doc }
  {
    article .code:n = { \tl_gset:Nn \g_az_doc_class_tl { article } } ,
    report  .code:n = { \tl_gset:Nn \g_az_doc_class_tl { report } } ,
    %% Un livre s'imprime recto verso, mais le kit compose pour l'écran autant
    %% que pour le papier : oneside par défaut, l'auteur remettra twoside.
    book    .code:n =
      { \tl_gset:Nn \g_az_doc_class_tl { book }
        \tl_gput_left:Nn \g_az_doc_options_tl { oneside , } } ,
    draft       .bool_gset:N = \g_az_doc_draft_bool ,
    final       .code:n = { \global \finaltrue } ,
    background  .code:n = { \global \backgroundtrue } ,
    serie       .code:n = { \global \serietrue } ,
    compact     .code:n = { \global \compacttrue } ,
    nocolor     .code:n = { \global \nocolorstrue } ,
    relecture   .code:n = { \global \relecturetrue } ,
    singleimage .code:n = { \global \singleimagetrue } ,
    solution    .code:n =
      { \str_if_eq:nnTF {#1} { false }
          { \bool_gset_false:N \g_az_doc_solution_bool }
          { \bool_gset_true:N \g_az_doc_solution_bool }
        \bool_gset_false:N \g_az_doc_solution_delayed_bool } ,
    solution    .default:n = { true } ,
    solution*   .code:n =
      { \bool_gset_true:N \g_az_doc_solution_bool
        \bool_gset_true:N \g_az_doc_solution_delayed_bool } ,
    proof       .code:n =
      { \str_if_eq:nnTF {#1} { false }
          { \bool_gset_false:N \g_az_doc_proof_bool }
          { \bool_gset_true:N \g_az_doc_proof_bool }
        \bool_gset_false:N \g_az_doc_proof_delayed_bool } ,
    proof       .default:n = { true } ,
    proof*      .code:n =
      { \bool_gset_true:N \g_az_doc_proof_bool
        \bool_gset_true:N \g_az_doc_proof_delayed_bool } ,
    %% Ce que la classe ne connaît pas revient à la classe de base : `12pt`,
    %% `twoside`, `landscape` continuent de fonctionner tels quels.
    unknown     .code:n =
      {
        \tl_if_novalue:nTF {#1}
          { \tl_gput_right:Nx \g_az_doc_options_tl { , \l_keys_key_str } }
          { \tl_gput_right:Nx \g_az_doc_options_tl
              { , \l_keys_key_str = { \exp_not:n {#1} } } }
      } ,
  }

%% Un fragment a déjà traité les options en son nom : les retraiter ici les
%% appliquerait deux fois.
\cs_if_exist:NF \ifsubdoc { \ProcessKeysOptions { az / doc } }

\bool_if:NT \g_az_doc_draft_bool
  { \global \drafttrue \tl_gput_right:Nn \g_az_doc_options_tl { , draft } }

\use:x
  {
    \exp_not:N \LoadClass [ \g_az_doc_options_tl ] { \g_az_doc_class_tl }
  }

\ifdraft
  \PassOptionsToPackage { draft } { pgf }
  \PassOptionsToPackage { draft } { hyperref }
\fi

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%% Les modules
%%
%% L'ordre compte : le socle, puis les couleurs (dont dépendent les blocs), la
%% mise en page, les métadonnées, les listes, et seulement ensuite ce qui s'en
%% sert.
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\RequirePackage { azbase }
\RequirePackage { azcolor }
\RequirePackage { azlayout }
\RequirePackage { azmeta }
\RequirePackage { azlist }

%% hyperref avant aztitle et azthm : les deux posent des ancres.
\RequirePackage [ pdfencoding = auto, psdextra ] { hyperref }
\hypersetup
  {
    colorlinks, linkcolor = linktextcol, urlcolor = linktextcol,
    citecolor = linktextcol, breaklinks, raiselinks,
  }
\pdfstringdefDisableCommands { \cs_set:Npn \( { } \cs_set:Npn \) { } }
\cs_new_eq:NN \ToP \texorpdfstring

\RequirePackage { aztitle }
\RequirePackage { azinclude }
\RequirePackage { azrecord }
\RequirePackage { azthm }
\RequirePackage { azsolution }

%% Les options de titlesec ne sont pas negociables ici : `explicit` rend #1
%% utilisable dans le corps du format, `pagestyles` fournit \sethead aux themes.
\RequirePackage [ newparttoc, toctitles, explicit, pagestyles ] { titlesec }
\RequirePackage { titletoc }
\RequirePackage { lastpage }
\RequirePackage { bookmark }
%% fontawesome : les pictogrammes des blocs semantiques. Charge par la classe
%% et non par azbloc, qui doit rester utilisable sans lui — une icone est un
%% repere, pas un contenu.
\RequirePackage { fontawesome }

\ExplSyntaxOff
\usetikzlibrary{calc,babel,positioning}
\ExplSyntaxOn

%% Les placements retenus en option de classe sont transmis à azsolution une
%% fois celui-ci chargé — la classe ne fait que porter la décision.
\azsetupsolutions
  {
    solution = \bool_if:NTF \g_az_doc_solution_bool { true } { false } ,
    proof    = \bool_if:NTF \g_az_doc_proof_bool { true } { false } ,
  }
\bool_if:NT \g_az_doc_solution_delayed_bool { \azsetupsolutions { solution* } }
\bool_if:NT \g_az_doc_proof_delayed_bool    { \azsetupsolutions { proof* } }

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%% Numérotation et retraits
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\azsetlabel* { chapter }    { |1| }
\azsetlabel* { section }    { |I| }
\azsetlabel* { subsection } { |S|.|1| }

%% Les articulations à l'intérieur d'un bloc : l'unité prend le numéro du bloc
%% en préfixe, les énumérations reprennent à un chaque fois.
\cs_new_protected:Npn \az_doc_enumstyle:
  {
    \azsetenum {1} { marge }
    \azsetenum {2} { marge* }
    \azsetlabel { unite }  { |X|.|1| }
    \azsetlabel { enumi }  { |X|.|1| }
    \azsetlabel { enumii } { |Q|.|a| }
    %% ##1 : ces décorations sont posées depuis le CORPS d'une fonction, où le
    %% paramètre de la décoration doit être doublé pour lui parvenir intact.
    \azsetdeco { unite }
      { \textcolor{thmcol}{ \sffamily \small \scshape \bfseries ##1. } }
    \azsetdeco { enumi }  { \bfseries ##1. }
    \azsetdeco { enumii } { \bfseries ##1. }
    \azsetdeco { itemtitle }  { { \scshape \sffamily ##1~:~ } }
    \azsetdeco { unitetitle }
      { \textcolor{thmcol}{ \sffamily \scshape \small ##1~:~ } }
    \azsetlabel { equation } { |C|.|1| }
    \azmakethetolabel { equation }
  }

%% Les espacements dépendent de la largeur de colonne, donc de la géométrie :
%% ils sont rejoués chaque fois que \azgeometry passe.
\cs_new_protected:Npn \az_doc_enumspaces:
  {
    \ifcompact
      \azsetenum* {1} { marge* }
      \azsetenum* {2} { marge*=1pc }
      \azsetenum* {3} { marge*=1pc }
    \else
      \azsetenum* {1} { marge+ }
      \azsetenum* {2} { marge* }
      \azsetenum* {3} { marge+ }
    \fi
    \ifprint \azsetenum {0} { align=l } \fi
  }

\tl_gput_right:Nn \g_az_layout_after_tl { \az_doc_enumspaces: }

\AddToHook { begindocument/before } { \az_doc_enumstyle: }

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%% Titres de section
%%
%% titlesec est employé DIRECTEMENT, sans enrobage maison : c'est ce que les
%% futurs thèmes feront aussi, et une couche intermédiaire les aurait obligés
%% à passer par une interface de plus.
%%
%% Le bandeau lui-même est une tcolorbox, ce qui donne au titre le même
%% vocabulaire de style qu'aux blocs sémantiques.
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\tl_new:N \az@chapter@anchor
\tl_new:N \az@section@anchor
\tl_new:N \az@chapter@deco
\tl_new:N \az@aftersection@hook
\tl_set:Nn \az@chapter@anchor { north~east }
\tl_set:Nn \az@section@anchor { west }

\keys_define:nn { az / sectiontitle }
  {
    chapter~style .code:n = { \tcbset { az@chapter@style/.style = {#1} } } ,
    section~style .code:n = { \tcbset { az@section@style/.style = {#1} } } ,
    chapter~label~style .code:n =
      { \tikzset { az@chapter@label/.style = {#1} } } ,
    section~label~style .code:n =
      { \tikzset { az@section@label/.style = {#1} } } ,
    subsection~label~style .code:n =
      { \tikzset { az@subsection@label/.style = {#1} } } ,
    chapter~label~decoration .tl_set:N = \az@chapter@deco ,
    chapter~label~anchor .tl_set:N = \az@chapter@anchor ,
    section~label~anchor .tl_set:N = \az@section@anchor ,
    after~section~hook   .tl_set:N = \az@aftersection@hook ,
  }

\NewDocumentCommand \azsetuptitles { m }
  { \keys_set:nn { az / sectiontitle } {#1} }

\azsetuptitles
  {
    chapter~style =
      { colback = pagecol, coltext = textcol, boxrule = 0pt, lowerbox = ignored } ,
    section~style =
      { boxrule = 0pt, coltext = textcol, colback = pagecol, fontupper = \itshape } ,
    chapter~label~style = { } ,
    section~label~style = { } ,
    subsection~label~style = { } ,
  }

\ExplSyntaxOff

\titleformat{name=\chapter}[display]
  {\normalfont\huge\scshape}{}{0pt}
  {%
    \begin{tcolorbox}[
        enhanced, az@chapter@style,
        overlay={
          \node (chapter label) [az@chapter@label]
            at (frame.\az@chapter@anchor) {\az@label@chapter};
          \az@chapter@deco
        }
      ]
      #1
    \end{tcolorbox}%
  }
\titleformat{name=\chapter,numberless}[display]
  {\normalfont\huge}{}{0pt}
  {\begin{tcolorbox}[az@chapter@style]\filright #1\end{tcolorbox}}

\titleformat{\section}[block]
  {\sffamily\Large\scshape}{}{0pt}
  {%
    \begin{tcolorbox}[
        az@section@style,
        overlay={
          \node (section) [az@section@label]
            at (frame.\az@section@anchor) {\az@label@section};
        },
        force nobeforeafter,
        overlay={\az@aftersection@hook}
      ]
      \vphantom{(}#1
    \end{tcolorbox}%
  }
\titleformat{name=\section,numberless}
  {\sffamily\Large\scshape}{}{0pt}
  {\begin{tcolorbox}[az@section@style, force nobeforeafter]\vphantom{(}#1\end{tcolorbox}}

\titleformat{\subsection}
  {\sffamily\large\scshape}
  {\tikz[baseline=(S.base)]\node(S)[az@subsection@label]{\az@label@subsection};}
  {3pt}
  {\itshape#1}

\ExplSyntaxOn

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%% Encadrés génériques
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\azsetdeco { indication } { \textbf {#1~:} \kern 4pt }

%% Un encadré léger pour une formule ou un résultat. En brouillon il se réduit
%% à un \fbox : le tracé tikz coûte cher et n'apprend rien à la relecture.
\NewDocumentCommand \genboxcmd { O{} +m } { \fbox {#2} }

\AddToHook { begindocument/before }
  {
    \ifdraft \else
      \tikzset
        {
          az@generic/.style =
            {
              fill = none, draw = framestrokecol,
              inner~sep = 3pt, rounded~corners = 3pt
            }
        }
      \RenewDocumentCommand \genboxcmd { O{} +m }
        { \tikz [ baseline=(T.base) ] \node (T) [ az@generic, #1 ] { \strut #2 } ; }
    \fi
  }

\azsetdeco { formula } { \genboxcmd [ draw = thmcol ] {#1} }
\azsetdeco { result }
  {
    \genboxcmd
      [
        double~distance = .6pt, line~width = 1.2pt, inner~sep = 4pt,
        fill = framebackcol, draw = pagecol, double = thmcol
      ]
      {#1}
  }

\azsetuptcb { az@simplelabel/.style = { } }
\azsetdeco { simple }
  { \textcolor{thmcol}{ \fbox {#1} } \enskip }

\keys_define:nn { az / mini } { unknown .code:n = { } }
\keys_set:nn { az / mini }
  { left~margin = 1pc , right~margin = 0pt , font = \sffamily \footnotesize }

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%% Renvois croisés
%%
%%   \xref{clef}      renvoi nommé — « théorème 3 »
%%   \xref*{clef}     sans hyperlien
%%   \xref\n{clef}    le numéro seul
%%   \xref\t{clef}    l'intitulé
%%   \xref\p{clef}    suivi de la page
%%   \xref\c{clef}    le corrigé plutôt que l'énoncé
%%
%% Réécrit : la version de cpgedoc définissait \xref@ref et \x@ref sans jamais
%% s'en servir, et ne produisait donc rien.
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\azsetdeco { pageref } { \sffamily \smaller {} [p.~#1] }

\NewDocumentCommand \xref { s t\n t\t t\p t\c m }
  {
    \tl_set:Nn \l__az_xref_key {#6}
    \IfBooleanT {#5} { \tl_set:Nn \l__az_xref_key { solution:#6 } }
    \IfBooleanTF {#3}
      { \az_xref_do:nnn { \nameref } {#1} { \l__az_xref_key } }
      {
        \IfBooleanTF {#2}
          { \az_xref_do:nnn { \ref } {#1} { \l__az_xref_key } }
          { \az_xref_do:nnn { \autoref } {#1} { \l__az_xref_key } }
      }
    \IfBooleanT {#4}
      { \space \azusedeco { pageref } { \pageref* { \l__az_xref_key } } }
  }

\tl_new:N \l__az_xref_key

\cs_new_protected:Npn \az_xref_do:nnn #1#2#3
  {
    \bool_if:nTF {#2}
      { \use:x { \exp_not:N #1 * { \exp_not:V #3 } } }
      { \use:x { \exp_not:N #1   { \exp_not:V #3 } } }
  }

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%% Gabarits de titre par défaut
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\azsettitle  { |document| \par |theme| \par |periode| }
\azsettitle* { |document| \par |theme| \par |periode| }

%% Un document de cours s'ouvre sur une page de garde.
\AddToHook { begindocument/before } { \titlepagetrue }

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%% Le vocabulaire du cours
%%
%% Les mêmes noms que azthm, redéclarés pour porter leur solution ou leur
%% démonstration. C'est ce qui distingue un cours d'un simple document : ses
%% résultats se démontrent et ses exercices se corrigent.
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\azrenewtheorem [ use~counter = theo, within~chapter~or~section ] {theo}
  {Théorème} {théorème} {du~} {theorem} {titled~items, with~proof}
\azrenewtheorem [ use~counter~from = theo ] {theodef}
  {Théorème~et~définition} {théorème} {du~} {theorem} {titled~items, with~proof}
\azrenewtheorem [ use~counter~from = theo ] {propdef}
  {Proposition~et~définition} {proposition} {de~la~} {theorem} {titled~items, with~proof}
\azrenewtheorem [ use~counter~from = theo ] {prop}
  {Proposition} {proposition} {de~la~} {theorem} {titled~items, with~proof}
\azrenewtheorem [ use~counter~from = theo ] {lemm}
  {Lemme} {lemme} {du~} {theorem} {with~proof}
\azrenewtheorem [ use~counter~from = theo ] {ppte}
  {Propriétés} {propriétés} {des~} {theorem} {titled~items, with~proof}
\azrenewtheorem [ use~counter~from = theo ] {coro}
  {Corollaire} {corollaire} {du~} {theorem} {titled~items, with~proof}

%% En série, les exercices se numérotent d'un bout à l'autre du document :
%% c'est un recueil, pas un cours découpé en sections.
\ifserie
  \azrenewtheorem [ use~counter = exer ] {exer}
    {Exercice} {exercice} {de~l'} {exercise} {titled~items, with~solution}
  \counterwithout {exer} {section}
\else
  \azrenewtheorem [ use~counter = exer, within~chapter~or~section ] {exer}
    {Exercice} {exercice} {de~l'} {exercise} {titled~items, with~solution}
\fi

\azrenewtheorem [ use~counter~from = exer ] {exerappli}
  {Exercice~d'application} {exercice} {de~l'} {exercise} {titled~items}
\azrenewtheorem [ use~counter~from = exer ] {exerappro}
  {Exercice~d'approfondissement} {exercice} {de~l'} {exercise}
  {titled~items, with~solution}
\azrenewtheorem [ use~counter~from = exer ] {prob}
  {Problème} {problème} {du~} {exercise} {titled~items, with~solution}

\azdefcounter { obje } { |1| }
\aznewtheorem [ use~counter = obje ] {obje}
  {Objectifs} {objectif} { } {theorem} {titled~items}
\counterwithout { obje } { section }

\endinput
