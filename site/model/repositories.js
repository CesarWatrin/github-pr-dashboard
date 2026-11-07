// The repositories: their type (front, back, mobile, other) and technologies, and the stack of a person that follows
// from them.

import { loadedStats } from './state.js'

export const STACK_TECHNOLOGIES = 3
const MIN_STACK_TECHNOLOGY_SHARE = 0.05
// Full-stack: at least this share of the pull requests on the back end and as much on the client, web or mobile.
const FULL_STACK_MIN_SHARE = 0.3

// Repository types sent by the sync script, in the order of the stack bars. Docs, infrastructure and tooling
// repositories ("Autres") stay out of the stacks: they are neither front nor back.
/** @type {{ key: Category, label: string, color?: string }[]} */
export const CATEGORIES = [
  { key: 'front', label: 'Front', color: 'var(--series-1)' },
  { key: 'back', label: 'Back', color: 'var(--series-2)' },
  { key: 'mobile', label: 'Mobile', color: 'var(--series-3)' },
  { key: 'other', label: 'Autres' },
]
export const STACK_CATEGORIES = CATEGORIES.filter((category) => category.color)

/** @type {(repo: string) => RepositoryInfo} */
export const repoInfo = (repo) => loadedStats().repos[repo] ?? { category: 'other', technologies: [] }
/**
 * @template {{ repo: string }} Row
 * @param {Row[]} rows
 * @returns {(Row & { category: Category })[]}
 */
export const withCategory = (rows) => rows.map((row) => ({ ...row, category: repoInfo(row.repo).category }))

// Spreads amounts per repository, pull requests or lines, over the technologies of each repository, by their share of
// its code.
/**
 * @param {Iterable<[repo: string, amount: number]>} amountPerRepo
 * @returns {[technology: string, weight: number][]}
 */
export function technologyWeights(amountPerRepo) {
  const weights = new Map()
  for (const [repo, amount] of amountPerRepo) {
    const { technologies } = repoInfo(repo)
    const total = technologies.reduce((sum, [, share]) => sum + share, 0)
    for (const [name, share] of technologies) {
      weights.set(name, (weights.get(name) ?? 0) + (amount * share) / total)
    }
  }

  return [...weights].filter(([, weight]) => weight > 0).sort((a, b) => b[1] - a[1])
}

// Front, back and mobile pull requests of a person, with the technologies they involve.
/**
 * A person's stack: their pull requests per type of repository, and their technologies.
 * @typedef {{ counts: Record<string, number>, technologies: [technology: string, weight: number][] }} Stack
 */

/**
 * @param {[repo: string, prs: number][]} prsPerRepo
 * @returns {Stack}
 */
export function stackOf(prsPerRepo) {
  const counts = Object.fromEntries(STACK_CATEGORIES.map((category) => [category.key, 0]))
  const development = prsPerRepo.filter(([repo]) => repoInfo(repo).category in counts)
  for (const [repo, prs] of development) {
    counts[repoInfo(repo).category] += prs
  }

  return { counts, technologies: technologyWeights(development) }
}

/** @param {Pick<Stack, 'counts'>} stack */
export function frontShare({ counts }) {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)

  return total ? counts.front / total : null
}

// The type of a person's work: full-stack with enough of both sides, else the category of most of their pull requests.
/**
 * @param {Record<string, number>} counts
 * @returns {{ key: string, label: string } | null}
 */
export function stackType(counts) {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  if (total === 0) {
    return null
  }
  if (counts.back / total >= FULL_STACK_MIN_SHARE && (counts.front + counts.mobile) / total >= FULL_STACK_MIN_SHARE) {
    return { key: 'full-stack', label: 'full-stack' }
  }
  const parts = STACK_CATEGORIES.filter((category) => counts[category.key] > 0)
  const main = parts.reduce((best, category) => (counts[category.key] > counts[best.key] ? category : best))

  return { key: main.key, label: main.label.toLowerCase() }
}

// The main technologies of a stack, with their share of it.
/**
 * @param {[technology: string, weight: number][]} technologies
 * @returns {[technology: string, share: number][]}
 */
export function topTechnologies(technologies) {
  const total = technologies.reduce((sum, [, weight]) => sum + weight, 0)

  return technologies
    .filter(([, weight]) => weight / total >= MIN_STACK_TECHNOLOGY_SHARE)
    .slice(0, STACK_TECHNOLOGIES)
    .map(([name, weight]) => [name, weight / total])
}

/** @type {(options: [repo: string, count: number][], category: string) => string[]} */
export const reposOfCategory = (options, category) =>
  options.filter(([repo]) => repoInfo(repo).category === category).map(([repo]) => repo)
