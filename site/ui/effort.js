// What the effort page and the dialogs of people and squads share of where the code effort goes (model/effort.js): the
// four kinds of work in their colors, and the bar of a dialog cut into their shares, its words under it.

import { formatShare, plural } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { el } from './dom.js'

// The kinds of work as the page shows them, maintaining first so that its share reads from the axis of every chart,
// then building (the projects, the AC), then the rest, muted.
/** @type {{ key: import('../domain/effort.js').EffortKind, label: string, color: string }[]} */
export const EFFORT_SERIES = [
  { key: 'tma', label: t('TMA'), color: 'var(--series-2)' },
  { key: 'projects', label: t('Projets'), color: 'var(--series-1)' },
  { key: 'acs', label: t('AC'), color: 'var(--series-3)' },
  { key: 'rest', label: t('Le reste'), color: 'var(--text-muted)' },
]

// The share of each kind of a person's or a squad's code pull requests, as a bar with its words under it: no tooltip,
// which would sit under the dialog. Then the share of maintaining against building, the rest aside.
/** @param {import('../domain/effort.js').EffortSummary} effort */
export function effortBar(effort) {
  const shown = EFFORT_SERIES.filter((kind) => effort.counts[kind.key] > 0)
  const words = shown.map((kind) => `${kind.label} ${formatShare(effort.shares?.[kind.key] ?? null)}`)
  const bar = el(
    'span',
    { className: 'effort-bar' },
    ...shown.map((kind) => {
      const part = el('span')
      part.style.flexGrow = String(effort.counts[kind.key])
      part.style.background = kind.color

      return part
    }),
  )
  bar.setAttribute('role', 'img')
  bar.setAttribute('aria-label', words.join(', '))

  return el(
    'div',
    { className: 'effort-line' },
    bar,
    el(
      'ul',
      { className: 'effort-legend' },
      ...shown.map((kind) => {
        const swatch = el('span', { className: 'swatch' })
        swatch.style.background = kind.color

        return el(
          'li',
          {},
          swatch,
          el('span', { textContent: kind.label }),
          el('strong', { textContent: formatShare(effort.shares?.[kind.key] ?? null) }),
          el('span', { className: 'effort-count', textContent: plural(effort.counts[kind.key], 'PR', 'PR') }),
        )
      }),
    ),
    ...(effort.runShare === null
      ? []
      : [
          el('p', {
            className: 'effort-reading',
            textContent: t('Maintenir {run} · construire {build}, le reste à part', { run: formatShare(effort.runShare), build: formatShare(effort.buildShare) }),
          }),
        ]),
  )
}
