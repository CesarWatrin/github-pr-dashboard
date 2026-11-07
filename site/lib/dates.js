// Dates of the page: a Paris day ('YYYY-MM-DD') as a Date, minutes since the epoch, chart buckets.

export const dayDate = (day) => new Date(`${day}T12:00:00Z`)

export const bucketDate = (key) => new Date(`${key.length === 7 ? `${key}-01` : key}T12:00:00Z`)

export const minuteDate = (minutes) => new Date(minutes * 60_000)

export const minutesIso = (minutes) => new Date(minutes * 60_000).toISOString()
