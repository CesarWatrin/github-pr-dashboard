// The project of each pull request, and its stage. A project is developed on a long-lived branch, project/<name>/main:
// its feature branches are cut from it and their pull requests target it, sometimes stacked on one another, and in the
// end the project branch is merged into a long-lived branch of the repository (develop, main…). A large project may go
// in stages, each on a branch of its own delivered on its own: project/<name>-2-1/main, project/<name>-step-3/main, or
// project/<name>/main-1.1. Pure: the names of the branches, read from the snapshot, are all it needs.

// The branches every project comes back to: none of them belongs to a project, whatever targets them.
export const LONG_LIVED_BRANCHES = ['develop', 'main', 'master', 'staging']
// A branch named under a project, project/<name>/…, the project branch project/<name>/main among them. A branch named
// project/<name> alone, or projects/<name>/…, is not one.
const PROJECT_BRANCH = /^project\/([^/]+)\/./
// The branch of a project that comes back into a long-lived branch: project/<name>/main, or a variant of it, named after
// a stage (main-1.1, main-pilot) or after anything else (main-v2). main-tenance is not one.
const PROJECT_MAIN = /^project\/([^/]+)\/main(?:[-_.]([^/]+))?$/
// A stage told by numbers, maybe after step-: 1, 2-1, 2.1 (written 2.1), step-3 (written 3). Four digits make a year,
// not a stage.
const NUMBERED_STAGE = /^(?:step-)?(\d{1,2}(?:[-.]\d{1,2})*)$/
// A stage told by a word, after main- (main-pilot): a single word, but one that merges another branch in or that makes
// the branch a temporary one.
const WORD_STAGE = /^[a-z]+$/i
const NOT_A_STAGE = /^(merge|sync|into|tmp|temp)$/i

// The project a branch is named under, as named, null for any other branch.
/** @param {string} branch */
export const projectOfBranch = (branch) => PROJECT_BRANCH.exec(branch)?.[1] ?? null

// Whether a pull request brings a project branch, project/<name>/main or a variant of it (main-1.1…), into a long-lived
// branch: when it is merged, the project, or one of its stages, is in the code of the repository.
/** @param {Pick<SnapshotPullRequest, 'head' | 'base'>} pr */
export const isProjectMerge = (pr) => PROJECT_MAIN.test(pr.head) && LONG_LIVED_BRANCHES.includes(pr.base)

/** @type {(text: string) => string | null} */
const numberedStage = (text) => NUMBERED_STAGE.exec(text)?.[1].replaceAll('-', '.') ?? null

// The ways a name reads as a stage of another, the shortest other first: paper-kite-2-1 as the stage 2.1 of paper-kite,
// paper-kite-step-3 as its stage 3.
/**
 * @param {string} name
 * @returns {{ base: string, stage: string }[]}
 */
function stageSplits(name) {
  /** @type {{ base: string, stage: string }[]} */
  const splits = []
  for (const { index } of name.matchAll(/-/g)) {
    const stage = numberedStage(name.slice(index + 1))
    if (stage && index > 0) {
      splits.push({ base: name.slice(0, index), stage })
    }
  }

  return splits
}

// The project of each name of the project branches, and the stage the name tells. A name that reads as a stage of
// another (stageSplits()) is that stage of the other's project when the other names a project branch too, or when
// another name is a stage of it as well: paper-kite-2 next to paper-kite, or paper-kite-1 next to paper-kite-2, but
// paper-kite-2 alone stays a project of its own.
/**
 * @param {Iterable<string>} names
 * @returns {Map<string, ProjectStage>}
 */
export function projectNames(names) {
  const all = new Set(names)
  /** @type {Map<string, number>} */
  const stagesOf = new Map()
  for (const name of all) {
    for (const { base } of stageSplits(name)) {
      stagesOf.set(base, (stagesOf.get(base) ?? 0) + 1)
    }
  }

  return new Map(
    [...all].map((name) => {
      const split = stageSplits(name).find(({ base }) => all.has(base) || (stagesOf.get(base) ?? 0) >= 2)

      return [name, split ? { project: split.base, stage: split.stage } : { project: name, stage: null }]
    }),
  )
}

/** @type {(repo: string, branch: string) => string} */
const branchKey = (repo, branch) => `${repo}:${branch}`

// Per repository and branch, the pull requests opened from it, newest first: what a pull request stacked on that branch
// looks at; the project and stage of each name of the project branches (projectNames()). The projects of the branches
// are worked out as they are asked for, and kept.
/**
 * @param {Pick<SnapshotPullRequest, 'repo' | 'head' | 'base' | 'createdAt'>[]} pullRequests
 * @returns {ProjectIndex}
 */
export function projectIndex(pullRequests) {
  /** @type {ProjectIndex['fromBranch']} */
  const fromBranch = new Map()
  /** @type {Set<string>} */
  const names = new Set()
  for (const pr of pullRequests) {
    const key = branchKey(pr.repo, pr.head)
    fromBranch.set(key, [...(fromBranch.get(key) ?? []), pr])
    for (const branch of [pr.head, pr.base]) {
      const name = projectOfBranch(branch)
      if (name) {
        names.add(name)
      }
    }
  }
  for (const list of fromBranch.values()) {
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  return { fromBranch, names: projectNames(names), branches: new Map() }
}

// The project a branch is named under and the stage its name tells, null for a branch named under none. With variant,
// for the branch a stage comes back from, the stage its variant of main tells too: main-1.1 the stage 1.1, main-pilot the
// stage pilot; one of paper-kite-2 the stage 2.1.
/**
 * @param {string} branch
 * @param {ProjectIndex} index
 * @param {boolean} variant
 * @returns {ProjectStage | null}
 */
function namedStage(branch, index, variant) {
  const name = projectOfBranch(branch)
  if (!name) {
    return null
  }
  const { project, stage } = index.names.get(name) ?? { project: name, stage: null }
  const suffix = variant ? PROJECT_MAIN.exec(branch)?.[2] : undefined
  const own = suffix ? (numberedStage(suffix) ?? (WORD_STAGE.test(suffix) && !NOT_A_STAGE.test(suffix) ? suffix : null)) : null

  return { project, stage: [stage, own].filter(Boolean).join('.') || null }
}

// The project of a branch of a repository, and its stage. A branch named under a project belongs to it; a branch of its
// main (PROJECT_MAIN) that comes back into a long-lived branch is a stage of its own, the others are of the stage their
// newest pull request lands in, else of the stage their name tells. Any other branch is of the project and the stage of
// the newest pull request opened from it that belongs to one, so that a pull request stacked on a feature branch of a
// project belongs to it too. A long-lived branch belongs to none. A cycle (a branch merged into one merged back into
// it) leads to none.
/**
 * @param {string} repo
 * @param {string} branch
 * @param {ProjectIndex} index
 * @param {Set<string>} visiting the branches being worked out, against cycles
 * @returns {ProjectStage | null}
 */
function branchStage(repo, branch, index, visiting) {
  if (LONG_LIVED_BRANCHES.includes(branch)) {
    return null
  }
  const key = branchKey(repo, branch)
  if (index.branches.has(key)) {
    return /** @type {ProjectStage | null} */ (index.branches.get(key))
  }
  if (visiting.has(key)) {
    return null
  }
  visiting.add(key)
  const from = index.fromBranch.get(key) ?? []
  const named = namedStage(branch, index, false)
  let found = null
  if (named && PROJECT_MAIN.test(branch) && from.some((pr) => LONG_LIVED_BRANCHES.includes(pr.base))) {
    found = namedStage(branch, index, true)
  } else {
    for (const pr of from) {
      const below = branchStage(repo, pr.base, index, visiting)
      if (below && (!named || below.project === named.project)) {
        found = named ? { project: named.project, stage: below.stage ?? named.stage } : below
        break
      }
    }
    found ??= named
  }
  visiting.delete(key)
  index.branches.set(key, found)

  return found
}

// The project of a pull request and its stage, null for most: those of the branch it targets first, where its code
// lands, named under the project or itself the branch of a pull request of the project (stacked pull requests), within
// its repository; else those of its own branch when named under a project, such as project/<name>/main merged into
// develop. A project of the same name in two repositories is one project: the page groups them by name.
/**
 * @param {Pick<SnapshotPullRequest, 'repo' | 'head' | 'base'>} pr
 * @param {ProjectIndex} index
 * @returns {ProjectStage | null}
 */
export function projectStageOf(pr, index) {
  const visiting = new Set()

  return branchStage(pr.repo, pr.base, index, visiting) ?? (projectOfBranch(pr.head) ? branchStage(pr.repo, pr.head, index, visiting) : null)
}

// The project of a pull request alone (projectStageOf()).
/**
 * @param {Pick<SnapshotPullRequest, 'repo' | 'head' | 'base'>} pr
 * @param {ProjectIndex} index
 * @returns {string | null}
 */
export const projectOf = (pr, index) => projectStageOf(pr, index)?.project ?? null
