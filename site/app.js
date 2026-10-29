const DATA_URL = 'data/stats.json'
const POLL_INTERVAL_MS = 60_000
const CLOCK_INTERVAL_MS = 30_000
const STALE_AFTER_MS = 2 * 60 * 60_000
const BUMP_VISIBLE_MS = 6000
const COUNTER_ANIMATION_MS = 900
const PERIOD_STORAGE_KEY = 'github-pr-dashboard:period'
const RELOAD_STORAGE_KEY = 'github-pr-dashboard:reloaded-build'
const DEFAULT_PERIOD = '365d'
const TOP_REPOSITORIES = 12
const SVG_NS = 'http://www.w3.org/2000/svg'
const CHART_FONT = '12px system-ui, -apple-system, "Segoe UI", sans-serif'

// Stamped with the commit by the deploy workflow; the placeholder stays when the site is served locally.
const PAGE_BUILD = document.querySelector('meta[name="build"]')?.content.replace('__BUILD__', '') || null

const PERIOD_TITLES = { '30d': '30 derniers jours', '90d': '90 derniers jours', '365d': '12 derniers mois' }
const BUCKET_TITLES = { day: 'par jour', week: 'par semaine', month: 'par mois' }

const EVENT_VERBS = {
  opened: 'a ouvert',
  merged: 'a mergé',
  approved: 'a approuvé',
  changes_requested: 'a demandé des changements sur',
  commented: 'a commenté',
}

const numberFormat = new Intl.NumberFormat('fr-FR')
const decimalFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })
const compactFormat = new Intl.NumberFormat('fr-FR', { notation: 'compact' })
const relativeFormat = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })
const monthShortFormat = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' })
const monthLongFormat = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const dayMonthFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const dayLongFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const dateTimeFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' })
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

const isMissing = (value) => value === null || value === undefined
const formatNumber = (value) => (isMissing(value) ? '–' : numberFormat.format(value))
const formatDecimal = (value) => (isMissing(value) ? '–' : decimalFormat.format(value))
const formatPercent = (value) => (isMissing(value) ? '–' : `${value} %`)
const formatShare = (value) => (isMissing(value) ? '–' : `${Math.round(value * 100)} %`)
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1)

function formatDuration(hours) {
  if (isMissing(hours)) {
    return '–'
  }
  if (hours < 1) {
    return `${Math.round(hours * 60)} min`
  }
  if (hours < 48) {
    return `${numberFormat.format(hours < 10 ? Math.round(hours * 10) / 10 : Math.round(hours))} h`
  }

  return `${numberFormat.format(Math.round(hours / 2.4) / 10)} j`
}

function formatRelative(iso) {
  const seconds = (Date.parse(iso) - Date.now()) / 1000
  const elapsed = Math.abs(seconds)
  if (elapsed < 60) {
    return 'à l’instant'
  }
  if (elapsed < 3600) {
    return relativeFormat.format(Math.round(seconds / 60), 'minute')
  }
  if (elapsed < 86_400) {
    return relativeFormat.format(Math.round(seconds / 3600), 'hour')
  }

  return relativeFormat.format(Math.round(seconds / 86_400), 'day')
}

const TODAY_TILES = [
  { key: 'opened', label: 'PR ouvertes' },
  { key: 'merged', label: 'PR mergées' },
  { key: 'reviews', label: 'Reviews soumises' },
]

const DELIVERY_TILES = [
  { key: 'opened', label: 'PR ouvertes' },
  { key: 'merged', label: 'PR de code mergées' },
  { key: 'medianTimeToMergeHours', label: 'Délai médian de merge', format: formatDuration },
  { key: 'releases', label: 'Mises en production' },
  { key: 'hotfixShare', label: 'Part de hotfix', format: formatShare },
]

const REVIEW_TILES = [
  { key: 'reviewed', label: 'PR relues' },
  { key: 'commentsPerPr', label: 'Commentaires par PR relue', format: formatDecimal },
  { key: 'silentApprovalRate', label: 'Approb. sans commentaire', format: formatShare },
  { key: 'unreviewedShare', label: 'Mergées sans review', format: formatShare },
]

const AUTHOR_COLUMNS = [
  { key: 'login', label: 'Contributeur', kind: 'person', value: (row) => displayName(row.login) },
  { key: 'code', label: 'PR de code', kind: 'bar' },
  {
    key: 'process',
    label: 'Release / intég.',
    value: (row) => row.release + row.integration,
    format: (row) => `${row.release} / ${row.integration}`,
  },
  { key: 'mergeRate', label: 'Taux de merge', format: (row) => formatPercent(row.mergeRate) },
  { key: 'unreviewedRate', label: 'Mergées sans review', format: (row) => formatShare(row.unreviewedRate) },
  {
    key: 'medianTimeToFirstReviewHours',
    label: 'Attente 1re review',
    format: (row) => formatDuration(row.medianTimeToFirstReviewHours),
  },
  { key: 'medianTimeToMergeHours', label: 'Délai de merge', format: (row) => formatDuration(row.medianTimeToMergeHours) },
  { key: 'medianSize', label: 'Taille médiane' },
]

const REVIEWER_COLUMNS = [
  { key: 'login', label: 'Relecteur', kind: 'person', value: (row) => displayName(row.login) },
  { key: 'prs', label: 'PR relues', kind: 'bar' },
  { key: 'commentsPerPr', label: 'Comment. / PR', format: (row) => formatDecimal(row.commentsPerPr) },
  { key: 'silentApprovalRate', label: 'Approb. sans comment.', format: (row) => formatShare(row.silentApprovalRate) },
  { key: 'changesRequested', label: 'Changements demandés' },
  { key: 'medianSize', label: 'Taille médiane' },
  { key: 'merges', label: 'Merges effectués' },
  {
    key: 'topRepos',
    label: 'Principaux dépôts',
    kind: 'text',
    value: (row) => row.topRepos[0]?.[0] ?? '',
    format: (row) => row.topRepos.map(([repo, count]) => `${repo} (${count})`).join(', ') || '–',
  },
]

// One label per size bucket sent by the sync script, smallest first.
const SIZE_LABELS = ['< 10', '10 à 100', '100 à 500', '500 à 1 000', '> 1 000']

const ACTIVITY_SERIES = [
  { label: 'PR ouvertes', color: 'var(--series-1)', value: (point) => point.opened },
  { label: 'commentaires de review', color: 'var(--series-2)', value: (point) => point.comments },
]

const MINI_CHARTS = [
  { key: 'prs', title: 'PR relues', value: (point) => point.prs },
  {
    key: 'ratio',
    title: 'Commentaires par PR relue',
    decimals: true,
    value: (point) => (point.prs ? point.comments / point.prs : null),
    extraRows: (point) => [
      { label: 'PR relues', value: formatNumber(point.prs) },
      { label: 'commentaires', value: formatNumber(point.comments) },
    ],
  },
]

const $ = (selector) => document.querySelector(selector)

const state = {
  stats: null,
  period: readStoredPeriod(),
  query: '',
  person: null,
  sort: {
    authors: { key: 'code', direction: -1 },
    reviewers: { key: 'prs', direction: -1 },
  },
  previousRows: { authors: new Map(), reviewers: new Map() },
  seenEvents: null,
  seenWaiting: null,
  fetchFailed: false,
}

function readStoredPeriod() {
  try {
    return localStorage.getItem(PERIOD_STORAGE_KEY) ?? DEFAULT_PERIOD
  } catch {
    return DEFAULT_PERIOD
  }
}

function storePeriod(period) {
  try {
    localStorage.setItem(PERIOD_STORAGE_KEY, period)
  } catch {
    // Storage can be unavailable (private browsing): the period is simply not remembered.
  }
}

function el(tag, properties = {}, ...children) {
  const node = document.createElement(tag)
  Object.assign(node, properties)
  node.append(...children)

  return node
}

function svg(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, value)
  }

  return node
}

const currentPeriod = () => state.stats.periods[state.period]
const displayName = (login) => state.stats?.people?.[login] ?? login
const matchesQuery = (...texts) => !state.query || texts.some((text) => text.toLowerCase().includes(state.query))
const githubUrl = (path) => `https://github.com/${path}`
const avatarUrl = (login) => githubUrl(`${encodeURIComponent(login)}.png?size=48`)

function avatar(login) {
  return el('img', { className: 'avatar', src: avatarUrl(login), alt: '', loading: 'lazy', width: 24, height: 24 })
}

const measureContext = document.createElement('canvas').getContext('2d')

function measureText(text) {
  measureContext.font = CHART_FONT

  return measureContext.measureText(text).width
}

function truncateText(text, maxWidth) {
  if (measureText(text) <= maxWidth) {
    return text
  }
  let truncated = text
  while (truncated.length > 1 && measureText(`${truncated}…`) > maxWidth) {
    truncated = truncated.slice(0, -1)
  }

  return `${truncated}…`
}

// Stat tiles

function ensureTiles(container, definitions) {
  if (container.childElementCount === 0) {
    for (const definition of definitions) {
      const tile = el(
        'div',
        { className: 'tile' },
        el('span', { className: 'tile-label', textContent: definition.label }),
        el('span', { className: 'tile-value-row' }, el('span', { className: 'tile-value' }), el('span', { className: 'tile-bump' })),
      )
      tile.dataset.key = definition.key
      container.append(tile)
    }
  }

  return new Map([...container.children].map((tile) => [tile.dataset.key, tile]))
}

function renderTiles(container, definitions, values, animate) {
  const tiles = ensureTiles(container, definitions)
  for (const definition of definitions) {
    const tile = tiles.get(definition.key)
    const valueNode = tile.querySelector('.tile-value')
    const value = values[definition.key]
    const previous = valueNode.dataset.value === undefined ? null : JSON.parse(valueNode.dataset.value)
    valueNode.dataset.value = JSON.stringify(value ?? null)

    const format = definition.format ?? formatNumber
    const increased = animate && typeof previous === 'number' && typeof value === 'number' && value > previous
    if (increased && !definition.format) {
      animateCounter(valueNode, previous, value)
      showBump(tile.querySelector('.tile-bump'), value - previous)
    } else {
      valueNode.textContent = format(value)
    }
  }
}

function animateCounter(node, from, to) {
  if (reducedMotion.matches) {
    node.textContent = formatNumber(to)

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
    const eased = 1 - (1 - progress) ** 3
    node.textContent = formatNumber(Math.round(from + (to - from) * eased))
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

function renderToday(animate) {
  const { today, timezone } = state.stats
  const currentDay = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
  $('[data-today-title]').textContent =
    today.date === currentDay ? 'Aujourd’hui' : `Le ${dayLongFormat.format(new Date(`${today.date}T12:00:00Z`))}`
  renderTiles($('[data-today]'), TODAY_TILES, today, animate)
}

function renderTotals(animate) {
  const { totals } = currentPeriod()
  $('[data-totals-title]').textContent = capitalize(PERIOD_TITLES[state.period])
  renderTiles($('[data-totals-delivery]'), DELIVERY_TILES, totals, animate)
  renderTiles($('[data-totals-review]'), REVIEW_TILES, totals, animate)
}

// Tooltip

function showTooltip({ title, rows, note }, x, y) {
  const tooltip = $('[data-tooltip]')
  tooltip.replaceChildren(el('p', { className: 'tooltip-title', textContent: title }))
  for (const row of rows) {
    const key = el('span', { className: 'line-key' })
    if (row.color) {
      key.style.background = row.color
    } else {
      key.classList.add('is-empty')
    }
    tooltip.append(
      el('div', { className: 'tooltip-row' }, key, el('strong', { textContent: row.value }), el('span', { textContent: row.label })),
    )
  }
  if (note) {
    tooltip.append(el('p', { className: 'tooltip-note', textContent: note }))
  }
  tooltip.hidden = false

  const box = tooltip.getBoundingClientRect()
  const left = Math.min(Math.max(8, x + 14), window.innerWidth - box.width - 8)
  const top = y - box.height - 14 < 8 ? y + 18 : y - box.height - 14
  tooltip.style.left = `${left}px`
  tooltip.style.top = `${top}px`
}

function hideTooltip() {
  $('[data-tooltip]').hidden = true
}

// Hover and keyboard focus show the same tooltip.
function bindTooltip(target, onActivate, onDeactivate) {
  target.addEventListener('pointermove', (event) => onActivate(event.clientX, event.clientY))
  target.addEventListener('pointerleave', onDeactivate)
  target.addEventListener('focus', () => {
    const box = target.getBoundingClientRect()
    onActivate(box.left + box.width / 2, box.top + box.height / 2)
  })
  target.addEventListener('blur', onDeactivate)
}

// Charts

function niceStep(rawStep, integer) {
  const power = 10 ** Math.floor(Math.log10(rawStep))
  const fraction = rawStep / power
  const nice = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power

  return integer ? Math.max(1, nice) : nice
}

// Square at the baseline, 4px rounded at the data end.
function columnPath(x, y, width, height) {
  const radius = Math.min(4, width / 2, height)

  return [
    `M${x},${y + height}`,
    `V${y + radius}`,
    `A${radius},${radius} 0 0 1 ${x + radius},${y}`,
    `H${x + width - radius}`,
    `A${radius},${radius} 0 0 1 ${x + width},${y + radius}`,
    `V${y + height}`,
    'Z',
  ].join(' ')
}

function barPath(x, y, width, height) {
  const radius = Math.min(4, height / 2, width)

  return [
    `M${x},${y}`,
    `H${x + width - radius}`,
    `A${radius},${radius} 0 0 1 ${x + width},${y + radius}`,
    `V${y + height - radius}`,
    `A${radius},${radius} 0 0 1 ${x + width - radius},${y + height}`,
    `H${x}`,
    'Z',
  ].join(' ')
}

const bucketDate = (key) => new Date(`${key.length === 7 ? `${key}-01` : key}T12:00:00Z`)

function axisLabel(key, bucket) {
  const date = bucketDate(key)
  if (bucket !== 'month') {
    return dayMonthFormat.format(date)
  }
  const month = monthShortFormat.format(date)

  return date.getUTCMonth() === 0 ? `${month} ${String(date.getUTCFullYear()).slice(2)}` : month
}

function bucketTitle(key, bucket) {
  const date = bucketDate(key)
  if (bucket === 'month') {
    return capitalize(monthLongFormat.format(date))
  }
  if (bucket === 'week') {
    return `Semaine du ${dayMonthFormat.format(date)}`
  }

  return capitalize(dayLongFormat.format(date))
}

// Columns over time buckets: one series, or several grouped side by side.
function columnChart(container, { points, bucket, series, ariaLabel, decimals = false, extraRows = () => [] }) {
  const width = container.clientWidth
  if (width === 0) {
    return
  }
  const height = container.clientHeight
  const format = decimals ? formatDecimal : formatNumber
  const margin = { top: 22, right: 4, bottom: 26, left: 8 }
  const values = points.flatMap((point) => series.map((item) => item.value(point) ?? 0))
  const maxValue = Math.max(0, ...values)
  const step = niceStep(Math.max(decimals ? 0.1 : 1, maxValue) / 4, !decimals)
  const top = Math.max(step, Math.ceil(maxValue / step - 1e-9) * step)
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, index) => index * step)
  margin.left = Math.max(...ticks.map((tick) => measureText(compactFormat.format(tick)))) + 10

  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom
  const baselineY = margin.top + innerHeight
  const yOf = (value) => baselineY - (value / top) * innerHeight
  const slot = innerWidth / points.length
  const groupWidth = Math.min(series.length * 24 + (series.length - 1) * 2, slot * 0.7)
  const barWidth = Math.max(1, (groupWidth - (series.length - 1) * 2) / series.length)
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(innerWidth / 64))))

  const root = svg('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': ariaLabel })
  for (const tick of ticks) {
    if (tick > 0) {
      root.append(svg('line', { class: 'gridline', x1: margin.left, x2: width - margin.right, y1: yOf(tick), y2: yOf(tick) }))
    }
    const label = svg('text', { class: 'tick', x: margin.left - 8, y: yOf(tick), 'text-anchor': 'end', 'dominant-baseline': 'middle' })
    label.textContent = compactFormat.format(tick)
    root.append(label)
  }

  // A single series labels its peak and its latest value; grouped series rely on the legend and tooltip.
  const labelled = new Set()
  if (series.length === 1) {
    const singleValues = points.map((point) => series[0].value(point) ?? 0)
    labelled.add(singleValues.indexOf(Math.max(...singleValues)))
    labelled.add(points.length - 1)
  }

  const groups = points.map((point, index) => {
    const group = svg('g', { class: point.partial ? 'bar-group is-partial' : 'bar-group' })
    const left = margin.left + slot * index + (slot - groupWidth) / 2
    series.forEach((item, seriesIndex) => {
      const value = item.value(point) ?? 0
      const barHeight = (value / top) * innerHeight
      if (barHeight > 0) {
        const x = left + seriesIndex * (barWidth + 2)
        group.append(svg('path', { class: 'bar', style: `fill: ${item.color}`, d: columnPath(x, baselineY - barHeight, barWidth, barHeight) }))
      }
    })
    root.append(group)

    const center = margin.left + slot * index + slot / 2
    const value = series[0].value(point)
    if (labelled.has(index) && value > 0) {
      const valueLabel = svg('text', { class: 'value-label', x: center, y: yOf(value) - 6, 'text-anchor': 'middle' })
      valueLabel.textContent = format(value)
      root.append(valueLabel)
    }
    if ((points.length - 1 - index) % labelEvery === 0) {
      const axis = svg('text', { class: 'axis-label', x: center, y: baselineY + 18, 'text-anchor': 'middle' })
      axis.textContent = axisLabel(point.key, bucket)
      root.append(axis)
    }

    return group
  })
  root.append(svg('line', { class: 'baseline', x1: margin.left, x2: width - margin.right, y1: baselineY, y2: baselineY }))

  points.forEach((point, index) => {
    const title = bucketTitle(point.key, bucket)
    const hit = svg('rect', {
      class: 'hit',
      x: margin.left + slot * index,
      y: margin.top,
      width: slot,
      height: innerHeight,
      tabindex: 0,
      'aria-label': `${title} : ${series.map((item) => `${format(item.value(point))} ${item.label}`).join(', ')}`,
    })
    bindTooltip(
      hit,
      (x, y) => {
        groups[index].classList.add('is-active')
        showTooltip(
          {
            title,
            rows: [
              ...series.map((item) => ({ color: item.color, value: format(item.value(point)), label: item.label })),
              ...extraRows(point),
            ],
            note: point.partial ? 'Période incomplète' : null,
          },
          x,
          y,
        )
      },
      () => {
        groups[index].classList.remove('is-active')
        hideTooltip()
      },
    )
    root.append(hit)
  })

  container.replaceChildren(root)
}

// Horizontal bars, one row per item, value at the tip.
function barChart(container, { rows, label, value, format, max, color, ariaLabel, tooltip }) {
  const width = container.clientWidth
  if (width === 0) {
    return
  }
  if (rows.length === 0) {
    container.replaceChildren(el('p', { className: 'chart-empty', textContent: 'Aucune donnée sur la période' }))

    return
  }
  const rowHeight = 28
  const height = rows.length * rowHeight
  const labelMax = width * 0.4
  const labelWidth = Math.min(labelMax, Math.max(...rows.map((row) => measureText(label(row)))))
  const valueWidth = Math.max(...rows.map((row) => measureText(format(value(row))))) + 8
  const start = labelWidth + 10
  const domainMax = (max ?? Math.max(...rows.map(value))) || 1
  const scale = (amount) => (Math.max(0, amount) / domainMax) * Math.max(20, width - start - valueWidth)

  const root = svg('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': ariaLabel })
  rows.forEach((row, index) => {
    const y = index * rowHeight
    const barWidth = Math.max(2, scale(value(row)))
    const group = svg('g', { class: 'bar-group' })
    const name = svg('text', { class: 'axis-label', x: labelWidth, y: y + rowHeight / 2, 'text-anchor': 'end', 'dominant-baseline': 'middle' })
    name.textContent = truncateText(label(row), labelMax)
    const amount = svg('text', { class: 'value-label', x: start + barWidth + 6, y: y + rowHeight / 2, 'dominant-baseline': 'middle' })
    amount.textContent = format(value(row))
    group.append(name, svg('path', { class: 'bar', style: `fill: ${color}`, d: barPath(start, y + 7, barWidth, rowHeight - 14) }), amount)

    const hit = svg('rect', { class: 'hit', x: 0, y, width, height: rowHeight, tabindex: 0, 'aria-label': `${label(row)} : ${format(value(row))}` })
    bindTooltip(
      hit,
      (x, pointerY) => {
        group.classList.add('is-active')
        showTooltip(tooltip(row), x, pointerY)
      },
      () => {
        group.classList.remove('is-active')
        hideTooltip()
      },
    )
    root.append(group, hit)
  })

  container.replaceChildren(root)
}

function dataTable(container, headers, rows) {
  container.replaceChildren(
    el(
      'table',
      {},
      el('thead', {}, el('tr', {}, ...headers.map((label) => el('th', { scope: 'col', textContent: label })))),
      el('tbody', {}, ...rows.map((cells) => el('tr', {}, ...cells.map((text) => el('td', { textContent: text }))))),
    ),
  )
}

function renderActivityChart() {
  const { series, bucket } = currentPeriod()
  $('[data-chart-title]').textContent = `Activité ${BUCKET_TITLES[bucket]}`
  columnChart($('[data-chart]'), {
    points: series,
    bucket,
    series: ACTIVITY_SERIES,
    ariaLabel: `PR ouvertes et commentaires de review ${BUCKET_TITLES[bucket]}, ${PERIOD_TITLES[state.period]}`,
    extraRows: (point) => [
      { label: 'PR de code mergées', value: formatNumber(point.merged) },
      { label: 'approbations', value: formatNumber(point.approvals) },
      { label: 'mises en production', value: formatNumber(point.releases) },
    ],
  })
}

function renderSizeCharts() {
  const rows = currentPeriod().sizes.map((size, index) => ({ ...size, label: SIZE_LABELS[index] }))
  const common = {
    rows,
    label: (row) => row.label,
    color: 'var(--series-1)',
    tooltip: (row) => ({
      title: `${row.label} lignes`,
      rows: [
        { label: 'PR mergées', value: formatNumber(row.prs) },
        { label: 'délai médian de merge', value: formatDuration(row.medianTimeToMergeHours) },
        { label: 'commentaires par PR', value: formatDecimal(row.commentsPerPr) },
      ],
    }),
  }
  barChart($('[data-sizes-chart="time"]'), {
    ...common,
    value: (row) => row.medianTimeToMergeHours,
    format: formatDuration,
    ariaLabel: 'Délai médian de merge selon la taille des PR',
  })
  barChart($('[data-sizes-chart="comments"]'), {
    ...common,
    value: (row) => row.commentsPerPr,
    format: formatDecimal,
    ariaLabel: 'Commentaires par PR selon la taille des PR',
  })
}

function renderRepositoriesChart() {
  const repositories = currentPeriod().repositories
  $('[data-repos-sub]').textContent = `${Math.min(TOP_REPOSITORIES, repositories.length)} premiers sur ${formatNumber(repositories.length)}`
  barChart($('[data-repos-chart]'), {
    rows: repositories.slice(0, TOP_REPOSITORIES),
    label: (row) => row.repo,
    value: (row) => row.prs,
    format: formatNumber,
    color: 'var(--series-1)',
    ariaLabel: 'PR relues par dépôt',
    tooltip: (row) => ({
      title: row.repo,
      rows: [
        { label: 'PR relues', value: formatNumber(row.prs) },
        { label: 'commentaires', value: formatNumber(row.comments) },
      ],
    }),
  })
}

function personPoints(login) {
  const { series, reviewerSeries } = currentPeriod()
  const values = reviewerSeries[login] ?? []

  return series.map((point, index) => {
    const [prs, comments] = values[index] ?? [0, 0]

    return { key: point.key, partial: point.partial, prs, comments }
  })
}

function renderMiniCharts() {
  const { bucket } = currentPeriod()
  const points = personPoints(state.person)
  for (const mini of MINI_CHARTS) {
    columnChart($(`[data-mini="${mini.key}"]`), {
      points,
      bucket,
      decimals: mini.decimals,
      series: [{ label: mini.title.toLowerCase(), color: 'var(--series-1)', value: mini.value }],
      ariaLabel: `${mini.title} ${BUCKET_TITLES[bucket]}, ${displayName(state.person)}`,
      extraRows: mini.extraRows,
    })
  }
}

function renderCharts() {
  if (!state.stats) {
    return
  }
  renderActivityChart()
  renderSizeCharts()
  renderRepositoriesChart()
  if (state.person) {
    renderMiniCharts()
  }
}

function renderChartTable() {
  const { series, bucket } = currentPeriod()
  dataTable(
    $('[data-chart-table]'),
    ['Période', 'PR ouvertes', 'Commentaires', 'PR de code mergées', 'Approbations', 'Mises en production'],
    series
      .toReversed()
      .map((point) => [
        bucketTitle(point.key, bucket) + (point.partial ? ' (incomplète)' : ''),
        formatNumber(point.opened),
        formatNumber(point.comments),
        formatNumber(point.merged),
        formatNumber(point.approvals),
        formatNumber(point.releases),
      ]),
  )
}

function renderLegend() {
  $('[data-chart-legend]').replaceChildren(
    ...ACTIVITY_SERIES.map((item) => {
      const swatch = el('span', { className: 'swatch' })
      swatch.style.background = item.color

      return el('span', {}, swatch, document.createTextNode(capitalize(item.label)))
    }),
  )
}

// Per-person evolution

function renderPersonPicker() {
  const reviewers = currentPeriod()
    .reviewers.filter((row) => row.prs > 0)
    .sort((a, b) => b.prs - a.prs)
  if (!reviewers.some((row) => row.login === state.person)) {
    state.person = reviewers[0]?.login ?? null
  }
  const picker = $('[data-person]')
  picker.replaceChildren(...reviewers.map((row) => new Option(displayName(row.login), row.login)))
  picker.value = state.person ?? ''
}

// Tables

const columnValue = (column, row) => (column.value ? column.value(row) : row[column.key])

function compareValues(a, b) {
  if (a === b) {
    return 0
  }
  if (isMissing(a)) {
    return 1
  }
  if (isMissing(b)) {
    return -1
  }

  return typeof a === 'string' ? a.localeCompare(b, 'fr') : a - b
}

function personLink(login) {
  return el(
    'a',
    { href: githubUrl(encodeURIComponent(login)), target: '_blank', rel: 'noopener', title: login },
    avatar(login),
    document.createTextNode(displayName(login)),
  )
}

function renderCell(column, row, barMax) {
  if (column.kind === 'person') {
    return el('td', { className: 'person' }, personLink(row.login))
  }
  const text = column.format ? column.format(row) : formatNumber(row[column.key])
  if (column.kind === 'bar') {
    const fill = el('span')
    fill.style.width = `${(100 * row[column.key]) / barMax}%`

    return el(
      'td',
      {},
      el('span', { className: 'bar-cell' }, el('span', { textContent: text }), el('span', { className: 'inline-bar' }, fill)),
    )
  }
  const classes = [column.kind === 'text' ? 'text' : '', text === '–' ? 'muted' : ''].filter(Boolean)

  return el('td', { className: classes.join(' '), textContent: text })
}

function renderTable(name, columns, rows, searchTexts, highlight) {
  const sort = state.sort[name]
  const sortColumn = columns.find((column) => column.key === sort.key)
  const barColumn = columns.find((column) => column.kind === 'bar')
  const barMax = Math.max(1, ...rows.map((row) => row[barColumn.key]))
  const previous = state.previousRows[name]
  const visible = rows
    .filter((row) => matchesQuery(...searchTexts(row)))
    .sort((a, b) => {
      const order = compareValues(columnValue(sortColumn, a), columnValue(sortColumn, b))

      return order === 0 ? a.login.localeCompare(b.login) : order * sort.direction
    })

  const headCells = columns.map((column) => {
    const active = column.key === sort.key
    const button = el(
      'button',
      { type: 'button' },
      document.createTextNode(column.label),
      el('span', { className: 'sort-icon', textContent: active ? (sort.direction < 0 ? '↓' : '↑') : '' }),
    )
    button.addEventListener('click', () => {
      const textual = column.kind === 'person' || column.kind === 'text'
      state.sort[name] = { key: column.key, direction: active ? -sort.direction : textual ? 1 : -1 }
      renderTables(false)
    })
    const cell = el('th', { scope: 'col', className: column.kind === 'text' ? 'text' : '' }, button)
    if (active) {
      cell.setAttribute('aria-sort', sort.direction < 0 ? 'descending' : 'ascending')
    }

    return cell
  })

  const bodyRows = visible.map((row) => {
    const tr = el('tr', {}, ...columns.map((column) => renderCell(column, row, barMax)))
    if (highlight && previous.size > 0 && previous.get(row.login) !== JSON.stringify(row)) {
      tr.classList.add('is-updated')
    }

    return tr
  })
  if (bodyRows.length === 0) {
    bodyRows.push(el('tr', {}, el('td', { colSpan: columns.length, className: 'muted', textContent: 'Aucun résultat' })))
  }

  state.previousRows[name] = new Map(rows.map((row) => [row.login, JSON.stringify(row)]))
  $(`[data-${name}]`).replaceChildren(
    el('table', {}, el('thead', {}, el('tr', {}, ...headCells)), el('tbody', {}, ...bodyRows)),
  )
}

function renderTables(highlight) {
  const period = currentPeriod()
  renderTable('authors', AUTHOR_COLUMNS, period.authors, (row) => [row.login, displayName(row.login)], highlight)
  renderTable(
    'reviewers',
    REVIEWER_COLUMNS,
    period.reviewers,
    (row) => [row.login, displayName(row.login), ...row.topRepos.map(([repo]) => repo)],
    highlight,
  )
}

// Activity feed and waiting list

const eventId = (event) => `${event.type}:${event.repo}#${event.number}:${event.actor}:${event.at}`
const waitingId = (pr) => `${pr.repo}#${pr.number}`

function pullRequestLink(repo, number) {
  return el('a', {
    href: githubUrl(`${state.stats.org}/${encodeURIComponent(repo)}/pull/${number}`),
    target: '_blank',
    rel: 'noopener',
    textContent: `${repo}#${number}`,
  })
}

function listItem(login, text, at, timePrefix = '') {
  const time = el('time', { dateTime: at, title: dateTimeFormat.format(new Date(at)), textContent: formatRelative(at) })
  time.dataset.relative = at

  return el(
    'li',
    { className: 'feed-item' },
    avatar(login),
    el('div', {}, text, el('span', { className: 'feed-time' }, document.createTextNode(timePrefix), time)),
  )
}

function renderList(container, items, emptyText) {
  container.replaceChildren(...(items.length ? items : [el('li', { className: 'feed-empty', textContent: emptyText })]))
}

function renderFeed(highlight) {
  const { events } = state.stats
  const previous = state.seenEvents
  const items = events
    .filter((event) =>
      matchesQuery(event.actor, event.author, displayName(event.actor), displayName(event.author), event.repo),
    )
    .map((event) => {
      const text = el(
        'p',
        { className: 'feed-text' },
        el('strong', { textContent: displayName(event.actor) }),
        document.createTextNode(` ${EVENT_VERBS[event.type]} `),
        pullRequestLink(event.repo, event.number),
      )
      if (event.type !== 'opened' && event.author !== event.actor) {
        text.append(document.createTextNode(` de ${displayName(event.author)}`))
      }
      const item = listItem(event.actor, text, event.at)
      if (highlight && previous && !previous.has(eventId(event))) {
        item.classList.add('is-new')
      }

      return item
    })

  state.seenEvents = new Set(events.map(eventId))
  renderList($('[data-feed]'), items, 'Aucune activité')
}

function renderWaiting(highlight) {
  const { waiting } = state.stats
  const previous = state.seenWaiting
  $('[data-waiting-title]').textContent = `PR en attente de review (${formatNumber(waiting.length)})`
  const items = waiting
    .filter((pr) => matchesQuery(pr.author, displayName(pr.author), pr.repo))
    .map((pr) => {
      const text = el(
        'p',
        { className: 'feed-text' },
        pullRequestLink(pr.repo, pr.number),
        document.createTextNode(' de '),
        el('strong', { textContent: displayName(pr.author) }),
      )
      const item = listItem(pr.author, text, pr.createdAt, 'ouverte ')
      if (highlight && previous && !previous.has(waitingId(pr))) {
        item.classList.add('is-new')
      }

      return item
    })

  state.seenWaiting = new Set(waiting.map(waitingId))
  renderList($('[data-waiting]'), items, 'Aucune PR en attente')
}

// Sync status

function renderSyncStatus() {
  const status = $('[data-sync]')
  const label = $('[data-sync-label]')
  status.classList.remove('is-live', 'is-stale', 'is-error')
  if (!state.stats) {
    status.classList.add('is-error')
    label.textContent = state.fetchFailed ? 'Données indisponibles' : 'Chargement…'

    return
  }

  const { generatedAt } = state.stats
  const stale = Date.now() - Date.parse(generatedAt) > STALE_AFTER_MS
  status.classList.add(state.fetchFailed ? 'is-error' : stale ? 'is-stale' : 'is-live')
  status.title = `Données générées le ${dateTimeFormat.format(new Date(generatedAt))}`
  label.textContent = `${state.fetchFailed ? 'Hors ligne · ' : ''}Mis à jour ${formatRelative(generatedAt)}`
}

function refreshClock() {
  renderSyncStatus()
  for (const time of document.querySelectorAll('[data-relative]')) {
    time.textContent = formatRelative(time.dataset.relative)
  }
}

// Main

function renderPeriodSelector() {
  for (const button of document.querySelectorAll('[data-period]')) {
    button.setAttribute('aria-checked', String(button.dataset.period === state.period))
  }
}

function render(animate) {
  if (!state.stats.periods[state.period]) {
    state.period = DEFAULT_PERIOD
  }
  $('[data-org]').textContent = state.stats.org
  $('[data-empty]').hidden = true
  $('[data-main]').classList.remove('is-loading')
  renderPeriodSelector()
  renderToday(animate)
  renderTotals(animate)
  renderPersonPicker()
  renderCharts()
  renderChartTable()
  renderTables(animate)
  renderFeed(animate)
  renderWaiting(animate)
}

// An open page reloads itself on a new deploy rather than running old code on new data. The URL changes
// to skip the cached page, and a build is only reloaded for once to never loop on a stale cache.
function reloadForNewBuild(build) {
  if (!PAGE_BUILD || !build || build === PAGE_BUILD) {
    return false
  }
  try {
    if (sessionStorage.getItem(RELOAD_STORAGE_KEY) === build) {
      return false
    }
    sessionStorage.setItem(RELOAD_STORAGE_KEY, build)
  } catch {
    return false
  }
  location.replace(`${location.pathname}?v=${encodeURIComponent(build)}`)

  return true
}

async function refresh() {
  let stats
  try {
    const response = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    stats = await response.json()
    state.fetchFailed = false
  } catch {
    state.fetchFailed = true
    if (!state.stats) {
      $('[data-empty]').hidden = false
    }
  }

  if (stats && !reloadForNewBuild(stats.build) && stats.generatedAt !== state.stats?.generatedAt) {
    const isUpdate = state.stats !== null
    state.stats = stats
    render(isUpdate)
    if (isUpdate) {
      const status = $('[data-sync]')
      status.classList.remove('is-pulsing')
      void status.offsetWidth
      status.classList.add('is-pulsing')
    }
  }
  renderSyncStatus()
}

for (const button of document.querySelectorAll('[data-period]')) {
  button.addEventListener('click', () => {
    if (!state.stats || button.dataset.period === state.period) {
      return
    }
    state.period = button.dataset.period
    storePeriod(state.period)
    render(false)
  })
}

$('[data-search]').addEventListener('input', (event) => {
  state.query = event.target.value.trim().toLowerCase()
  if (state.stats) {
    renderTables(false)
    renderFeed(false)
    renderWaiting(false)
  }
})

$('[data-person]').addEventListener('change', (event) => {
  state.person = event.target.value
  renderMiniCharts()
})

let resizeFrame = 0
let observedWidth = 0
new ResizeObserver(([entry]) => {
  if (entry.contentRect.width === observedWidth) {
    return
  }
  observedWidth = entry.contentRect.width
  cancelAnimationFrame(resizeFrame)
  resizeFrame = requestAnimationFrame(renderCharts)
}).observe($('[data-main]'))

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    refresh()
  }
})

renderPeriodSelector()
refresh()
setInterval(refresh, POLL_INTERVAL_MS)
setInterval(refreshClock, CLOCK_INTERVAL_MS)
renderLegend()
