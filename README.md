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
- les tableaux par auteur et par relecteur, filtrables par dépôt ;
- l'effet de la taille des PR sur le délai de merge et la profondeur de review ;
- les PR en attente de review, les dépôts les plus relus et l'évolution par relecteur ;
- une section Méthode qui définit chaque indicateur.

Une page restée ouverte se recharge d'elle-même après un nouveau déploiement. Le bouton en haut à droite bascule
entre mode clair et mode sombre (par défaut, celui du système), et le choix est retenu par le navigateur.

## Fonctionnement

- `scripts/sync.mjs` interroge l'API GraphQL de GitHub :
  - premier passage : toutes les PR créées sur les 12 derniers mois, repo par repo (environ 7 min pour PDC-HCSE) ;
  - passages suivants : uniquement les PR modifiées depuis la dernière synchro, via l'API de recherche (quelques
    secondes).
- Les PR brutes sont gardées dans `.cache/snapshot.json` (jamais publié). Seules les stats agrégées sont écrites
  dans `site/data/stats.json`, avec les chiffres de chaque personne détaillés par dépôt pour le filtre des tableaux.
  `site/data/version.json` porte seulement la date de génération : la page le relit chaque minute et ne
  retélécharge les stats que lorsqu'elle change.
- Les bots sont exclus partout : comptes de type bot (GitHub Apps, détectés via l'API) et comptes de service listés
  dans `BOT_USERS`.
- Les noms affichés sont ceux des profils GitHub (identifiant à défaut).
- Les PR de release (`release/*`, release-please, `develop` → `master`) et d'intégration (`merge*`, back-merges,
  `project/*/main` → `develop`/`master`) sont comptées à part : les merges, taux et délais portent sur les PR de code.

## En local

Node 24 et `gh` authentifié suffisent (le token est lu via `gh auth token` si `GITHUB_TOKEN` n'est pas défini).
Copier `.env.example` en `.env` et renseigner `ORG`.

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

1. Une variable de repo `ORG` : l'organisation à suivre (Settings → Secrets and variables → Actions → Variables).
2. Un secret `ORG_STATS_TOKEN` : token avec accès en lecture aux PR des repos de l'org (PAT classique avec les
   scopes `repo` et `read:org`, ou fine-grained en lecture seule sur _Pull requests_ et _Metadata_).
3. Pages activé avec la source **GitHub Actions** (Settings → Pages).

> La page publiée sur un compte personnel est publique, même si le repo est privé : elle expose les logins, les
> noms des repos et les stats par personne.

Variables d'environnement : `ORG` (obligatoire), `SNAPSHOT_PATH` et `STATS_PATH` (facultatives).
