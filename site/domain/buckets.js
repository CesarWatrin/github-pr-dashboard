// The time buckets of the charts (day, week or month), in Paris days.

import { addDays, parisDay, parisMidnight } from './time.js'

/**
 * @param {string} day
 * @param {Bucket} bucket
 */
export function bucketOfDay(day, bucket) {
  if (bucket === 'day') {
    return day
  }
  if (bucket === 'month') {
    return day.slice(0, 7)
  }
  const monday = new Date(`${day}T00:00:00Z`)
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))

  return monday.toISOString().slice(0, 10)
}

// First and last day of a bucket.
/**
 * @param {string} key
 * @param {Bucket} bucket
 * @returns {[string, string]}
 */
function bucketDays(key, bucket) {
  if (bucket === 'day') {
    return [key, key]
  }
  if (bucket === 'week') {
    return [key, addDays(key, 6)]
  }
  const [year, month] = key.split('-').map(Number)

  return [`${key}-01`, new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)]
}

// Buckets of the range [start, end), each flagged partial when the range does not cover all of its days.
/**
 * @param {number} start
 * @param {number} end
 * @param {Bucket} bucket
 */
export function bucketsOf(start, end, bucket) {
  const firstDay = parisDay(start)
  const lastDay = parisDay(end - 1)
  const firstFullDay = parisMidnight(firstDay) === start ? firstDay : addDays(firstDay, 1)
  const lastFullDay = parisMidnight(addDays(lastDay, 1)) === end ? lastDay : addDays(lastDay, -1)
  /** @type {string[]} */
  const keys = []
  for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
    const key = bucketOfDay(day, bucket)
    if (keys.at(-1) !== key) {
      keys.push(key)
    }
  }

  return keys.map((key) => {
    const [from, to] = bucketDays(key, bucket)

    return { key, partial: from < firstFullDay || to > lastFullDay }
  })
}
