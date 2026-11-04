# github-pr-dashboard

Dashboard web des pull requests et des reviews par contributeur d'une organisation GitHub, sur une période glissante
(30 jours, 90 jours, 12, 24 ou 36 mois) ou des dates choisies dans les 36 derniers mois. L'organisation n'a pas de valeur par
défaut : elle se configure avec la variable `ORG`.

Site statique sans build ni dépendance, déployé sur GitHub Pages par un workflow planifié. La page relit les données
chaque minute et anime les compteurs quand de nouvelles PR, merges ou reviews arrivent.

Le dashboard est découpé en pages, dans une barre latérale (une barre en haut sur les écrans étroits). La période et
la recherche s'appliquent à toutes. Tous les délais ne comptent que les heures ouvrées, du lundi au vendredi de 9 h à
18 h, heure de Paris ; un jour en compte 9. Seules les durées des exécutions de CI restent en temps réel :

- **Vue d'ensemble** : l'activité du jour, puis celle de la période en trois volets, livraison (PR ouvertes et
  mergées, délai de merge, mises en production, part de hotfix), lignes de code (ajoutées, supprimées, taille médiane
  des PR) et revue (PR relues, commentaires par PR, approbations sans commentaire, PR mergées sans review), chaque
  tuile menant à sa page ; l'activité par période et le fil des 7 derniers jours ; la part de chaque technologie dans
  les PR de code, ou au choix dans les lignes ajoutées,
  avec son logo (les langages d'un dépôt sont regroupés sous le framework que déclarent ses fichiers de
  dépendances : Laravel, Nuxt, NestJS, Flutter…) ; le tableau des dépôts (type, technos, PR, contributeurs, lignes
  ajoutées et supprimées, délai de merge, PR mergées sans review, PR relues).
- **À débloquer** : les PR de code ouvertes qui attendent quelqu'un, hors brouillons, les plus anciennes d'abord :
  approuvées mais pas mergées depuis plus d'un jour ouvré, approuvées par moins de personnes qu'il n'en faut pour
  merger (`REQUIRED_APPROVALS`), bloquées par un code owner qui ne les a pas encore relues, avec des changements
  demandés ou en discussion depuis plus de trois jours ouvrés, sans review depuis plus d'un jour ouvré, chacune avec qui l'a approuvée ou a demandé des changements ; à part,
  les oubliées, sans review ni commentaire depuis plus d'un mois. Elle ne dépend pas de la période, seulement de la
  dernière synchro. En bas, les PR de code que leur auteur a mergées sans approbation sur les 30 derniers jours, dans
  les dépôts front, back et mobile, à relire après coup.
- **Bilan du mois** : un mois au choix, comparé au précédent et à la médiane des 12 derniers mois complets :
  livraison (lignes ajoutées et supprimées comprises), revue, intégration continue et équipe, chaque évolution en
  vert ou en orange quand elle a un bon sens ;
  les champions du mois, les dépôts les plus actifs et les arrivées. Le mois en cours y figure, provisoire, sans
  comparaison.
- **Analyse** : ce qui ressort de la période et des pistes pour progresser. Dix règles fixes croisent les chiffres :
  taille des PR et délai de merge, PR géantes mergées sans review plus souvent que les autres, étape qui retient les
  PR avant leur merge, dépôts suspendus à un relecteur ou mergés sans review, workflows qui échouent souvent ou qui
  sont lents, PR fermées sans merge, et ce qui se dégrade ou s'améliore d'une moitié de la période à l'autre. Chaque
  constat, prioritaire ou à surveiller, donne ses chiffres, une piste et la page qui le détaille ; une règle ne parle
  qu'au-delà de son seuil, sur assez de PR ou d'exécutions, et les autres sont listées sous « Rien à signaler ». Les
  seuils sont dans la Méthode. La recherche ne s'y applique pas.
- **Auteurs** : le tableau par auteur, filtrable par dépôt ou par type de dépôt (front, back, mobile, autres), avec
  la stack de chaque personne (front, back, mobile ou full-stack, et ses technologies principales) et ses lignes
  ajoutées et supprimées ; l'effet de la taille des PR sur le délai de merge et la profondeur de review.
- **Relecteurs** : le tableau par relecteur, avec les mêmes filtres et la même stack ; l'évolution par relecteur.
- **Cycle de vie** : où passe le temps d'une PR de code, découpé en quatre étapes : prise en charge (jusqu'à la
  première review), relecture (jusqu'à la dernière approbation), merge, puis mise en prod. La médiane de chaque étape,
  la part moyenne de chacune dans le temps d'une PR, par type de dépôt et par taille, leur évolution et le détail par
  dépôt, avec un filtre de dépôts pour toute la page.
- **Collaboration** : qui relit qui, en matrice auteurs × relecteurs (les personnes sous 2 % des relectures
  regroupées ; les binômes les plus fréquents sur un écran étroit), et pour chaque auteur le nombre de relecteurs distincts et la dépendance à son relecteur principal, pour
  repérer les binômes figés et le savoir qui circule peu, pas pour classer des personnes ; filtrable par dépôt.
- **Équipe** : une carte par personne qui a écrit ou relu du code sur la période, triées par nombre de PR de code
  et filtrables par dépôt : sa photo, son ancienneté (depuis sa première PR dans l'organisation, même avant les données
  synchronisées, ou sa première review ou son premier commentaire s'ils sont plus anciens), sa stack et ses technologies principales, ses PR de code, mergées et leur délai
  de merge, ses PR relues, ses commentaires par PR relue et le nombre de personnes qui relisent son code. Un clic
  ouvre la fiche de la personne, une carte qui s'incline vers la souris : lignes ajoutées et supprimées, taux de
  merge, attente de la première
  review, profondeur des relectures, qui relit son code et quel code la personne relit, ses dépôts. Sous chaque
  chiffre, la médiane des personnes de la même stack (de toute l'équipe si la stack compte moins de trois personnes) :
  de quoi situer la personne parmi celles qui font le même travail, sans score ni classement. En bas, les anciens
  collaborateurs.
- **Badges**, sur les cartes et dans la fiche, à la façon des succès GitHub : 🦈 Requin des PR, 🔍 Œil de lynx,
  🪶 Plume, 🚒 Pompier, 🏗️ Bâtisseur et 🧹 Coup de balai, pour le plus de PR ouvertes (merges de branches compris,
  releases à part), de PR relues, de commentaires de review, de hotfix, de lignes ajoutées ou de lignes supprimées de
  toute l'équipe sur un mois complet (les lignes au mois du merge ; hors Requin, seules les PR de code comptent). Bronze pour un mois, argent pour deux mois d'affilée, or pour trois ou plus ; leur sens
  s'affiche au survol. Une carte et une fiche en montrent trois, les autres sous un « +N » qui les nomme au survol. Ils se gagnent depuis la première synchro et restent acquis : la synchro garde l'historique
  mensuel de chacun au-delà de la fenêtre de 36 mois, dans son snapshot, et le relit dans les stats déjà publiées si
  le cache d'Actions s'est perdu. Quand une correction change la façon de compter, la synchro suivante recompte une
  fois les mois encore dans la fenêtre ; les mois plus anciens restent tels quels.
- **Palmarès** : les champions de chaque badge pour le dernier mois complet et, provisoirement, pour le mois en cours ;
  le tableau d'honneur, qui détient quel badge et à quel niveau ; les champions de chaque mois depuis la première
  synchro. Les personnes parties comptent dans la course, et n'apparaissent sous leur nom que dans ce dernier tableau.
- **Noms des personnes**, sur toutes les pages : un clic sur un nom (tableaux, activité récente, À débloquer,
  binômes, fiche) ouvre la fiche de la personne, qui mène à son profil GitHub.
- **Anciens collaborateurs**, sur toutes les pages : une personne sans aucune PR, review, commentaire ni merge depuis
  un mois est considérée comme partie : plus rien à son nom dans les tableaux, les listes, la matrice ni les cartes,
  seulement une mention dans la partie « Anciens collaborateurs » de la page Équipe, avec sa dernière activité, et
  son nom parmi les champions de chaque mois du Palmarès. Sa fiche dit qu'elle ne fait plus partie de l'équipe. Ses
  PR restent comptées dans les totaux, les graphiques et les dépôts. Dans les dépôts portés par une seule personne,
  celle qui en a écrit le plus reste nommée même partie, marquée « hors équipe » : son code est toujours là.
- **Dépôts** : une carte par dépôt avec des PR de code sur la période, filtrables par dépôt : son type, ses
  technologies, les personnes de l'équipe qui l'écrivent le plus, son bus factor (le plus petit nombre de personnes
  qui écrivent à elles seules la moitié de ses PR), son volume, ses délais de review et de merge, ses déploiements et
  sa CI. En tête, les dépôts actifs qui reposent sur une seule personne, ou sur des personnes parties. Un clic sur
  une carte ouvre la fiche du dépôt : ses chiffres de code (lignes ajoutées et supprimées comprises), de revue et de
  mise en prod, chacun avec la médiane des dépôts du même type, et qui l'écrit et le relit.
- **Noms des dépôts**, sur toutes les pages : un clic sur un nom de dépôt (tableaux, cartes, fiches) ouvre sa fiche,
  qui mène au dépôt sur GitHub.
- **TMA** : volume et délais des hotfix (branches `hotfix/*`), qui les fait, sur quels dépôts et quand.
- **DevOps** : les indicateurs DORA (déploiements, délai jusqu'en prod, taux de reprise par des correctifs,
  rétablissement), au total et par dépôt ; le calendrier des mises en production, quand chaque dépôt déploie, par
  jour, semaine ou mois selon la période ; la durée, les échecs et les relances de la CI GitHub Actions, par
  workflow, et la part des PR mergées avec un check rouge ; les PR Dependabot, par dépôt et par écosystème. GitHub
  efface les exécutions de CI au bout d'environ 13 mois : la CI ne remonte qu'à celles que la synchro a déjà lues, et
  s'allonge avec le temps jusqu'à 36 mois ; une période qui commence avant le dit.
- **Méthode** : les règles communes ; chaque colonne est expliquée sous son tableau.

Chaque page a son adresse (`#/a-debloquer`, `#/bilan`, `#/auteurs`, `#/relecteurs`, `#/cycle`, `#/collaboration`,
`#/equipe`, `#/palmares`, `#/depots`, `#/tma`, `#/devops`, `#/methode`) : les liens se partagent.

Une page restée ouverte se recharge d'elle-même après un nouveau déploiement. Le bouton en haut à droite bascule
entre mode clair et mode sombre (par défaut, celui du système), et le choix est retenu par le navigateur.

## Accès protégé

Les stats sont publiées **chiffrées** : le site est public, mais sans le mot de passe ses données sont illisibles,
pour un visiteur comme pour un robot.

- Le mot de passe (`DASHBOARD_PASSWORD`) est une clé aléatoire longue, gardée dans le `.env` local et dans les
  secrets de l'environnement `github-pages`. Il n'apparaît ni dans le code, ni dans les fichiers publiés, ni dans
  les logs.
- La synchro dérive une clé AES-256 du mot de passe (PBKDF2-SHA256, 600 000 itérations), compresse les stats puis
  les chiffre en AES-GCM dans `site/data/stats.enc.json`. Sans mot de passe, elle refuse de tourner : rien n'est
  jamais publié en clair.
- La page demande le mot de passe et déchiffre les stats dans le navigateur. La clé reste 30 jours sur l'appareil,
  puis le mot de passe est redemandé. Le cadenas en haut à droite reverrouille tout de suite.
- Une fois le mot de passe accepté, la page demande au navigateur de l'enregistrer sous le nom « Stats PR » (Chrome
  et Edge ; les autres navigateurs le proposent selon leurs propres règles). Le gestionnaire de mots de passe le
  remplit ensuite tout seul. Un Chrome géré par une organisation peut avoir l'enregistrement désactivé (règle
  `PasswordManagerEnabled`) : aucun site n'y peut rien, et le mot de passe se retape alors une fois par mois.

### Bouton de synchro

Le bouton ⟳ en haut de la page lance une synchro rapide (PR modifiées, environ 1 min) ou complète (les 12 derniers
mois, 15 à 20 min, à garder exceptionnelle : les autres synchros attendent pendant ce temps). L'icône tourne les quelques
secondes que GitHub met à accepter la demande, puis la page affiche les nouvelles données dès qu'elles sont
publiées. Il n'apparaît que si le
secret `DISPATCH_TOKEN` existe : un token fine-grained limité à ce repo, avec la seule permission _Actions_ en
lecture et écriture. Il voyage dans les stats chiffrées : toute personne qui a le mot de passe peut s'en servir,
pour lancer ou annuler des runs de ce workflow et rien d'autre.

La synchro complète peut avoir son propre mot de passe, distinct de celui de la page : `FULL_SYNC_PASSWORD`, dans le
`.env` et dans un secret (`gh secret set FULL_SYNC_PASSWORD --env github-pages`). Choisir là aussi une valeur longue
et aléatoire. Une fois le secret posé, la synchro suivante publie de quoi le vérifier, et la page le demande à chaque
synchro complète, sans le retenir. La vérification qui compte se fait dans le run : comme le token du bouton se lit
dans les stats, n'importe qui avec le mot de passe de la page pourrait lancer le workflow sans passer par la page. La
page signe donc la demande avec une clé dérivée du mot de passe de la synchro complète (PBKDF2-SHA256, 600 000
itérations, puis HMAC-SHA256 du dépôt et de l'heure), et le run vérifie cette preuve, valable 2 heures, le temps
d'attendre les runs déjà lancés. L'heure vient du serveur qui sert la page, pas de l'horloge de l'ordinateur, qui peut
être décalée (5 minutes de marge). Sans preuve valable, le run fait une synchro rapide à la place, le dit en une
ligne dans ses logs, sans autre détail, et la page qui l'a demandée l'annonce dans le menu de synchro (mot de passe
changé depuis la dernière synchro, ou demande expirée). Conséquence : avec ce mot de passe en place, l'option de resynchro complète
du bouton _Run workflow_ de GitHub ne suffit plus, il faut passer par la page ou par `npm run sync:full` en local
(qui, lui, n'en demande pas : il a déjà le `.env`). Sans `FULL_SYNC_PASSWORD`, rien ne change : la synchro complète se
lance sans mot de passe.

Changer le mot de passe : mettre la nouvelle valeur dans le `.env` et dans le secret (`gh secret set
DASHBOARD_PASSWORD --env github-pages`), puis lancer le workflow. Les pages ouvertes redemandent alors le mot de passe.

## Fonctionnement

- `scripts/sync.mjs` interroge l'API GraphQL de GitHub :
  - premier passage : toutes les PR créées sur les 12 derniers mois, repo par repo (environ 7 min pour une centaine de repos) ;
  - passages suivants : uniquement les PR modifiées depuis la dernière synchro, via l'API de recherche (quelques
    secondes) ;
  - à chaque passage, tant que le snapshot ne couvre pas les 36 derniers mois : les PR créées dans les 30 jours
    d'avant ce qu'il couvre, via l'API de recherche (environ une minute). Les deux années avant la dernière reviennent
    ainsi en 25 synchros, sans dépasser le timeout du workflow ni le quota horaire du token : ce rattrapage attend
    quand il reste moins de 2 500 points GraphQL dans l'heure ;
  - une synchro complète relit les 12 derniers mois et garde les PR plus anciennes telles qu'elles ont été lues.
- Pour l'ancienneté, elle cherche une fois par personne sa toute première PR dans l'organisation (une recherche d'un
  seul résultat, un point du quota) et garde la réponse dans le snapshot.
- Elle lit aussi, par l'API REST, les exécutions GitHub Actions des dépôts poussés depuis la dernière synchro
  (toutes celles des 12 derniers mois au premier passage), et l'état des checks du dernier commit de chaque PR. GitHub
  les efface au bout d'environ 13 mois : le snapshot les garde 36 mois.
- Les PR brutes et les exécutions sont gardées dans `.cache/snapshot.json` (jamais publié). La synchro en tire une
  version réduite à ce que comptent les stats (dépôt, numéro, auteur, dates, taille et lignes supprimées, reviews et
  commentaires, sans
  titre ni contenu ; exécutions regroupées par workflow et par jour), publiée chiffrée dans
  `site/data/stats.enc.json`. La page en calcule les stats de la période choisie
  (`site/period.js`) : n'importe quelles dates des 36 derniers mois, et les chiffres de chaque personne détaillés par
  dépôt pour le filtre des tableaux.
  `site/data/version.json` porte seulement la date de génération : la page le relit chaque minute et ne
  retélécharge les stats que lorsqu'elle change.
- Le type de chaque dépôt (front, back, mobile ou autres : docs, infra, outillage) est déduit des langages que
  GitHub y détecte. Les dépôts mal jugés se corrigent avec `REPO_CATEGORIES` (`repo:type,repo:type`), gardée dans le
  `.env` et dans un secret plutôt que dans le code, puisque les noms des dépôts de l'org sont privés.
- Les logos des technologies viennent de [Simple Icons](https://simpleicons.org) (CC0), embarqués dans
  `site/technology-icons.svg` : la page n'appelle aucun service tiers.
- Les bots sont exclus partout : comptes de type bot (GitHub Apps, détectés via l'API) et comptes de service listés
  dans `BOT_USERS`.
- Les noms affichés sont ceux des profils GitHub (identifiant à défaut).
- Les PR de release (`release/*`, release-please, `develop` → `master`) et d'intégration (`merge*`, back-merges,
  `project/*/main` → `develop`/`master`, branches de projet qui en ramènent une autre, comme
  `project/*/merge-develop`, `project/*/develop-into-main` ou `project/*/sync-develop`) sont comptées à part : les
  merges, taux, délais et lignes portent sur les PR de code.

## En local

Node 24 et `gh` authentifié suffisent (le token est lu via `gh auth token` si `GITHUB_TOKEN` n'est pas défini).
Copier `.env.example` en `.env` et renseigner `ORG` et `DASHBOARD_PASSWORD`.

```bash
npm run sync        # synchro (complète la première fois, incrémentale ensuite)
npm run serve       # http://localhost:4173
npm run dev         # synchro toutes les 60 s + serveur, pour un affichage en direct
npm run sync:full   # force une resynchro complète, sans demander FULL_SYNC_PASSWORD
```

## Déploiement (GitHub Actions + Pages)

Le workflow `.github/workflows/deploy.yml` est planifié toutes les 15 minutes du lundi au vendredi, de 6-7 h à
20-21 h (heure de Paris), et tourne aussi à chaque push sur `main` et à la demande (avec une option de resynchro
complète, qui demande la preuve du mot de passe de la synchro complète quand `FULL_SYNC_PASSWORD` est posé). Le
snapshot est conservé d'un run à l'autre dans le cache Actions.

GitHub ne garantit pas les déclenchements planifiés : ils sont souvent retardés ou sautés. Pour des données à jour
tout de suite, lance le workflow depuis Actions → _Sync and deploy_ → _Run workflow_, ou avec
`gh workflow run deploy.yml`.

Prérequis :

1. Des secrets dans l'environnement `github-pages` (Settings → Environments → github-pages), que seule `main` peut
   utiliser : des secrets plutôt que des variables, pour que les logs publics du workflow n'en affichent aucun, et
   dans l'environnement plutôt que dans le repo, pour qu'aucun workflow d'une autre branche ne puisse les lire.
   En CI, la synchro n'écrit dans les logs ni chiffre ni réponse de GitHub.
   - `ORG` : l'organisation à suivre ;
   - `ORG_STATS_TOKEN` : token avec accès en lecture aux PR des repos de l'org (PAT classique avec les scopes `repo`
     et `read:org`, ou fine-grained en lecture seule sur _Pull requests_ et _Metadata_, plus _Actions_ et _Commit
     statuses_ pour la page DevOps) ;
   - `DASHBOARD_PASSWORD` : le mot de passe de la page ;
   - `REPO_CATEGORIES` (facultatif) : les corrections de type de dépôt ;
   - `BOT_USERS` (facultatif) : les comptes utilisateurs de l'org qui agissent en bots, séparés par des virgules ;
   - `REQUIRED_APPROVALS` (facultatif) : le nombre d'approbations qu'il faut pour merger une PR, 1 par défaut ;
   - `DISPATCH_TOKEN` (facultatif) : le token du bouton de synchro ;
   - `FULL_SYNC_PASSWORD` (facultatif) : le mot de passe de la synchro complète, voir « Bouton de synchro ».
2. Pages activé avec la source **GitHub Actions** (Settings → Pages).

Les tests (`npm test`, sur des données inventées) et la vérification de syntaxe (`npm run check`) tournent sur
chaque PR dans le workflow « Checks », sans accès aux secrets ; la règle de protection de `main` exige qu'ils passent.

Variables d'environnement : `ORG` et `DASHBOARD_PASSWORD` (obligatoires), `REPO_CATEGORIES`, `BOT_USERS`,
`REQUIRED_APPROVALS`, `DISPATCH_TOKEN` (avec `DISPATCH_REPOSITORY`, `owner/repo`, hors CI), `FULL_SYNC_PASSWORD`,
`SNAPSHOT_PATH`, `STATS_PATH` et `PUBLISHED_STATS_URL` (facultatives ; la dernière indique où relire l'historique des
badges, par défaut l'adresse GitHub Pages du dépôt en CI).
