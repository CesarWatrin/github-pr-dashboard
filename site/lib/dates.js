// Dates of the page: a Paris day ('YYYY-MM-DD') as a Date, minutes since the epoch, chart buckets.

/** @type {(day: string) => Date} */
export const dayDate = (day) => new Date(`${day}T12:00:00Z`)

// The day of a bucket ('YYYY-MM-DD'), or the first of a month ('YYYY-MM').
/** @type {(key: string) => Date} */
export const bucketDate = (key) => new Date(`${key.length === 7 ? `${key}-01` : key}T12:00:00Z`)

/** @type {(minutes: number) => Date} */
export const minuteDate = (minutes) => new Date(minutes * 60_000)

/** @type {(minutes: number) => string} */
export const minutesIso = (minutes) => new Date(minutes * 60_000).toISOString()
