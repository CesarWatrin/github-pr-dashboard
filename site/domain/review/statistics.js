// The statistics of the annual review: how sure a monthly average is (a bootstrap over the months), whether people
// differ more than chance would make them (Kruskal-Wallis), how much of the month-to-month spread comes from the person
// (intraclass correlation), and ranks as shares of a group. Seeded: the same figures always give the same results.

// A small seeded generator (mulberry32), in [0, 1).
/** @param {number} seed */
export function seededRandom(seed) {
  let state = seed >>> 0

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)

    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

/** @param {number[]} values */
export const mean = (values) => (values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0)

// The 95 % interval of the mean of values, drawing them again with replacement: an average that only holds by one or two
// odd months gets a wide interval.
/**
 * @param {number[]} values
 * @param {{ draws?: number, seed?: number }} [options]
 * @returns {[number, number]}
 */
export function bootstrapInterval(values, { draws = 2000, seed = 1 } = {}) {
  if (values.length < 2) {
    return [mean(values), mean(values)]
  }
  const random = seededRandom(seed)
  const means = []
  for (let draw = 0; draw < draws; draw++) {
    let total = 0
    for (let index = 0; index < values.length; index++) {
      total += values[Math.floor(random() * values.length)]
    }
    means.push(total / values.length)
  }
  means.sort((a, b) => a - b)

  return [means[Math.floor(draws * 0.025)], means[Math.ceil(draws * 0.975) - 1]]
}

/** @param {number} x */
function logGamma(x) {
  const coefficients = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]
  let y = x
  let series = 1.000000000190015
  for (const coefficient of coefficients) {
    series += coefficient / ++y
  }
  const tmp = x + 5.5

  return -(tmp - (x + 0.5) * Math.log(tmp)) + Math.log((2.5066282746310005 * series) / x)
}

// The chance that a chi-square of `degrees` degrees of freedom exceeds x: the incomplete gamma function, by its series
// below a + 1, else by its continued fraction.
/**
 * @param {number} x
 * @param {number} degrees
 */
export function chiSquareSurvival(x, degrees) {
  if (x <= 0) {
    return 1
  }
  const a = degrees / 2
  const z = x / 2
  const front = Math.exp(-z + a * Math.log(z) - logGamma(a))
  if (z < a + 1) {
    let term = 1 / a
    let total = term
    for (let n = 1; n < 500; n++) {
      term *= z / (a + n)
      total += term
    }

    return Math.max(0, 1 - total * front)
  }
  let b = z + 1 - a
  let c = 1e300
  let d = 1 / b
  let h = d
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a)
    b += 2
    d = 1 / (an * d + b)
    c = b + an / c
    h *= d * c
  }

  return Math.min(1, front * h)
}

// Whether groups differ more than chance would make them, on ranks: H, its p-value and its effect (epsilon squared, 0
// for none, 1 when the group explains every rank).
/** @param {number[][]} groups */
export function kruskalWallis(groups) {
  const values = groups.flatMap((group, index) => group.map((value) => ({ value, index }))).sort((a, b) => a.value - b.value)
  const n = values.length
  const rankSums = groups.map(() => 0)
  for (let start = 0; start < n; ) {
    let end = start
    while (end + 1 < n && values[end + 1].value === values[start].value) {
      end++
    }
    for (let index = start; index <= end; index++) {
      rankSums[values[index].index] += (start + end) / 2 + 1
    }
    start = end + 1
  }
  const h = (12 / (n * (n + 1))) * groups.reduce((total, group, index) => total + rankSums[index] ** 2 / group.length, 0) - 3 * (n + 1)
  const degrees = groups.length - 1

  return { h, degrees, n, p: chiSquareSurvival(h, degrees), effect: n > 1 ? h / (n - 1) : 0 }
}

// The share of the spread of the values that comes from the group they belong to (one-way intraclass correlation): 0
// when the group tells nothing, 1 when it tells everything.
/** @param {number[][]} groups */
export function intraclassCorrelation(groups) {
  const all = groups.flat()
  const k = groups.length
  const grand = mean(all)
  const n0 = (all.length - groups.reduce((total, group) => total + group.length ** 2, 0) / all.length) / (k - 1)
  const between = groups.reduce((total, group) => total + group.length * (mean(group) - grand) ** 2, 0) / (k - 1)
  const within =
    groups.reduce((total, group) => total + group.reduce((sum, value) => sum + (value - mean(group)) ** 2, 0), 0) / (all.length - k)
  const denominator = between + (n0 - 1) * within

  return denominator > 0 ? Math.max(0, (between - within) / denominator) : 0
}

// Each value's rank among them, from 0 (the lowest) to 1 (the highest), ties sharing the middle of their ranks; 0.5 for
// a value alone or missing.
/**
 * @param {(number | null)[]} values
 * @returns {number[]}
 */
export function rankShares(values) {
  const known = /** @type {number[]} */ (values.filter((value) => typeof value === 'number'))
  if (known.length < 2) {
    return values.map(() => 0.5)
  }

  return values.map((value) => {
    if (typeof value !== 'number') {
      return 0.5
    }
    const below = known.filter((other) => other < value).length
    const tied = known.filter((other) => other === value).length

    return (below + (tied - 1) / 2) / (known.length - 1)
  })
}
