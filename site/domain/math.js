// Small arithmetic of the stats: sums, medians, rates.

/**
 * @overload
 * @param {number} value
 * @param {number} [digits]
 * @returns {number}
 */
/**
 * @overload
 * @param {number | null} value
 * @param {number} [digits]
 * @returns {number | null}
 */
/**
 * @param {number | null} value
 * @param {number} [digits]
 */
export function round(value, digits = 0) {
  return value === null ? null : Number(value.toFixed(digits))
}

/**
 * @template {string} Key
 * @param {Record<Key, number>[]} rows
 * @param {Key} key
 */
export const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0)

/**
 * @param {number[]} values
 * @returns {number | null}
 */
export function median(values) {
  if (values.length === 0) {
    return null
  }
  const sorted = values.toSorted((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

// The value that this share of the values does not exceed.
/**
 * @param {number[]} values
 * @param {number} share
 * @returns {number | null}
 */
export function percentile(values, share) {
  if (values.length === 0) {
    return null
  }
  const sorted = values.toSorted((a, b) => a - b)

  return sorted[Math.max(0, Math.ceil(share * sorted.length) - 1)]
}

/**
 * @param {unknown} value
 * @returns {value is null | undefined}
 */
export const isMissing = (value) => value === null || value === undefined
/**
 * @param {number} part
 * @param {number} total
 */
export const rate = (part, total) => (total ? round(part / total, 3) : null)

/**
 * @template Key, Value
 * @param {Map<Key, Value>} map
 * @param {Key} key
 * @param {() => Value} create
 * @returns {Value}
 */
export function getOrCreate(map, key, create) {
  if (!map.has(key)) {
    map.set(key, create())
  }

  return /** @type {Value} */ (map.get(key))
}
