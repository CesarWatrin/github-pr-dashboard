// The pages of the dashboard, one per hash, and the page shown.

// The pages whose tiles are about the period: the comparison is only offered there.
export const COMPARED_ROUTES = new Set(['overview', 'cycle', 'tma', 'devops'])

// Pages of the dashboard, one per hash: links can be shared and the browser history works. The period and the search
// apply to every page but the method; the analysis page has the period only.
/**
 * A page: its hash, its title, and the filters it leaves out (false).
 * @typedef {{ hash: string, title: string, subtitle: string, filters?: boolean, period?: boolean, search?: boolean }} Route
 */

/** @type {Record<string, Route>} */
export const ROUTES = {
  overview: { hash: '#/', title: 'Vue d’ensemble', subtitle: 'PR et reviews de toute l’équipe, et ce qui attend' },
  unblock: { hash: '#/a-debloquer', title: 'À débloquer', subtitle: 'Les PR ouvertes qui attendent quelqu’un, les plus anciennes d’abord', period: false },
  me: { hash: '#/pour-moi', title: 'Pour moi', subtitle: 'Les reviews qu’on me demande, mes PR ouvertes et celles prêtes à merger', filters: false },
  authors: { hash: '#/auteurs', title: 'Auteurs', subtitle: 'Qui livre quoi, et comment' },
  reviewers: { hash: '#/relecteurs', title: 'Relecteurs', subtitle: 'Qui relit, et avec quelle profondeur' },
  cycle: { hash: '#/cycle', title: 'Cycle de vie', subtitle: 'Où passe le temps d’une PR, de son ouverture à la prod' },
  collaboration: { hash: '#/collaboration', title: 'Collaboration', subtitle: 'Qui relit qui, et qui connaît quel dépôt' },
  team: { hash: '#/equipe', title: 'Équipe', subtitle: 'Chaque personne en un coup d’œil : ce qu’elle écrit, ce qu’elle relit' },
  squads: { hash: '#/squads', title: 'Squads', subtitle: 'Les squads classées et comparées, puis le détail de celle choisie', search: false },
  report: { hash: '#/bilan', title: 'Bilan du mois', subtitle: 'Un mois comparé au précédent et au reste de l’année', filters: false },
  trends: { hash: '#/tendances', title: 'Tendances', subtitle: 'Les indicateurs clés mois après mois, sur les mois de la période', search: false },
  analysis: { hash: '#/analyse', title: 'Analyse', subtitle: 'Ce qui ressort de la période, et des pistes pour progresser', search: false },
  awards: { hash: '#/palmares', title: 'Palmarès', subtitle: 'Les badges de l’équipe, mois après mois, depuis la première synchro', filters: false },
  repositories: { hash: '#/depots', title: 'Dépôts', subtitle: 'Chaque dépôt en un coup d’œil : son activité, sa santé, qui l’écrit' },
  tma: { hash: '#/tma', title: 'TMA', subtitle: 'Les hotfix, ouverts depuis une branche hotfix/*, et qui les fait' },
  devops: { hash: '#/devops', title: 'DevOps', subtitle: 'Mises en production, intégration continue et mises à jour de dépendances' },
  method: { hash: '#/methode', title: 'Méthode', subtitle: 'Les règles communes : chaque colonne est expliquée sous son tableau', filters: false },
}

/** @type {() => string} */
export const currentRoute = () => Object.keys(ROUTES).find((key) => ROUTES[key].hash === location.hash) ?? 'overview'
