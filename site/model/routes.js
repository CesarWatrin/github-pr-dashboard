// The pages of the dashboard, one per hash, and the page shown.

import { t } from '../lib/i18n.js'

// The pages whose tiles are about the period: the comparison is only offered there.
export const COMPARED_ROUTES = new Set(['overview', 'cycle', 'tma', 'devops', 'acs', 'effort'])

// Pages of the dashboard, one per hash: links can be shared and the browser history works. The period and the search
// apply to every page but the method; the analysis page has the period only.
/**
 * A page: its hash, its title, the filters it leaves out (false), and what its search finds when not people or
 * repositories (searchLabel).
 * @typedef {{ hash: string, title: string, subtitle: string, filters?: boolean, period?: boolean, search?: boolean, searchLabel?: string }} Route
 */

/** @type {Record<string, Route>} */
export const ROUTES = {
  overview: { hash: '#/', title: t('Vue d’ensemble'), subtitle: t('PR et reviews de toute l’équipe, et ce qui attend') },
  unblock: { hash: '#/a-debloquer', title: t('À débloquer'), subtitle: t('Les PR ouvertes qui attendent quelqu’un, les plus anciennes d’abord'), period: false },
  me: { hash: '#/mes-pr', title: t('Mes PR'), subtitle: t('Les reviews qu’on me demande, mes PR ouvertes et celles prêtes à merger'), filters: false },
  authors: { hash: '#/auteurs', title: t('Auteurs'), subtitle: t('Qui livre quoi, et comment') },
  reviewers: { hash: '#/relecteurs', title: t('Relecteurs'), subtitle: t('Qui relit, et avec quelle profondeur') },
  cycle: { hash: '#/cycle', title: t('Cycle de vie'), subtitle: t('Où passe le temps d’une PR, de son ouverture à la prod') },
  collaboration: { hash: '#/collaboration', title: t('Collaboration'), subtitle: t('Qui relit qui, et qui connaît quel dépôt') },
  cartography: { hash: '#/cartographie', title: t('Cartographie'), subtitle: t('L’équipe en réseau : qui relit qui, et qui écrit où') },
  team: { hash: '#/equipe', title: t('Équipe'), subtitle: t('Chaque personne en un coup d’œil : ce qu’elle écrit, ce qu’elle relit') },
  squads: { hash: '#/squads', title: t('Squads'), subtitle: t('Les squads classées et comparées, puis le détail de celle choisie'), search: false },
  report: { hash: '#/bilan', title: t('Bilan du mois'), subtitle: t('Un mois comparé au précédent et au reste de l’année'), filters: false },
  trends: { hash: '#/tendances', title: t('Tendances'), subtitle: t('Les indicateurs clés mois après mois, sur les mois de la période'), search: false },
  analysis: { hash: '#/analyse', title: t('Analyse'), subtitle: t('Ce qui ressort de la période, et des pistes pour progresser'), search: false },
  wrapped: {
    hash: '#/retro',
    title: t('Rétrospective'),
    subtitle: t('L’année en revue d’une personne ou de toute l’équipe, à revoir et à partager'),
    filters: false,
  },
  awards: { hash: '#/palmares', title: t('Palmarès'), subtitle: t('Les badges de l’équipe, mois après mois, depuis la première synchro'), filters: false },
  repositories: { hash: '#/depots', title: t('Dépôts'), subtitle: t('Chaque dépôt en un coup d’œil : son activité, sa santé, qui l’écrit') },
  projects: {
    hash: '#/projets',
    title: t('Projets'),
    subtitle: t('Les projets menés sur une branche project/…, quand ils ont commencé, avancé et été livrés'),
    searchLabel: t('Filtrer projet, personne ou dépôt'),
  },
  acs: {
    hash: '#/ac',
    title: t('Améliorations continues'),
    subtitle: t('Les AC menées sur une branche feature/… ou feat/… partie de develop : combien, à quel rythme, par qui'),
    search: false,
  },
  effort: {
    hash: '#/effort',
    title: t('Où va l’effort'),
    subtitle: t('Les PR de code de la période entre TMA, projets, AC et le reste : ce qui maintient, ce qui construit'),
    search: false,
  },
  tma: { hash: '#/tma', title: t('TMA'), subtitle: t('Les hotfix, ouverts depuis une branche hotfix/*, et qui les fait') },
  devops: { hash: '#/devops', title: t('DevOps'), subtitle: t('Mises en production, intégration continue et mises à jour de dépendances') },
  method: { hash: '#/methode', title: t('Méthode'), subtitle: t('Les règles communes : chaque colonne est expliquée sous son tableau'), filters: false },
}

/** @type {() => string} */
// The page of the address, whatever filters follow it (model/url-state.js).
export const currentRoute = () => Object.keys(ROUTES).find((key) => ROUTES[key].hash === location.hash.split('?')[0]) ?? 'overview'
