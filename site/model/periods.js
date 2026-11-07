// The periods offered by the filters, and what a period can be compared to.

export const DEFAULT_PERIOD = '365d'
export const CUSTOM_PERIOD = 'custom'
// What the tiles of a period may be compared to (comparisonRange() of domain/comparison.js): the option of each in the filters.
export const NO_COMPARISON = 'none'
export const NO_COMPARISON_LABEL = 'Sans comparaison'
export const COMPARISONS ={ previous: 'Comparer à la période d’avant', year: 'Comparer à l’an dernier' }
export const COMPARED_PHRASES = { previous: 'sur la période précédente', year: 'sur la même période l’an dernier' }

// Picked dates are shown by day up to a month, then by week up to four months, then by month.
export const DAY_BUCKET_MAX_DAYS = 31
export const WEEK_BUCKET_MAX_DAYS = 120

// Preset periods, up to the last sync. Picked dates are whole days within the synced data. The sync reads back the
// years before the last one a month at a time: a period the data does not cover yet waits for it.
export const PERIODS = {
  '30d': { days: 30, bucket: 'day', title: '30 derniers jours' },
  '90d': { days: 90, bucket: 'week', title: '90 derniers jours' },
  '365d': { days: 365, bucket: 'month', title: '12 derniers mois' },
  '730d': { days: 730, bucket: 'month', title: '24 derniers mois' },
  '1095d': { days: 1095, bucket: 'month', title: '36 derniers mois' },
}
export const BUCKET_TITLES = { day: 'par jour', week: 'par semaine', month: 'par mois' }
