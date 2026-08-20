%% azsubdoc.cls — la classe des fragments
%%
%%   \documentclass[master=../master]{azsubdoc}
%%
%% Un fragment déclare cette classe et le fichier maître dont il relève. La
%% classe ne met rien en page : elle charge le préambule du maître, ce qui
%% donne au fragment exactement l'environnement dans lequel il sera assemblé.
%%
%% Le maître, lui, s'arrête à son propre \begin{document} — c'est azinclude
%% qui s'en charge, en voyant que cette classe est chargée.
%%
%% D'après subfiles.cls de Federico Garcia. Adaptation : Sadik Boujaida.
%% Licence LPPL 1.3c

\NeedsTeXFormat{LaTeX2e}[2022/06/01]
\ProvidesClass{azsubdoc}[2026-08-20 v0.1 azkit — fragment d'un document maître]

\RequirePackage{l3keys2e}

\newif\ifsubdoc
\subdoctrue

\ExplSyntaxOn

\tl_new:N \g_az_subdoc_master_tl
\tl_new:N \g_az_subdoc_options_tl

\msg_new:nnnn { azkit } { subdoc-sans-maitre }
  { Aucun~fichier~maître~indiqué. }
  {
    Un~fragment~doit~nommer~son~maître~:~
    \string\documentclass[master=<fichier>]{azsubdoc}.
  }

%% Les options que cette classe ne connaît pas ne sont pas des erreurs : elles
%% appartiennent à la classe du MAÎTRE, qui les recevra en le chargeant. C'est
%% ce qui permet d'écrire [master=…, solution*] sur un fragment.
\keys_define:nn { az / subdoc }
  {
    master  .tl_gset:N = \g_az_subdoc_master_tl ,
    unknown .code:n =
      {
        \tl_if_novalue:nTF {#1}
          { \tl_gput_right:Nx \g_az_subdoc_options_tl { , \l_keys_key_str } }
          { \tl_gput_right:Nx \g_az_subdoc_options_tl
              { , \l_keys_key_str = { \exp_not:n {#1} } } }
      } ,
  }

\ProcessKeysOptions { az / subdoc }

\tl_if_empty:NT \g_az_subdoc_master_tl
  { \msg_error:nn { azkit } { subdoc-sans-maitre } }

%% Le \documentclass du maître doit charger SA classe, pas relancer celle-ci.
\cs_set_eq:NN \az@subdoc@documentclass \documentclass
\cs_set_protected:Npn \documentclass
  {
    \cs_set_eq:NN \documentclass \az@subdoc@documentclass
    \LoadClass
  }

\ExplSyntaxOff

\RequirePackage{import}

%% Les chemins du maître sont résolus depuis SON dossier le temps de lire son
%% préambule, puis rendus au dossier courant : le fragment continue ensuite à
%% désigner ses propres figures relativement à lui-même.
\def\az@subdoc@parse#1{%
  \filename@parse{#1}%
  \edef\import@path{\filename@area}%
  \edef\input@path{{\filename@area}}%
  \input{#1}%
  \gdef\import@path{}%
}

\ExplSyntaxOn
\exp_args:NV \az@subdoc@parse \g_az_subdoc_master_tl
\ExplSyntaxOff

\endinput
