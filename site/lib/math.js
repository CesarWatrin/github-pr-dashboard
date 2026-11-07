// Sums and medians over the rows of the page.

import { median } from '../domain/math.js'

/** @type {(values: number[]) => number | null} */
export const roundedMedian = (values) => (values.length ? Math.round(/** @type {number} */ (median(values))) : null)
/**
 * The sum of one numeric field over items.
 * @template {string} Key
 * @param {Record<Key, number>[]} items
 * @param {Key} key
 * @returns {number}
 */
export const sumOf = (items, key) => items.reduce((total, item) => total + item[key], 0)
