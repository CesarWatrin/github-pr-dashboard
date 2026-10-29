const DATA_URL = 'data/stats.json'
const POLL_INTERVAL_MS = 60_000
const CLOCK_INTERVAL_MS = 30_000
const STALE_AFTER_MS = 2 * 60 * 60_000
const BUMP_VISIBLE_MS = 6000
const COUNTER_ANIMATION_MS = 900
const PERIOD_STORAGE_KEY = 'github-pr-dashboard:period'
const DEFAULT_PERIOD = '365d'
const SVG_NS = 'http://www.w3.org/2000/svg'

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
const compactFormat = new Intl.NumberFormat('fr-FR', { notation: 'compact' })
const relativeFormat = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })
const monthShortFormat = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' })
const monthLongFormat = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const dayMonthFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const dayLongFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const dateTimeFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' })
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

const formatNumber = (value) => (value === null || value === undefined ? '–' : numberFormat.format(value))
const formatPercent = (value) => (value === null ? '–' : `${value} %`)
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1)

function formatDuration(hours) {
  if (hours === null || hours === undefined) {
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

const TOTAL_TILES = [
  { key: 'opened', label: 'PR ouvertes' },
  { key: 'merged', label: 'PR de code mergées' },
  { key: 'reviewed', label: 'PR reviewées' },
  { key: 'medianTimeToMergeHours', label: 'Délai médian de merge', format: formatDuration },
  { key: 'contributors', label: 'Contributeurs' },
  { key: 'bots', label: 'PR de bots (exclues)' },
]

const AUTHOR_COLUMNS = [
  { key: 'login', label: 'Contributeur', kind: 'person' },
  { key: 'opened', label: 'PR ouvertes' },
  { key: 'code', label: 'PR de code', kind: 'bar' },
  {
    key: 'process',
    label: 'Release / intég.',
    hint: 'PR de release et de synchronisation de branches',
    value: (row) => row.release + row.integration,
    format: (row) => `${row.release} / ${row.integration}`,
  },
  { key: 'merged', label: 'Mergées' },
  {
    key: 'mergeRate',
    label: 'Taux de merge',
    hint: 'mergées / (mergées + fermées sans merge)',
    format: (row) => formatPercent(row.mergeRate),
  },
  { key: 'open', label: 'Encore ouvertes' },
  {
    key: 'medianTimeToMergeHours',
    label: 'Délai médian',
    hint: 'de la création au merge',
    format: (row) => formatDuration(row.medianTimeToMergeHours),
  },
  { key: 'medianSize', label: 'Taille médiane', hint: 'lignes ajoutées + supprimées' },
  { key: 'repos', label: 'Repos' },
]

const REVIEWER_COLUMNS = [
  { key: 'login', label: 'Reviewer', kind: 'person' },
  { key: 'reviewed', label: 'PR reviewées', kind: 'bar' },
  { key: 'approvals', label: 'Approbations' },
  { key: 'changesRequested', label: 'Changes requested' },
  { key: 'comments', label: 'Commentaires', hint: 'commentaires laissés dans les reviews' },
  { key: 'merges', label: 'Merges effectués' },
]

const $ = (selector) => document.querySelector(selector)

const state = {
  stats: null,
  period: readStoredPeriod(),
  query: '',
  sort: {
    authors: { key: 'code', direction: -1 },
    reviewers: { key: 'reviewed', direction: -1 },
  },
  previousRows: { authors: new Map(), reviewers: new Map() },
  seenEvents: null,
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
const matchesQuery = (...logins) => !state.query || logins.some((login) => login.toLowerCase().includes(state.query))
const githubUrl = (path) => `https://github.com/${path}`
const avatarUrl = (login) => githubUrl(`${encodeURIComponent(login)}.png?size=48`)

function avatar(login) {
  return el('img', { className: 'avatar', src: avatarUrl(login), alt: '', loading: 'lazy', width: 24, height: 24 })
}

// Stat tiles

function ensureTiles(container, definitions) {
  if (container.childElementCount === 0) {
    for (const definition of definitions) {
      const value = el('span', { className: 'tile-value' })
      const bump = el('span', { className: 'tile-bump' })
      const tile = el(
        'div',
        { className: 'tile' },
        el('span', { className: 'tile-label', textContent: definition.label }),
        el('span', { className: 'tile-value-row' }, value, bump),
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
  $('[data-totals-title]').textContent = capitalize(PERIOD_TITLES[state.period])
  renderTiles($('[data-totals]'), TOTAL_TILES, currentPeriod().totals, animate)
}

// Chart

function niceStep(rawStep) {
  const power = 10 ** Math.floor(Math.log10(rawStep))
  const fraction = rawStep / power
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10

  return Math.max(1, nice * power)
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

function renderChart() {
  const container = $('[data-chart]')
  const width = container.clientWidth
  if (!state.stats || width === 0) {
    return
  }
  const { series, bucket } = currentPeriod()
  $('[data-chart-title]').textContent = `PR ouvertes ${BUCKET_TITLES[bucket]}`

  const height = container.clientHeight
  const margin = { top: 24, right: 4, bottom: 28, left: 40 }
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom
  const baselineY = margin.top + innerHeight
  const maxValue = Math.max(0, ...series.map((point) => point.opened))
  const step = niceStep(Math.max(1, maxValue) / 4)
  const top = Math.max(step, Math.ceil(maxValue / step) * step)
  const yOf = (value) => baselineY - (value / top) * innerHeight
  const slot = innerWidth / series.length
  const barWidth = Math.min(24, Math.max(2, slot * 0.62))
  const labelEvery = Math.max(1, Math.ceil(series.length / Math.max(1, Math.floor(innerWidth / 64))))
  const maxIndex = series.findIndex((point) => point.opened === maxValue)
  const labelled = new Set([maxIndex, series.length - 1])

  const root = svg('svg', {
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': `PR ouvertes ${BUCKET_TITLES[bucket]}, ${PERIOD_TITLES[state.period]}`,
  })

  for (let value = step; value <= top; value += step) {
    root.append(svg('line', { class: 'gridline', x1: margin.left, x2: width - margin.right, y1: yOf(value), y2: yOf(value) }))
  }
  for (let value = 0; value <= top; value += step) {
    const tick = svg('text', { class: 'tick', x: margin.left - 8, y: yOf(value), 'text-anchor': 'end', 'dominant-baseline': 'middle' })
    tick.textContent = compactFormat.format(value)
    root.append(tick)
  }

  const bars = []
  series.forEach((point, index) => {
    const center = margin.left + slot * index + slot / 2
    const barHeight = (point.opened / top) * innerHeight
    const bar = svg('path', {
      class: point.partial ? 'bar is-partial' : 'bar',
      d: barHeight > 0 ? columnPath(center - barWidth / 2, baselineY - barHeight, barWidth, barHeight) : '',
    })
    bars.push(bar)
    root.append(bar)

    if (labelled.has(index) && point.opened > 0) {
      const valueLabel = svg('text', { class: 'value-label', x: center, y: yOf(point.opened) - 6, 'text-anchor': 'middle' })
      valueLabel.textContent = formatNumber(point.opened)
      root.append(valueLabel)
    }
    if ((series.length - 1 - index) % labelEvery === 0) {
      const axis = svg('text', { class: 'axis-label', x: center, y: baselineY + 18, 'text-anchor': 'middle' })
      axis.textContent = axisLabel(point.key, bucket)
      root.append(axis)
    }
  })
  root.append(svg('line', { class: 'baseline', x1: margin.left, x2: width - margin.right, y1: baselineY, y2: baselineY }))

  series.forEach((point, index) => {
    const hit = svg('rect', {
      class: 'hit',
      x: margin.left + slot * index,
      y: margin.top,
      width: slot,
      height: innerHeight,
      tabindex: 0,
      'aria-label': `${bucketTitle(point.key, bucket)} : ${point.opened} PR ouvertes`,
    })
    const activate = (x, y) => {
      bars[index].classList.add('is-active')
      showChartTooltip(point, bucket, x, y)
    }
    const deactivate = () => {
      bars[index].classList.remove('is-active')
      hideTooltip()
    }
    hit.addEventListener('pointermove', (event) => activate(event.clientX, event.clientY))
    hit.addEventListener('pointerleave', deactivate)
    hit.addEventListener('focus', () => {
      const box = hit.getBoundingClientRect()
      activate(box.left + box.width / 2, box.top + box.height / 2)
    })
    hit.addEventListener('blur', deactivate)
    root.append(hit)
  })

  container.replaceChildren(root)
}

function tooltipRow(value, label, keyed) {
  return el(
    'div',
    { className: 'tooltip-row' },
    el('span', { className: keyed ? 'line-key' : 'line-key is-empty' }),
    el('strong', { textContent: formatNumber(value) }),
    el('span', { textContent: label }),
  )
}

function showChartTooltip(point, bucket, x, y) {
  const tooltip = $('[data-tooltip]')
  tooltip.replaceChildren(
    el('p', { className: 'tooltip-title', textContent: bucketTitle(point.key, bucket) }),
    tooltipRow(point.opened, 'PR ouvertes', true),
    tooltipRow(point.merged, 'PR de code mergées', false),
    tooltipRow(point.reviews, 'reviews soumises', false),
  )
  if (point.partial) {
    tooltip.append(el('p', { className: 'tooltip-note', textContent: 'Période incomplète' }))
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

function renderChartTable() {
  const { series, bucket } = currentPeriod()
  const head = el(
    'tr',
    {},
    ...['Période', 'PR ouvertes', 'PR de code mergées', 'Reviews'].map((label) => el('th', { scope: 'col', textContent: label })),
  )
  const rows = series.toReversed().map((point) =>
    el(
      'tr',
      {},
      el('td', { textContent: bucketTitle(point.key, bucket) + (point.partial ? ' (incomplète)' : '') }),
      el('td', { textContent: formatNumber(point.opened) }),
      el('td', { textContent: formatNumber(point.merged) }),
      el('td', { textContent: formatNumber(point.reviews) }),
    ),
  )
  $('[data-chart-table]').replaceChildren(el('table', {}, el('thead', {}, head), el('tbody', {}, ...rows)))
}

// Tables

const columnValue = (column, row) => (column.value ? column.value(row) : row[column.key])

function compareValues(a, b) {
  if (a === b) {
    return 0
  }
  if (a === null || a === undefined) {
    return 1
  }
  if (b === null || b === undefined) {
    return -1
  }

  return typeof a === 'string' ? a.localeCompare(b) : a - b
}

function personLink(login) {
  return el(
    'a',
    { href: githubUrl(encodeURIComponent(login)), target: '_blank', rel: 'noopener' },
    avatar(login),
    document.createTextNode(login),
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

  return el('td', { className: text === '–' ? 'muted' : '', textContent: text })
}

function renderTable(name, columns, rows, highlight) {
  const sort = state.sort[name]
  const sortColumn = columns.find((column) => column.key === sort.key)
  const barColumn = columns.find((column) => column.kind === 'bar')
  const barMax = Math.max(1, ...rows.map((row) => row[barColumn.key]))
  const previous = state.previousRows[name]
  const visible = rows
    .filter((row) => matchesQuery(row.login))
    .sort((a, b) => {
      const order = compareValues(columnValue(sortColumn, a), columnValue(sortColumn, b))

      return order === 0 ? a.login.localeCompare(b.login) : order * sort.direction
    })

  const headCells = columns.map((column) => {
    const active = column.key === sort.key
    const button = el(
      'button',
      { type: 'button', title: column.hint ?? '' },
      document.createTextNode(column.label),
      el('span', { className: 'sort-icon', textContent: active ? (sort.direction < 0 ? '↓' : '↑') : '' }),
    )
    button.addEventListener('click', () => {
      state.sort[name] = {
        key: column.key,
        direction: active ? -sort.direction : column.kind === 'person' ? 1 : -1,
      }
      renderTables(false)
    })
    const cell = el('th', { scope: 'col' }, button)
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
  renderTable('authors', AUTHOR_COLUMNS, period.authors, highlight)
  renderTable('reviewers', REVIEWER_COLUMNS, period.reviewers, highlight)
}

// Activity feed

const eventId = (event) => `${event.type}:${event.repo}#${event.number}:${event.actor}:${event.at}`

function renderFeed(highlight) {
  const { events, org } = state.stats
  const previous = state.seenEvents
  const items = events
    .filter((event) => matchesQuery(event.actor, event.author))
    .map((event) => {
      const link = el('a', {
        href: githubUrl(`${org}/${encodeURIComponent(event.repo)}/pull/${event.number}`),
        target: '_blank',
        rel: 'noopener',
        textContent: `${event.repo}#${event.number}`,
      })
      const text = el(
        'p',
        { className: 'feed-text' },
        el('strong', { textContent: event.actor }),
        document.createTextNode(` ${EVENT_VERBS[event.type]} `),
        link,
      )
      if (event.type !== 'opened' && event.author !== event.actor) {
        text.append(document.createTextNode(` de ${event.author}`))
      }
      const time = el('time', { className: 'feed-time', dateTime: event.at, title: dateTimeFormat.format(new Date(event.at)) })
      time.dataset.relative = event.at
      time.textContent = formatRelative(event.at)

      const item = el('li', { className: 'feed-item' }, avatar(event.actor), el('div', {}, text, time))
      if (highlight && previous && !previous.has(eventId(event))) {
        item.classList.add('is-new')
      }

      return item
    })
  if (items.length === 0) {
    items.push(el('li', { className: 'feed-empty', textContent: 'Aucune activité' }))
  }

  state.seenEvents = new Set(events.map(eventId))
  $('[data-feed]').replaceChildren(...items)
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
  renderChart()
  renderChartTable()
  renderTables(animate)
  renderFeed(animate)
}

async function refresh() {
  try {
    const response = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const stats = await response.json()
    state.fetchFailed = false
    if (stats.generatedAt !== state.stats?.generatedAt) {
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
  } catch {
    state.fetchFailed = true
    if (!state.stats) {
      $('[data-empty]').hidden = false
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
  }
})

let resizeFrame = 0
new ResizeObserver(() => {
  cancelAnimationFrame(resizeFrame)
  resizeFrame = requestAnimationFrame(renderChart)
}).observe($('[data-chart]'))

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    refresh()
  }
})

renderPeriodSelector()
refresh()
setInterval(refresh, POLL_INTERVAL_MS)
setInterval(refreshClock, CLOCK_INTERVAL_MS)
