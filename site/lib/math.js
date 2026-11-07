// Sums and medians over the rows of the page.

import { median } from '../domain/math.js'

export const roundedMedian = (values) => (values.length ? Math.round(median(values)) : null)
export const sumOf = (items, key) => items.reduce((total, item) => total + item[key], 0)
