# github-pr-dashboard

Dashboard web des pull requests et des reviews par contributeur d'une organisation GitHub, sur une période glissante
(30 jours, 90 jours, 12 mois). L'organisation n'a pas de valeur par défaut : elle se configure avec la variable `ORG`.

Site statique sans build ni dépendance, déployé sur GitHub Pages par un workflow planifié. La page relit les données
chaque minute et anime les compteurs quand de nouvelles PR, merges ou reviews arrivent.

Le dashboard montre :

- l'activité du jour et de la période (PR ouvertes, mergées, délai médian de merge), avec le fil d'activité récente ;
- les auteurs : PR de code, taux de merge, délai médian, taille médiane ;
- les reviews : PR relues, commentaires, approbations, part des approbations sans commentaire, activité de review par
  période, dépôts les plus relus, tableau par relecteur (taille des PR relues, principaux dépôts) et évolution par
  personne ;
- une section Méthode qui définit chaque indicateur.

## Fonctionnement

- `scripts/sync.mjs` interroge l'API GraphQL de GitHub :
  - premier passage : toutes les PR créées sur les 12 derniers mois, repo par repo (environ 7 min pour PDC-HCSE) ;
  - passages suivants : uniquement les PR modifiées depuis la dernière synchro, via l'API de recherche (quelques
    secondes).
- Les PR brutes sont gardées dans `.cache/snapshot.json` (jamais publié). Seules les stats agrégées sont écrites
  dans `site/data/stats.json`.
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

Le workflow `.github/workflows/deploy.yml` tourne toutes les 15 minutes du lundi au vendredi, de 6-7 h à 20-21 h
(heure de Paris), à chaque push sur `main` et à la demande (avec une option de resynchro complète). Le snapshot est
conservé d'un run à l'autre dans le cache Actions.

Prérequis :

1. Une variable de repo `ORG` : l'organisation à suivre (Settings → Secrets and variables → Actions → Variables).
2. Un secret `ORG_STATS_TOKEN` : token avec accès en lecture aux PR des repos de l'org (PAT classique avec les
   scopes `repo` et `read:org`, ou fine-grained en lecture seule sur _Pull requests_ et _Metadata_).
3. Pages activé avec la source **GitHub Actions** (Settings → Pages).

> La page publiée sur un compte personnel est publique, même si le repo est privé : elle expose les logins, les
> noms des repos et les stats par personne.

Variables d'environnement : `ORG` (obligatoire), `SNAPSHOT_PATH` et `STATS_PATH` (facultatives).
