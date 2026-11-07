// The periods offered by the filters, and what a period can be compared to.

import { t } from '../lib/i18n.js'

export const DEFAULT_PERIOD = '365d'
export const CUSTOM_PERIOD = 'custom'
// What the tiles of a period may be compared to (comparisonRange() of domain/comparison.js): the option of each in the filters.
export const NO_COMPARISON = 'none'
export const NO_COMPARISON_LABEL = t('Sans comparaison')
/** @type {Record<string, string>} */
export const COMPARISONS = { previous: t('Comparer à la période d’avant'), year: t('Comparer à l’an dernier') }
/** @type {Record<string, string>} */
export const COMPARED_PHRASES = { previous: t('sur la période précédente'), year: t('sur la même période l’an dernier') }

// Picked dates are shown by day up to a month, then by week up to four months, then by month.
export const DAY_BUCKET_MAX_DAYS = 31
export const WEEK_BUCKET_MAX_DAYS = 120

// Preset periods, up to the last sync. Picked dates are whole days within the synced data. The sync reads back the
// years before the last one a month at a time: a period the data does not cover yet waits for it.
/** @type {Record<string, { days: number, bucket: Bucket, title: string }>} */
export const PERIODS = {
  '30d': { days: 30, bucket: 'day', title: t('30 derniers jours') },
  '90d': { days: 90, bucket: 'week', title: t('90 derniers jours') },
  '365d': { days: 365, bucket: 'month', title: t('12 derniers mois') },
  '730d': { days: 730, bucket: 'month', title: t('24 derniers mois') },
  '1095d': { days: 1095, bucket: 'month', title: t('36 derniers mois') },
}
/** @type {Record<Bucket, string>} */
export const BUCKET_TITLES = { day: t('par jour'), week: t('par semaine'), month: t('par mois') }
