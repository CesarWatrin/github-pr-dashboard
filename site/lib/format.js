// How the page writes numbers, shares, durations and dates, in French. No DOM: any layer may use it.

import { isMissing } from '../domain/math.js'
import { WORK_DAY_HOURS } from '../domain/time.js'

const numberFormat = new Intl.NumberFormat('fr-FR')
export const decimalFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })
export const compactFormat = new Intl.NumberFormat('fr-FR', { notation: 'compact' })
const relativeFormat = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })
export const monthShortFormat = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' })
export const monthLongFormat = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
export const dayMonthFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
export const dayLongFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
export const dateTimeFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' })
export const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })
export const rangeShortFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
export const rangeLongFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/** @typedef {number | null | undefined} MaybeNumber A figure, missing when null or undefined. */

/** @type {(value: MaybeNumber) => string} */
export const formatNumber = (value) => (isMissing(value) ? '–' : numberFormat.format(value))
/** @type {(value: MaybeNumber) => string} */
export const formatDecimal = (value) => (isMissing(value) ? '–' : decimalFormat.format(value))
/** @type {(value: MaybeNumber) => string} */
export const formatPercent = (value) => (isMissing(value) ? '–' : `${value} %`)
/** @type {(value: MaybeNumber) => string} */
export const formatShare = (value) => (isMissing(value) ? '–' : `${Math.round(value * 100)} %`)
// Lines of code run into the millions: rounded (12 k, 1,2 M) everywhere but in the monthly report.
/** @type {(value: MaybeNumber) => string} */
export const formatLines = (value) => (isMissing(value) ? '–' : compactFormat.format(value))
/** @type {(text: string) => string} */
export const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1)

// CI durations, in seconds: to the second under ten minutes.
/** @param {MaybeNumber} seconds */
export function formatSeconds(seconds) {
  if (isMissing(seconds)) {
    return '–'
  }
  if (seconds < 60) {
    return `${Math.round(seconds)} s`
  }
  if (seconds < 600) {
    const rounded = Math.round(seconds)

    return `${Math.floor(rounded / 60)} min ${String(rounded % 60).padStart(2, '0')}`
  }

  return formatDuration(seconds / 3600)
}

// Working time: in hours under two working days, beyond in working days of WORK_DAY_HOURS.
/** @param {MaybeNumber} hours */
export function formatDuration(hours) {
  if (isMissing(hours)) {
    return '–'
  }
  if (hours < 1) {
    return `${Math.round(hours * 60)} min`
  }
  if (hours < 2 * WORK_DAY_HOURS) {
    return `${numberFormat.format(hours < 10 ? Math.round(hours * 10) / 10 : Math.round(hours))} h`
  }

  return `${numberFormat.format(Math.round((hours / WORK_DAY_HOURS) * 10) / 10)} j`
}

/** @param {string} iso */
export function formatRelative(iso) {
  const seconds = (Date.parse(iso) - Date.now()) / 1000
  const elapsed = Math.abs(seconds)
  if (elapsed < 60) {
    return 'à l’instant'
  }
  if (elapsed < 3600) {
    return relativeFormat.format(Math.round(seconds / 60), 'minute')
  }
  if (elapsed < 86_400) {
    return relativeFormat.format(Math.round(seconds / 3600), 'hour')
  }

  return relativeFormat.format(Math.round(seconds / 86_400), 'day')
}

// One label per size bucket sent by the sync script, smallest first.
export const SIZE_LABELS = ['< 10', '10 à 100', '100 à 500', '500 à 1 000', '> 1 000']

/** @type {(month: string) => string} */
export const monthName = (month) => monthLongFormat.format(new Date(`${month}-15T12:00:00Z`))

/** @type {(count: number, singular: string, several?: string) => string} */
export const plural = (count, singular, several = `${singular}s`) => `${formatNumber(count)} ${count > 1 ? several : singular}`
