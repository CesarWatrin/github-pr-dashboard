# github-pr-dashboard

Dashboard web des pull requests et des reviews par contributeur d'une organisation GitHub, sur une période glissante
(30 jours, 90 jours, 12 mois). L'organisation n'a pas de valeur par défaut : elle se configure avec la variable `ORG`.

Site statique sans build ni dépendance, déployé sur GitHub Pages par un workflow planifié. La page relit les données
chaque minute et anime les compteurs quand de nouvelles PR, merges ou reviews arrivent.

Le dashboard montre :

- l'activité du jour, puis celle de la période en deux volets : livraison (PR ouvertes et mergées, délai de merge,
  mises en production, part de hotfix) et revue (PR relues, commentaires par PR, approbations sans commentaire, PR
  mergées sans review) ;
- l'activité par période et le fil des 7 derniers jours ;
- les tableaux par auteur et par relecteur, filtrables par dépôt ou par type de dépôt (front, back, mobile, autres),
  avec la stack de chaque personne : front, back, mobile ou full-stack, et ses technologies principales ;
- la part de chaque technologie dans les PR de code, avec son logo : les langages d'un dépôt sont regroupés sous le
  framework que déclarent ses fichiers de dépendances (Laravel, Nuxt, NestJS, Flutter…) ;
- la TMA : volume et délais des hotfix (branches `hotfix/*`), qui les fait, sur quels dépôts et quand ;
- l'effet de la taille des PR sur le délai de merge et la profondeur de review ;
- les PR en attente de review, les dépôts les plus relus et l'évolution par relecteur ;
- une section Méthode qui définit chaque indicateur.

Une page restée ouverte se recharge d'elle-même après un nouveau déploiement. Le bouton en haut à droite bascule
entre mode clair et mode sombre (par défaut, celui du système), et le choix est retenu par le navigateur.

## Accès protégé

Les stats sont publiées **chiffrées** : le site est public, mais sans le mot de passe ses données sont illisibles,
pour un visiteur comme pour un robot.

- Le mot de passe (`DASHBOARD_PASSWORD`) est une clé aléatoire longue, gardée dans le `.env` local et dans les
  secrets du repo. Il n'apparaît ni dans le code, ni dans les fichiers publiés, ni dans les logs.
- La synchro dérive une clé AES-256 du mot de passe (PBKDF2-SHA256, 600 000 itérations), compresse les stats puis
  les chiffre en AES-GCM dans `site/data/stats.enc.json`. Sans mot de passe, elle refuse de tourner : rien n'est
  jamais publié en clair.
- La page demande le mot de passe et déchiffre les stats dans le navigateur. La clé reste un jour sur l'appareil,
  puis le mot de passe est redemandé. Le cadenas en haut à droite reverrouille tout de suite.

Changer le mot de passe : mettre la nouvelle valeur dans le `.env` et dans le secret (`gh secret set
DASHBOARD_PASSWORD`), puis lancer le workflow. Les pages ouvertes redemandent alors le mot de passe.

## Fonctionnement

- `scripts/sync.mjs` interroge l'API GraphQL de GitHub :
  - premier passage : toutes les PR créées sur les 12 derniers mois, repo par repo (environ 7 min pour une centaine de repos) ;
  - passages suivants : uniquement les PR modifiées depuis la dernière synchro, via l'API de recherche (quelques
    secondes).
- Les PR brutes sont gardées dans `.cache/snapshot.json` (jamais publié). Seules les stats agrégées sont publiées,
  chiffrées dans `site/data/stats.enc.json`, avec les chiffres de chaque personne détaillés par dépôt pour le
  filtre des tableaux.
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
  `project/*/main` → `develop`/`master`) sont comptées à part : les merges, taux et délais portent sur les PR de code.

## En local

Node 24 et `gh` authentifié suffisent (le token est lu via `gh auth token` si `GITHUB_TOKEN` n'est pas défini).
Copier `.env.example` en `.env` et renseigner `ORG` et `DASHBOARD_PASSWORD`.

```bash
npm run sync        # synchro (complète la première fois, incrémentale ensuite)
npm run serve       # http://localhost:4173
npm run dev         # synchro toutes les 60 s + serveur, pour un affichage en direct
npm run sync:full   # force une resynchro complète
```

## Déploiement (GitHub Actions + Pages)

Le workflow `.github/workflows/deploy.yml` est planifié toutes les 15 minutes du lundi au vendredi, de 6-7 h à
20-21 h (heure de Paris), et tourne aussi à chaque push sur `main` et à la demande (avec une option de resynchro
complète). Le snapshot est conservé d'un run à l'autre dans le cache Actions.

GitHub ne garantit pas les déclenchements planifiés : ils sont souvent retardés ou sautés. Pour des données à jour
tout de suite, lance le workflow depuis Actions → _Sync and deploy_ → _Run workflow_, ou avec
`gh workflow run deploy.yml`.

Prérequis :

1. Trois secrets de repo (Settings → Secrets and variables → Actions) : des secrets plutôt que des variables, pour
   que les logs publics du workflow n'en affichent aucun.
   - `ORG` : l'organisation à suivre ;
   - `ORG_STATS_TOKEN` : token avec accès en lecture aux PR des repos de l'org (PAT classique avec les scopes `repo`
     et `read:org`, ou fine-grained en lecture seule sur _Pull requests_ et _Metadata_) ;
   - `DASHBOARD_PASSWORD` : le mot de passe de la page ;
   - `REPO_CATEGORIES` (facultatif) : les corrections de type de dépôt.
2. Pages activé avec la source **GitHub Actions** (Settings → Pages).

Variables d'environnement : `ORG` et `DASHBOARD_PASSWORD` (obligatoires), `REPO_CATEGORIES`, `SNAPSHOT_PATH` et
`STATS_PATH` (facultatives).
