// The two networks of the map page, over the period and the squad picked: who reviews whom, and who writes in which
// repository. The people who left stay out, as everywhere else.

import { getOrCreate } from '../domain/math.js'
import { reviewNetwork } from '../domain/team.js'
import { isCurrent, withoutFormer } from './people.js'
import { currentPeriod } from './selection.js'
import { stacksOf } from './team.js'

/**
 * A person or a repository of a network: its id (`person:login`, `repo:name`), and how much it weighs, the pull requests
 * of its links.
 * @typedef {{ id: string, kind: 'person' | 'repository', name: string, value: number }} MapNode
 */
/**
 * A link between two nodes, by their ids, and its weight in pull requests.
 * @typedef {{ source: string, target: string, weight: number }} MapLink
 */

// What the networks keep to stay readable: the links among the strongest few of either of their ends, and the busiest
// repositories. Their tables keep everything.
const LINKS_PER_NODE = 4
const MAX_REPOSITORIES = 30

/** @type {(login: string) => string} */
export const personId = (login) => `person:${login}`
/** @type {(repo: string) => string} */
export const repositoryId = (repo) => `repo:${repo}`

/**
 * The links among the `perNode` heaviest of their source or of their target, in their order: over a long period,
 * everyone reviews everyone once or twice, and a network of all these links is a tangle.
 * @template {MapLink} Link
 * @param {Link[]} links sorted heaviest first
 * @param {number} [perNode]
 * @returns {Link[]}
 */
export function strongestLinks(links, perNode = LINKS_PER_NODE) {
  /** @type {Map<string, number>} */
  const counts = new Map()
  /** @type {Set<Link>} */
  const kept = new Set()
  for (const link of links) {
    for (const id of [link.source, link.target]) {
      const count = counts.get(id) ?? 0
      if (count < perNode) {
        kept.add(link)
        counts.set(id, count + 1)
      }
    }
  }

  return links.filter((link) => kept.has(link))
}

/**
 * The nodes of links: each end, weighing the pull requests of its links, the heaviest first.
 * @param {MapLink[]} links
 * @param {(id: string) => Omit<MapNode, 'value'>} nodeOf
 * @returns {MapNode[]}
 */
function nodesOf(links, nodeOf) {
  /** @type {Map<string, number>} */
  const values = new Map()
  for (const link of links) {
    for (const id of [link.source, link.target]) {
      values.set(id, (values.get(id) ?? 0) + link.weight)
    }
  }

  return [...values]
    .map(([id, value]) => ({ ...nodeOf(id), value }))
    .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id))
}

// Who reviews whom: a link between two people for the code pull requests of either that the other reviewed or
// commented over the period, how many each way. A person weighs the pull requests of their links. links: all of them,
// for the table; shown: those the network draws.
export function reviewMap() {
  const { pairs } = reviewNetwork(withoutFormer(currentPeriod()))
  /** @type {Map<string, MapLink & { reviewedBySource: number, reviewedByTarget: number }>} */
  const links = new Map()
  for (const { author, reviewer, prs } of pairs) {
    const [source, target] = [personId(author), personId(reviewer)].sort()
    const link = getOrCreate(links, `${source}\n${target}`, () => ({ source, target, weight: 0, reviewedBySource: 0, reviewedByTarget: 0 }))
    link.weight += prs
    if (personId(reviewer) === source) {
      link.reviewedBySource += prs
    } else {
      link.reviewedByTarget += prs
    }
  }
  const sorted = [...links.values()].sort((a, b) => b.weight - a.weight || a.source.localeCompare(b.source) || a.target.localeCompare(b.target))

  return {
    nodes: nodesOf(sorted, (id) => ({ id, kind: 'person', name: id.slice('person:'.length) })),
    links: sorted,
    shown: strongestLinks(sorted),
  }
}

// Who writes where: a link between a person and each repository they opened code pull requests in over the period,
// for how many. A person weighs all their code pull requests, a repository those of the people still in the team.
// links: all of them, for the table; shown: those the network draws, to the MAX_REPOSITORIES busiest repositories.
export function repositoryMap() {
  /** @type {MapLink[]} */
  const links = currentPeriod()
    .authors.filter((person) => isCurrent(person.login))
    .flatMap(({ login, repos }) =>
      Object.entries(repos)
        .filter(([, stats]) => stats.code > 0)
        .map(([repo, stats]) => ({ source: personId(login), target: repositoryId(repo), weight: stats.code })),
    )
    .sort((a, b) => b.weight - a.weight || a.source.localeCompare(b.source) || a.target.localeCompare(b.target))
  const nodes = nodesOf(links, (id) =>
    id.startsWith('person:')
      ? { id, kind: 'person', name: id.slice('person:'.length) }
      : { id, kind: 'repository', name: id.slice('repo:'.length) },
  )
  const busiest = new Set(
    nodes
      .filter((node) => node.kind === 'repository')
      .slice(0, MAX_REPOSITORIES)
      .map((node) => node.id),
  )

  return { nodes, links, shown: strongestLinks(links.filter((link) => busiest.has(link.target))) }
}

// The stack of each person over the period, for the ring of their node.
export const mapStacks = () => stacksOf(currentPeriod())
