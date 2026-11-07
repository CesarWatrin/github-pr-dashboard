// The stages of the cycle of a pull request (pickup, review, merge, deploy) and their medians.

import { median } from '../domain/math.js'
import { t } from '../lib/i18n.js'

// The stages of a code pull request, in order, as cut by the period stats: the neutral color for the one that no
// longer depends on the review.
/** @typedef {'pickup' | 'review' | 'merge' | 'deploy'} Stage */

/** @type {{ key: Stage, label: string, color: string, hint: string }[]} */
export const CYCLE_STAGES = [
  {
    key: 'pickup',
    label: t('Prise en charge'),
    color: 'var(--series-1)',
    hint: t('Médiane, de l’ouverture à la première review ou au premier commentaire d’une autre personne.'),
  },
  {
    key: 'review',
    label: t('Relecture'),
    color: 'var(--series-2)',
    hint: t('Médiane, de cette première intervention à la dernière approbation avant le merge, ou au merge sans approbation.'),
  },
  { key: 'merge', label: t('Merge'), color: 'var(--series-3)', hint: t('Médiane, de la dernière approbation au merge.') },
  {
    key: 'deploy',
    label: t('Mise en prod'),
    color: 'var(--text-muted)',
    hint: t('Médiane, du merge à l’arrivée en prod, avec le déploiement suivant du dépôt.'),
  },
]
/** @type {(Stage | 'toMerge' | 'toProduction')[]} */
const CYCLE_KEYS = [...CYCLE_STAGES.map((stage) => stage.key), 'toMerge', 'toProduction']

// How many pull requests, the median of each stage over those that went through it, and the share of each stage in
// the time of the reviewed ones that reached production (timed): on average, each one weighing the same however long
// it took. Their stages follow one another from the opening to production, an approval aside.
/**
 * @param {PeriodStats['cycles']} cycles
 * @returns {Record<Stage | 'toMerge' | 'toProduction', number | null> & { prs: number, timed: number, shares: Record<Stage, number> | null }}
 */
export function cycleSummary(cycles) {
  const timed = cycles.flatMap((cycle) => {
    const total = CYCLE_STAGES.reduce((sum, stage) => sum + (cycle[stage.key] ?? 0), 0)

    return cycle.pickup !== null && cycle.deploy !== null && total > 0 ? [{ cycle, total }] : []
  })

  return {
    prs: cycles.length,
    .../** @type {Record<Stage | 'toMerge' | 'toProduction', number | null>} */ (
      Object.fromEntries(CYCLE_KEYS.map((key) => [key, median(cycles.map((cycle) => cycle[key]).filter((hours) => hours !== null))]))
    ),
    timed: timed.length,
    shares: timed.length
      ? /** @type {Record<Stage, number>} */ (
          Object.fromEntries(
            CYCLE_STAGES.map(({ key }) => [key, timed.reduce((sum, { cycle, total }) => sum + (cycle[key] ?? 0) / total, 0) / timed.length]),
          )
        )
      : null,
  }
}
