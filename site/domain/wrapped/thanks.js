// The thanks of the year in review of the team or of a squad (« Merci à chacun »): one anecdote for each person, the
// figure of their year they stand out on the most among the people thanked, told as what they did, never as a rank.
// Pure, no DOM.

/**
 * What an anecdote tells: pull requests merged, reviewed, comments left, lines added or deleted, projects or AC
 * delivered, hotfixes, the longest run of working days, the days with a pull request opened, the pull requests of their
 * review partner they reviewed; or, with nothing to tell, a plain thank you.
 * @typedef {'merged' | 'reviewed' | 'comments' | 'added' | 'deleted' | 'delivered' | 'acs' | 'hotfixes' | 'streak' | 'days' | 'duo' | 'year'} ThanksKind
 */

/** @typedef {{ login: string, kind: ThanksKind, value: number, other?: string }} Thanks */

// Each figure an anecdote may tell, in the order that settles a tie, and the least it tells from: a run of two days is no
// anecdote.
/** @type {[Exclude<ThanksKind, 'year'>, (person: RetroPerson) => number, number][]} */
const FIGURES = [
  ['merged', (person) => person.merged, 1],
  ['reviewed', (person) => person.reviewed, 1],
  ['delivered', (person) => person.delivered, 1],
  ['acs', (person) => person.acs, 1],
  ['hotfixes', (person) => person.hotfixes, 1],
  ['deleted', (person) => person.deleted, 1],
  ['added', (person) => person.added, 1],
  ['comments', (person) => person.comments, 1],
  ['duo', (person) => person.reviewedMost?.prs ?? 0, 1],
  ['streak', (person) => person.streak, 3],
  ['days', (person) => person.days, 1],
]

// A kind already told weighs this much less each time, so that the anecdotes vary.
const REPEAT_WEIGHT = 0.5

/** @type {(values: number[]) => number} */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/**
 * The anecdote of each person, in their order. How much a figure stands out: the person's over the median of the people
 * thanked (at least 1, so that a figure most have none of still counts). The person whose anecdote stands out the most
 * gets it first, then the next one, a kind told already weighing less each time.
 * @param {RetroPerson[]} people
 * @returns {Thanks[]}
 */
export function thanksOf(people) {
  const medians = FIGURES.map(([, value]) => Math.max(1, median(people.map(value))))
  const choices = people.map((person) =>
    FIGURES.map(([kind, value, least], index) => ({ kind, value: value(person), score: value(person) >= least ? value(person) / medians[index] : 0 })).filter(
      (choice) => choice.score > 0,
    ),
  )
  /** @type {Map<ThanksKind, number>} */
  const told = new Map()
  /** @type {(Thanks | null)[]} */
  const thanks = people.map(() => null)
  for (let round = 0; round < people.length; round++) {
    /** @type {{ index: number, option: { kind: Exclude<ThanksKind, 'year'>, value: number }, weighted: number } | null} */
    let best = null
    for (const [index, options] of choices.entries()) {
      if (thanks[index] !== null) {
        continue
      }
      for (const option of options) {
        const weighted = option.score * REPEAT_WEIGHT ** (told.get(option.kind) ?? 0)
        if (best === null || weighted > best.weighted) {
          best = { index, option, weighted }
        }
      }
    }
    if (best === null) {
      break
    }
    const { kind, value } = best.option
    const other = kind === 'duo' ? people[best.index].reviewedMost?.login : undefined
    thanks[best.index] = { login: people[best.index].login, kind, value, ...(other && { other }) }
    told.set(kind, (told.get(kind) ?? 0) + 1)
  }

  return thanks.map((anecdote, index) => anecdote ?? { login: people[index].login, kind: 'year', value: 0 })
}
