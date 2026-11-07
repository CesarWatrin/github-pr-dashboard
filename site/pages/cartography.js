// Cartographie: the team as two networks over the period, who reviews whom and who writes in which repository.

import { elides, formatNumber, plural } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { mapStacks, repositoryMap, reviewMap } from '../model/cartography.js'
import { displayName } from '../model/people.js'
import { CATEGORIES, repoInfo, STACK_CATEGORIES, stackType } from '../model/repositories.js'
import { matchesQuery, periodTitle } from '../model/selection.js'
import { squadsOf } from '../model/squads.js'
import { state } from '../model/state.js'
import { dataTable } from '../ui/charts/data-table.js'
import { forceGraph } from '../ui/charts/force-graph.js'
import { renderLegend } from '../ui/charts/legend.js'
import { $ } from '../ui/dom.js'
import { askToOpen, avatarUrl, OPEN_PERSON, OPEN_REPOSITORY } from '../ui/links.js'

// The colour of a repository type; the repositories that are neither front, back nor mobile in the muted ink.
const typeColor = (category) => CATEGORIES.find((type) => type.key === category)?.color ?? 'var(--text-muted)'
const TYPE_LEGEND = CATEGORIES.map((type) => ({ label: type.label, color: type.color ?? 'var(--text-muted)' }))

// A person: their avatar in a ring of the share of their code pull requests in front, back and mobile repositories.
function personNode(login, value, stackFor) {
  const { counts } = stackFor(login)
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)

  return {
    id: `person:${login}`,
    label: displayName(login),
    value,
    image: avatarUrl(login, 96),
    ring: total ? STACK_CATEGORIES.map((type) => ({ color: type.color, share: counts[type.key] / total })) : [],
  }
}

// What a person's tooltip says under their figures: their squads and the type of their work.
function personNote(login, stackFor) {
  const squads = squadsOf()
    .filter((squad) => squad.members.includes(login))
    .map((squad) => squad.name)
  const type = stackType(stackFor(login).counts)

  return (
    [squads.length ? t('Squad : {squads}', { squads: squads.join(', ') }) : null, type ? t('Plutôt {type}', { type: type.label }) : null]
      .filter(Boolean)
      .join(' · ') || null
  )
}

const loginOf = (id) => id.slice('person:'.length)
const reviewedBy = (author, reviewer) =>
  t(elides(author) ? 'PR d’{author} relues par {reviewer}' : 'PR de {author} relues par {reviewer}', { author, reviewer })
// The nodes the links drawn reach.
const drawnNodes = (nodes, shown) => {
  const ends = new Set(shown.flatMap((link) => [link.source, link.target]))

  return nodes.filter((node) => ends.has(node.id))
}
const found = (name) => matchesQuery(name, displayName(name))
const openNode = (node, element) =>
  node.id.startsWith('person:')
    ? askToOpen(element, OPEN_PERSON, loginOf(node.id))
    : askToOpen(element, OPEN_REPOSITORY, node.id.slice('repo:'.length))

export function renderCartography() {
  const card = $('[data-map-reviews-card]')
  if (!state.stats || card.clientWidth === 0) {
    return
  }
  const stackFor = mapStacks()
  renderReviewMap(stackFor)
  renderRepositoryMap(stackFor)
}

// Who reviews whom: people linked by the code pull requests of either that the other reviewed.
function renderReviewMap(stackFor) {
  const { nodes, links, shown } = reviewMap()
  // What a person reviewed of the others, and what the others reviewed of theirs.
  const given = (id) =>
    links.reduce((sum, link) => sum + (link.source === id ? link.reviewedBySource : link.target === id ? link.reviewedByTarget : 0), 0)
  renderLegend($('[data-map-reviews-legend]'), TYPE_LEGEND.filter((type) => type.color !== 'var(--text-muted)'))
  forceGraph($('[data-map-reviews]'), {
    nodes: drawnNodes(nodes, shown).map((node) => personNode(node.name, node.value, stackFor)),
    links: shown,
    ariaLabel: t('Réseau des reviews, {period}', { period: periodTitle() }),
    details: $('[data-map-reviews-details]'),
    hint: t('Survoler un rond ou un trait pour voir ses chiffres'),
    found: state.query ? (node) => found(loginOf(node.id)) : undefined,
    open: openNode,
    tooltip: (node) => {
      const login = loginOf(node.id)
      const reviewed = given(node.id)
      const people = links.filter((link) => link.source === node.id || link.target === node.id).length

      return {
        title: node.label,
        rows: [
          { value: formatNumber(reviewed), label: t('PR des autres relues') },
          { value: formatNumber(node.value - reviewed), label: t('de ses PR relues par les autres') },
          { value: formatNumber(people), label: people > 1 ? t('personnes en lien') : t('personne en lien') },
        ],
        note: personNote(login, stackFor),
      }
    },
    linkTooltip: (link) => {
      const [source, target] = [displayName(loginOf(link.source)), displayName(loginOf(link.target))]
      const full = links.find((other) => other.source === link.source && other.target === link.target)

      return {
        title: t('{first} et {second}', { first: source, second: target }),
        rows: [
          { value: formatNumber(full?.reviewedByTarget ?? 0), label: reviewedBy(source, target) },
          { value: formatNumber(full?.reviewedBySource ?? 0), label: reviewedBy(target, source) },
        ],
      }
    },
  })
  dataTable(
    $('[data-map-reviews-table]'),
    [t('Auteur'), t('Relecteur'), t('PR relues')],
    links.flatMap((link) => {
      const [source, target] = [displayName(loginOf(link.source)), displayName(loginOf(link.target))]

      return [
        ...(link.reviewedByTarget ? [[source, target, formatNumber(link.reviewedByTarget)]] : []),
        ...(link.reviewedBySource ? [[target, source, formatNumber(link.reviewedBySource)]] : []),
      ]
    }),
  )
}

// Who writes where: people linked to the repositories of their code pull requests, in the colour of its type.
function renderRepositoryMap(stackFor) {
  const { nodes, links, shown } = repositoryMap()
  const degree = new Map()
  for (const link of links) {
    for (const id of [link.source, link.target]) {
      degree.set(id, (degree.get(id) ?? 0) + 1)
    }
  }
  renderLegend($('[data-map-repositories-legend]'), TYPE_LEGEND)
  forceGraph($('[data-map-repositories]'), {
    nodes: drawnNodes(nodes, shown).map((node) =>
      node.kind === 'person'
        ? personNode(node.name, node.value, stackFor)
        : { id: node.id, label: node.name, value: node.value, fill: typeColor(repoInfo(node.name).category) },
    ),
    links: shown.map((link) => ({ ...link, color: typeColor(repoInfo(link.target.slice('repo:'.length)).category) })),
    ariaLabel: t('Personnes et dépôts, {period}', { period: periodTitle() }),
    details: $('[data-map-repositories-details]'),
    hint: t('Survoler un rond ou un trait pour voir ses chiffres'),
    // The repositories are the landmarks; people show their avatar, and their name once pointed at.
    labelled: (node) => node.id.startsWith('repo:'),
    found: state.query ? (node) => (node.id.startsWith('person:') ? found(loginOf(node.id)) : matchesQuery(node.label)) : undefined,
    open: openNode,
    tooltip: (node) => {
      const count = degree.get(node.id) ?? 0
      if (node.id.startsWith('person:')) {
        return {
          title: node.label,
          rows: [
            { value: formatNumber(node.value), label: t('PR de code ouvertes sur la période') },
            { value: formatNumber(count), label: count > 1 ? t('dépôts') : t('dépôt') },
          ],
          note: personNote(loginOf(node.id), stackFor),
        }
      }
      const category = CATEGORIES.find((type) => type.key === repoInfo(node.label).category)

      return {
        title: node.label,
        rows: [
          { value: formatNumber(node.value), label: t('PR de code ouvertes sur la période') },
          { value: formatNumber(count), label: count > 1 ? t('auteurs') : t('auteur') },
        ],
        note: category ? t('Dépôt {type}', { type: category.label.toLowerCase() }) : null,
      }
    },
    linkTooltip: (link) => ({
      title: t('{person} sur {repository}', { person: displayName(loginOf(link.source)), repository: link.target.slice('repo:'.length) }),
      rows: [{ value: plural(link.weight, 'PR de code', 'PR de code'), label: t('ouvertes sur la période') }],
    }),
  })
  dataTable(
    $('[data-map-repositories-table]'),
    [t('Auteur'), t('Dépôt'), t('PR de code')],
    links.map((link) => [displayName(loginOf(link.source)), link.target.slice('repo:'.length), formatNumber(link.weight)]),
  )
}
