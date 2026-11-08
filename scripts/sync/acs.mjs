// The AC (amélioration continue) of each pull request: an improvement developed on a branch feature/<name> or
// feat/<name> cut from develop, whose pull request goes back into develop, sometimes with pull requests stacked on that
// branch. Pure: the names of the branches, read from the snapshot, are all it needs, through the index of the branches
// the projects use (projects.mjs).

// A branch of an AC, feature/<name> or feat/<name>: the name of the AC is what follows.
const AC_BRANCH = /^(?:feature|feat)\/(.+)$/
// The long-lived branch an AC is cut from and comes back to.
export const AC_BASE = 'develop'

// The AC a branch is named after, null for any other branch.
/** @param {string} branch */
export const acOfBranch = (branch) => AC_BRANCH.exec(branch)?.[1] ?? null

/** @type {(repo: string, branch: string) => string} */
const branchKey = (repo, branch) => `${repo}:${branch}`

// The branch of the AC of a pull request, null for most: its own branch when it goes into develop; else, stacked on the
// branch of an AC, that branch, when a pull request of it goes into develop, at any depth. A branch going elsewhere (a
// project branch, master) was not cut from develop: it carries no AC. A cycle leads to none.
/**
 * @param {Pick<SnapshotPullRequest, 'repo' | 'head' | 'base'>} pr
 * @param {ProjectIndex} index the branches of the pull requests (projectIndex() of projects.mjs)
 * @returns {string | null}
 */
export function acOf(pr, index) {
  if (pr.base === AC_BASE) {
    return acOfBranch(pr.head) ? pr.head : null
  }
  /** @type {Set<string>} */
  const visited = new Set()
  let branch = pr.base
  while (acOfBranch(branch) && !visited.has(branch)) {
    visited.add(branch)
    const from = index.fromBranch.get(branchKey(pr.repo, branch)) ?? []
    if (from.some((other) => other.base === AC_BASE)) {
      return branch
    }
    // The branch an AC branch was itself stacked on, when it was.
    const below = from.find((other) => acOfBranch(other.base))
    if (!below) {
      return null
    }
    branch = below.base
  }

  return null
}
