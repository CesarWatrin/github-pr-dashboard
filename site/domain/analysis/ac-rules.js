// The rules of the analysis about the AC (domain/acs.js): an improvement is meant small and quick, so the rules tell
// when those delivered within the range drag to their merge, or grow too big. They stay at the level of the team and of
// the repositories.

import { CLEAR, FEW, found, median, round, share } from './measures.js'
import { BIG_AC_SHARE, BIG_PR_LINES, MIN_ACS, MIN_REPOSITORY_ACS, SLOW_AC_HOURS, TOP_ROWS } from './thresholds.js'
/** @import { Context } from './measures.js' */
/** @typedef {import('../acs.js').Ac} Ac */

// The repositories of the AC delivered with MIN_REPOSITORY_ACS of them at least, each with its AC, the highest on a
// figure of them first (TOP_ROWS at most).
/**
 * @param {Ac[]} delivered
 * @param {(acs: Ac[]) => number} figure
 * @returns {{ repo: string, acs: number, value: number }[]}
 */
function repositoriesBy(delivered, figure) {
  /** @type {Map<string, Ac[]>} */
  const byRepo = new Map()
  for (const ac of delivered) {
    for (const repo of ac.repos) {
      byRepo.set(repo, [...(byRepo.get(repo) ?? []), ac])
    }
  }

  return [...byRepo]
    .filter(([, acs]) => acs.length >= MIN_REPOSITORY_ACS)
    .map(([repo, acs]) => ({ repo, acs: acs.length, value: figure(acs) }))
    .sort((a, b) => b.value - a.value || a.repo.localeCompare(b.repo))
    .slice(0, TOP_ROWS)
}

/** @type {(acs: Ac[]) => number} */
const medianHours = (acs) => round(/** @type {number} */ (median(acs.map((ac) => /** @type {number} */ (ac.timeToMergeHours)))))

// The AC delivered within the range take SLOW_AC_HOURS or more in median from their first pull request to their merge,
// over MIN_ACS of them at least: the repositories where they take the longest.
/** @param {Context} context */
export function slowAcsRule({ acs }) {
  const { delivered } = acs()
  if (delivered.length < MIN_ACS) {
    return FEW
  }
  const hours = medianHours(delivered)
  if (hours < SLOW_AC_HOURS) {
    return CLEAR
  }

  return found('watch', { count: delivered.length, medianHours: hours, repositories: repositoriesBy(delivered, medianHours) })
}

/** @type {(acs: Ac[]) => number} */
const bigShare = (acs) => /** @type {number} */ (share(acs.filter((ac) => ac.lines >= BIG_PR_LINES).length, acs.length))

// BIG_AC_SHARE or more of the AC delivered within the range change BIG_PR_LINES lines or more, over MIN_ACS of them at
// least: the repositories where they are the biggest.
/** @param {Context} context */
export function bigAcsRule({ acs }) {
  const { delivered } = acs()
  if (delivered.length < MIN_ACS) {
    return FEW
  }
  const big = delivered.filter((ac) => ac.lines >= BIG_PR_LINES)
  const bigPart = big.length / delivered.length
  if (bigPart < BIG_AC_SHARE) {
    return CLEAR
  }

  return found('watch', {
    count: delivered.length,
    big: big.length,
    share: round(bigPart, 3),
    medianLines: median(delivered.map((ac) => ac.lines)),
    repositories: repositoriesBy(delivered, bigShare),
  })
}
