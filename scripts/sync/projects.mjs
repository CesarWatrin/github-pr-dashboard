// The project of each pull request. A project is developed on a long-lived branch, project/<name>/main: its feature
// branches are cut from it and their pull requests target it, sometimes stacked on one another, and in the end the
// project branch is merged into a long-lived branch of the repository (develop, main…). Pure: the names of the
// branches, read from the snapshot, are all it needs.

// The branches every project comes back to: none of them belongs to a project, whatever targets them.
export const LONG_LIVED_BRANCHES = ['develop', 'main', 'master', 'staging']
// A branch named under a project, project/<name>/…, the project branch project/<name>/main among them. A branch named
// project/<name> alone, or projects/<name>/…, is not one.
const PROJECT_BRANCH = /^project\/([^/]+)\/./
const PROJECT_MAIN = /^project\/([^/]+)\/main$/

// The project a branch is named under, null for any other branch.
/** @param {string} branch */
export const projectOfBranch = (branch) => PROJECT_BRANCH.exec(branch)?.[1] ?? null

// Whether a pull request brings a project branch, project/<name>/main, into a long-lived branch: when it is merged, the
// project is in the code of the repository.
/** @param {Pick<SnapshotPullRequest, 'head' | 'base'>} pr */
export const isProjectMerge = (pr) => PROJECT_MAIN.test(pr.head) && LONG_LIVED_BRANCHES.includes(pr.base)

/** @type {(repo: string, branch: string) => string} */
const branchKey = (repo, branch) => `${repo}:${branch}`

// Per repository and branch, the pull requests opened from it, newest first: what a pull request stacked on that branch
// looks at. The projects of the branches are worked out as they are asked for, and kept.
/**
 * @param {Pick<SnapshotPullRequest, 'repo' | 'head' | 'base' | 'createdAt'>[]} pullRequests
 * @returns {ProjectIndex}
 */
export function projectIndex(pullRequests) {
  /** @type {ProjectIndex['fromBranch']} */
  const fromBranch = new Map()
  for (const pr of pullRequests) {
    const key = branchKey(pr.repo, pr.head)
    fromBranch.set(key, [...(fromBranch.get(key) ?? []), pr])
  }
  for (const list of fromBranch.values()) {
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  return { fromBranch, branches: new Map() }
}

// The project of a branch of a repository: the one it is named under, else that of the newest pull request opened from
// it that belongs to one, so that a pull request stacked on a feature branch of a project belongs to it too. A
// long-lived branch belongs to none. A cycle (a branch merged into one merged back into it) leads to none.
/**
 * @param {string} repo
 * @param {string} branch
 * @param {ProjectIndex} index
 * @param {Set<string>} visiting the branches being worked out, against cycles
 * @returns {string | null}
 */
function branchProject(repo, branch, index, visiting) {
  const named = projectOfBranch(branch)
  if (named || LONG_LIVED_BRANCHES.includes(branch)) {
    return named
  }
  const key = branchKey(repo, branch)
  if (index.branches.has(key)) {
    return /** @type {string | null} */ (index.branches.get(key))
  }
  if (visiting.has(key)) {
    return null
  }
  visiting.add(key)
  let project = null
  for (const pr of index.fromBranch.get(key) ?? []) {
    project = resolve(pr, index, visiting)
    if (project) {
      break
    }
  }
  visiting.delete(key)
  index.branches.set(key, project)

  return project
}

/**
 * @param {Pick<SnapshotPullRequest, 'repo' | 'head' | 'base'>} pr
 * @param {ProjectIndex} index
 * @param {Set<string>} visiting
 * @returns {string | null}
 */
function resolve(pr, index, visiting) {
  return branchProject(pr.repo, pr.base, index, visiting) ?? projectOfBranch(pr.head)
}

// The project of a pull request, null for most: that of the branch it targets first, where its code lands, named under
// the project or itself the branch of a pull request of the project (stacked pull requests), within its repository; else
// the one its own branch is named under, such as project/<name>/main merged into develop. A project of the same name in
// two repositories is one project: the page groups them by name.
/**
 * @param {Pick<SnapshotPullRequest, 'repo' | 'head' | 'base'>} pr
 * @param {ProjectIndex} index
 * @returns {string | null}
 */
export function projectOf(pr, index) {
  return resolve(pr, index, new Set())
}
