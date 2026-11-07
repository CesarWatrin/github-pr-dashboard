// Collaboration: who reviews whom (the matrix, or its most frequent pairs on a narrow screen).

import { formatNumber, formatShare, plural } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { displayName } from '../model/people.js'
import { matchesQuery, periodTitle } from '../model/selection.js'
import { state } from '../model/state.js'
import { currentNetwork } from '../model/team.js'
import { dataTable } from '../ui/charts/data-table.js'
import { heatmapChart } from '../ui/charts/heatmap-chart.js'
import { $, el } from '../ui/dom.js'
import { avatar, personLink } from '../ui/links.js'
import { renderList } from '../ui/list.js'

// The review matrix gives a row or a column to the authors and reviewers who weigh at least MATRIX_MIN_SHARE of the
// reviews of the period (stated in the card note of index.html), as many as its width holds with cells wide enough for
// their figures, the others grouped together. It gives way to a list of the most frequent pairs when its card is too
// narrow for it. Its labels take about MATRIX_LABELS_WIDTH: the names of the rows, and the tilted last column name.
const MATRIX_MIN_SHARE = 0.02
const MATRIX_MIN_CELL = 26
const MATRIX_LABELS_WIDTH = 200
const MATRIX_MIN_WIDTH = 560
const TOP_PAIRS = 20

export const COLLABORATION_COLUMNS = [
  { key: 'login', label: t('Auteur'), kind: 'person', value: (row) => displayName(row.login) },
  { key: 'code', label: t('PR de code'), hint: t('PR de code ouvertes sur la période.') },
  {
    key: 'reviewed',
    label: t('PR relues'),
    hint: t('Parmi ces PR, celles qui ont reçu au moins une review ou un commentaire d’une autre personne, à n’importe quelle date.'),
  },
  {
    key: 'reviewers',
    label: t('Relecteurs distincts'),
    hint: t('Personnes différentes intervenues sur ces PR relues. Peu de relecteurs : le code de la personne circule peu.'),
  },
  {
    key: 'topReviewer',
    label: t('Relecteur principal'),
    kind: 'text',
    value: (row) => (row.topReviewer ? displayName(row.topReviewer) : null),
    cell: (row) =>
      row.topReviewer
        ? el('td', { className: 'person-secondary' }, personLink(row.topReviewer))
        : el('td', { className: 'text muted', textContent: '–' }),
    hint: t('La personne intervenue sur le plus de PR relues de l’auteur.'),
  },
  {
    key: 'topReviewerShare',
    label: t('Dépendance au relecteur principal'),
    kind: 'bar',
    format: (row) => formatShare(row.topReviewerShare),
    hint: t('Part des PR relues de l’auteur sur lesquelles le relecteur principal est intervenu. Proche de 100 % : un binôme figé, et un savoir qui ne circule qu’entre deux personnes.'),
  },
]

const OTHERS = '\u0000others'
const personName = (login, count) => (login === OTHERS ? t('{count} autres personnes', { count: formatNumber(count) }) : displayName(login))

// The first people of a list sorted busiest first, at most `limit` entries: the people past the first `shown` ones, or
// past the limit, are grouped in a last entry.
function keepBusiest(people, limit, shown) {
  const kept = Math.min(shown, people.length <= limit ? limit : limit - 1)

  return { kept: people.slice(0, kept), others: people.slice(kept) }
}

// Rows and columns of the matrix, up to `limit` each. The people who weigh less than MATRIX_MIN_SHARE of the reviews
// join the others: their row or column would be nearly empty. A search keeps the people it finds, however few their
// reviews, with everyone they review or are reviewed by.
function matrixPeople(network, limit) {
  const found = (login) => matchesQuery(login, displayName(login))
  const side = (own, other) => {
    const people = new Map()
    let total = 0
    for (const pair of network.pairs) {
      const person = getOrCreatePerson(people, pair[own])
      person.prs += pair.prs
      person.found ||= found(pair[own]) || found(pair[other])
      total += pair.prs
    }
    const sorted = [...people]
      .filter(([, person]) => person.found)
      .sort((a, b) => b[1].prs - a[1].prs || a[0].localeCompare(b[0]))
    const busy = state.query ? sorted.length : sorted.filter(([, person]) => person.prs >= total * MATRIX_MIN_SHARE).length

    const split = keepBusiest(sorted.map(([login]) => login), limit, Math.max(1, busy))

    // Crowded: the width also leaves out people with enough reviews for a row or a column of their own.
    return { ...split, crowded: split.kept.length < busy }
  }

  return { authors: side('author', 'reviewer'), reviewers: side('reviewer', 'author') }
}

function getOrCreatePerson(people, login) {
  if (!people.has(login)) {
    people.set(login, { prs: 0, found: false })
  }

  return people.get(login)
}

// French elision: « d’Ana », « de Ben ».
const elides = (name) => /^[aeiouyàâéèêëîïôöùûü]/i.test(name)
const ofName = (name) => (elides(name) ? t('d’{name}', { name }) : t('de {name}', { name }))
// A text with nodes in it, links say: the placeholders of the text take them.
const withNodes = (text, nodes) =>
  text
    .split(/\{(\w+)\}/)
    .map((part, index) => (index % 2 ? nodes[part] : part))
    .filter((part) => part !== '')
    .map((part) => (typeof part === 'string' ? document.createTextNode(part) : part))

export function renderCollaboration() {
  const card = $('[data-collaboration-matrix-card]')
  if (!state.stats || card.clientWidth === 0) {
    return
  }
  const network = currentNetwork()
  const wide = card.clientWidth >= MATRIX_MIN_WIDTH
  const matrix = $('[data-collaboration-matrix]')
  matrix.hidden = !wide
  $('[data-collaboration-pairs]').hidden = wide
  $('[data-collaboration-matrix-sub]').textContent = wide
    ? t('PR de code ouvertes sur la période : auteurs en lignes, relecteurs en colonnes')
    : t('PR de code ouvertes sur la période : les binômes les plus fréquents')
  if (wide) {
    const limit = Math.max(2, Math.floor((matrix.clientWidth - MATRIX_LABELS_WIDTH) / MATRIX_MIN_CELL))
    const { authors, reviewers } = matrixPeople(network, limit)
    const reviewedOf = new Map(network.authors.map((row) => [row.login, row.reviewed]))
    const counts = new Map(network.pairs.map((pair) => [`${pair.author}\n${pair.reviewer}`, pair.prs]))
    const members = (side, key) => (key === OTHERS ? side.others : [key])
    const value = (row, column) =>
      members(authors, row.key).reduce(
        (total, author) =>
          total + members(reviewers, column.key).reduce((sum, reviewer) => sum + (counts.get(`${author}\n${reviewer}`) ?? 0), 0),
        0,
      )
    // The grouped entry says why its people have no row or column of their own: too few reviews, or, when the width
    // also left some out, both reasons.
    const entries = (side) => [
      ...side.kept.map((login) => ({ key: login, label: displayName(login) })),
      ...(side.others.length ? [{ key: OTHERS, label: side.crowded ? t('Autres') : t('Peu de relectures'), grouped: true }] : []),
    ]
    const minShare = formatShare(MATRIX_MIN_SHARE)
    const groupedNote = (side, where) =>
      side.crowded
        ? t('{where}, {count} personnes : celles sous {share} des relectures de la période, et celles qui ne tiennent pas dans la largeur.', {
            where,
            count: formatNumber(side.others.length),
            share: minShare,
          })
        : t('{where}, {count} personnes qui pèsent chacune moins de {share} des relectures de la période.', {
            where,
            count: formatNumber(side.others.length),
            share: minShare,
          })
    heatmapChart(matrix, {
      rows: entries(authors),
      columns: entries(reviewers),
      value,
      ariaLabel: t('PR relues par auteur et par relecteur, {period}', { period: periodTitle() }),
      tooltip: (row, column, prs) => {
        const author = personName(row.key, authors.others.length)
        const reviewer = personName(column.key, reviewers.others.length)
        const reviewed = row.key === OTHERS ? null : reviewedOf.get(row.key)

        const notes = [
          row.key === OTHERS && groupedNote(authors, t('En ligne')),
          column.key === OTHERS && groupedNote(reviewers, t('En colonne')),
        ]

        return {
          title: t(prs > 1 ? '{count} PR {of} relues par {reviewer}' : '{count} PR {of} relue par {reviewer}', {
            count: formatNumber(prs),
            of: ofName(author),
            reviewer,
          }),
          rows: reviewed ? [{ value: formatShare(prs / reviewed), label: t('des PR relues {of}', { of: ofName(author) }) }] : [],
          note: notes.filter(Boolean).join(' ') || null,
        }
      },
    })
  } else {
    renderPairs(network)
  }

  dataTable(
    $('[data-collaboration-table]'),
    [t('Auteur'), t('Relecteur'), t('PR relues')],
    network.pairs
      .filter((pair) => matchesQuery(pair.author, displayName(pair.author), pair.reviewer, displayName(pair.reviewer)))
      .map((pair) => [displayName(pair.author), displayName(pair.reviewer), formatNumber(pair.prs)]),
  )
}

// On a narrow screen, the most frequent pairs in place of the matrix.
function renderPairs(network) {
  const items = network.pairs
    .filter((pair) => matchesQuery(pair.author, displayName(pair.author), pair.reviewer, displayName(pair.reviewer)))
    .slice(0, TOP_PAIRS)
    .map((pair) =>
      el(
        'li',
        { className: 'pair-item' },
        el('span', { className: 'pair-avatars' }, avatar(pair.author), avatar(pair.reviewer)),
        el(
          'p',
          { className: 'feed-text' },
          ...withNodes(t(elides(displayName(pair.author)) ? 'PR d’{author} relues par {reviewer}' : 'PR de {author} relues par {reviewer}'), {
            author: personLink(pair.author, { withAvatar: false }),
            reviewer: personLink(pair.reviewer, { withAvatar: false }),
          }),
        ),
        el('span', { className: 'pair-count', textContent: plural(pair.prs, 'PR', 'PR') }),
      ),
    )
  renderList($('[data-collaboration-pairs]'), items, t('Aucun binôme sur la période'))
}
