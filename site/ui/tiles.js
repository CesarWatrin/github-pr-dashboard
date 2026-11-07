// Stat tiles: a *_TILES array of definitions, drawn with their counters and, against a range compared to, their
// change.

import { isMissing } from '../domain/math.js'
import { formatNumber, formatShare } from '../lib/format.js'
import { reportChange } from '../model/months.js'
import { COMPARED_PHRASES } from '../model/periods.js'
import { ROUTES } from '../model/routes.js'
import { state } from '../model/state.js'
import { el } from './dom.js'
import { reducedMotion } from './motion.js'

const BUMP_VISIBLE_MS = 6000
const COUNTER_ANIMATION_MS = 900

function ensureTiles(container, definitions) {
  if (container.childElementCount === 0) {
    for (const definition of definitions) {
      const tile = el(
        definition.route ? 'a' : 'div',
        definition.route ? { className: 'tile tile-link', href: ROUTES[definition.route].hash } : { className: 'tile' },
        el('span', { className: 'tile-label', textContent: definition.label }),
        el('span', { className: 'tile-value-row' }, el('span', { className: 'tile-value' }), el('span', { className: 'tile-bump' })),
      )
      tile.dataset.key = definition.key
      container.append(tile)
    }
  }

  return new Map([...container.children].map((tile) => [tile.dataset.key, tile]))
}

// "update" marks the values that grew since the last sync; "enter" rolls every value from where it was, or from zero.
// compared holds the values of the range compared to, for the tiles of a period: each tile then shows its change.
export function renderTiles(container, definitions, values, mode, compared = null) {
  const tiles = ensureTiles(container, definitions)
  for (const definition of definitions) {
    const tile = tiles.get(definition.key)
    renderTileChange(tile, definition, values[definition.key], compared)
    const valueNode = tile.querySelector('.tile-value')
    const value = values[definition.key]
    const previous = valueNode.dataset.value === undefined ? null : JSON.parse(valueNode.dataset.value)
    valueNode.dataset.value = JSON.stringify(value ?? null)

    const format = definition.format ?? formatNumber
    const integer = !definition.format
    const numbers = typeof value === 'number' && (previous === null || typeof previous === 'number')
    if (mode === 'update' && numbers && integer && previous !== null && value > previous) {
      animateCounter(valueNode, previous, value, format, integer)
      showBump(tile.querySelector('.tile-bump'), value - previous)
    } else if (mode === 'enter' && numbers && value !== previous) {
      animateCounter(valueNode, previous ?? 0, value, format, integer)
    } else {
      valueNode.textContent = format(value)
    }
  }
}

// The change of a tile against the range compared to, as on the monthly report: by how much, by how many points for
// a share, colored when the figure has a better way (better on its definition). « – » when it cannot be worked out, such
// as for the CI of a range GitHub had forgotten the runs of; nothing without a comparison, or for a tile about today
// (compare: false).
function renderTileChange(tile, definition, value, compared) {
  let node = tile.querySelector('.tile-change')
  if (!compared || definition.compare === false) {
    if (node) {
      node.hidden = true
    }

    return
  }
  if (!node) {
    node = el('span', { className: 'tile-change' })
    tile.append(node)
  }
  const previous = compared[definition.key]
  const kind = definition.format === formatShare ? 'share' : 'count'
  const change = reportChange({ kind, better: definition.better }, value, previous)
  node.hidden = false
  node.className = change ? `tile-change report-change is-${change.tone}` : 'tile-change is-missing'
  node.textContent = change ? change.text : '–'
  node.title = isMissing(previous)
    ? `Pas de chiffre ${COMPARED_PHRASES[state.compare]}`
    : `Contre ${(definition.format ?? formatNumber)(previous)} ${COMPARED_PHRASES[state.compare]}`
}

function animateCounter(node, from, to, format, integer) {
  if (reducedMotion.matches) {
    node.textContent = format(to)

    return
  }
  const animation = Symbol('counter')
  node.animation = animation
  const start = performance.now()
  const frame = (time) => {
    if (node.animation !== animation) {
      return
    }
    const progress = Math.min(1, (time - start) / COUNTER_ANIMATION_MS)
    // Ease-out quart: fast at first, settling softly on the value.
    const current = from + (to - from) * (1 - (1 - progress) ** 4)
    node.textContent = format(progress < 1 ? (integer ? Math.round(current) : current) : to)
    if (progress < 1) {
      requestAnimationFrame(frame)
    }
  }
  requestAnimationFrame(frame)
}

function showBump(node, delta) {
  node.textContent = `+${formatNumber(delta)}`
  node.classList.add('is-visible')
  clearTimeout(node.timer)
  node.timer = setTimeout(() => node.classList.remove('is-visible'), BUMP_VISIBLE_MS)
}
