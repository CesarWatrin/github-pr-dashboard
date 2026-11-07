// The time buckets of the charts, as labels and titles.

import { bucketDate } from '../../lib/dates.js'
import { capitalize, dayLongFormat, dayMonthFormat, monthLongFormat, monthShortFormat } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'

// A month shows its year in January, or wherever a year starts among labels that skip months (withYear).
export function axisLabel(key, bucket, withYear = false) {
  const date = bucketDate(key)
  if (bucket !== 'month') {
    return dayMonthFormat.format(date)
  }
  const month = monthShortFormat.format(date)

  return date.getUTCMonth() === 0 || withYear ? `${month} ${String(date.getUTCFullYear()).slice(2)}` : month
}

export function bucketTitle(key, bucket) {
  const date = bucketDate(key)
  if (bucket === 'month') {
    return capitalize(monthLongFormat.format(date))
  }
  if (bucket === 'week') {
    return t('Semaine du {day}', { day: dayMonthFormat.format(date) })
  }

  return capitalize(dayLongFormat.format(date))
}
