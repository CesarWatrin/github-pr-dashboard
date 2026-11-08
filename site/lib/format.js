// How the page writes numbers, shares, durations and dates, in its language (lib/i18n.js). No DOM: any layer may use it.

import { isMissing } from '../domain/math.js'
import { WORK_DAY_HOURS } from '../domain/time.js'
import { inContext, language, LOCALE, t } from './i18n.js'

const numberFormat = new Intl.NumberFormat(LOCALE)
export const decimalFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 })
export const compactFormat = new Intl.NumberFormat(LOCALE, { notation: 'compact' })
const relativeFormat = new Intl.RelativeTimeFormat(language, { numeric: 'auto' })
export const monthShortFormat = new Intl.DateTimeFormat(LOCALE, { month: 'short', timeZone: 'UTC' })
export const monthLongFormat = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric', timeZone: 'UTC' })
export const dayMonthFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', timeZone: 'UTC' })
export const dayLongFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
export const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'long', timeStyle: 'short' })
export const dateFormat = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'long' })
export const rangeShortFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
export const rangeLongFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/** @typedef {number | null | undefined} MaybeNumber A figure, missing when null or undefined. */

/** @type {(value: MaybeNumber) => string} */
export const formatNumber = (value) => (isMissing(value) ? '–' : numberFormat.format(value))
/** @type {(value: MaybeNumber) => string} */
export const formatDecimal = (value) => (isMissing(value) ? '–' : decimalFormat.format(value))
/** @type {(value: MaybeNumber) => string} */
export const formatPercent = (value) => (isMissing(value) ? '–' : t('{value} %', { value }))
/** @type {(value: MaybeNumber) => string} */
export const formatShare = (value) => (isMissing(value) ? '–' : t('{value} %', { value: Math.round(value * 100) }))
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
    return t('{value} s', { value: Math.round(seconds) })
  }
  if (seconds < 600) {
    const rounded = Math.round(seconds)

    return t('{minutes} min {seconds}', { minutes: Math.floor(rounded / 60), seconds: String(rounded % 60).padStart(2, '0') })
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
    return t('{value} min', { value: Math.round(hours * 60) })
  }
  if (hours < 2 * WORK_DAY_HOURS) {
    return t('{value} h', { value: numberFormat.format(hours < 10 ? Math.round(hours * 10) / 10 : Math.round(hours)) })
  }

  return t('{value} j', { value: numberFormat.format(Math.round((hours / WORK_DAY_HOURS) * 10) / 10) })
}

// A month of the calendar, in days, for a duration.
const MONTH_DAYS = 365.25 / 12

// A duration on the calendar, from days: in days under two weeks, in weeks under two months, else in months; the weeks
// short in the table.
/**
 * @param {MaybeNumber} days
 * @param {{ short?: boolean }} [options]
 */
export function formatSpan(days, { short = false } = {}) {
  if (isMissing(days)) {
    return '–'
  }
  if (days < 1) {
    return t('moins d’un jour')
  }
  if (days < 14) {
    return plural(Math.round(days), 'jour')
  }
  if (days < 9 * 7) {
    return short ? t('{count} sem.', { count: formatNumber(Math.round(days / 7)) }) : plural(Math.round(days / 7), 'semaine')
  }

  return plural(Math.round(days / MONTH_DAYS), 'mois', 'mois')
}

/** @param {string} iso */
export function formatRelative(iso) {
  const seconds = (Date.parse(iso) - Date.now()) / 1000
  const elapsed = Math.abs(seconds)
  if (elapsed < 60) {
    return t('à l’instant')
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
export const SIZE_LABELS = ['< 10', t('10 à 100'), t('100 à 500'), t('500 à 1 000'), t('> 1 000')]

/** @type {(month: string) => string} */
export const monthName = (month) => monthLongFormat.format(new Date(`${month}-15T12:00:00Z`))

// The noun of a count, in the language of the page: French takes the plural from two, English from anything but one.
// A noun the same in both numbers in French (PR, hotfix, mois) has an English for each, « PR (singulier) » and
// « PR (pluriel) » (inContext()): the bare French may be a label elsewhere, « PR de code » the head of a column.
/** @type {(count: number, singular: string, several?: string) => string} */
export function noun(count, singular, several = `${singular}s`) {
  const many = language === 'en' ? count !== 1 : count > 1
  if (several === singular) {
    return inContext(many ? 'pluriel' : 'singulier', singular)
  }

  return t(many ? several : singular)
}

// Whether French elides « de » before a name: « d’Ana », « de Ben ».
/** @type {(name: string) => boolean} */
export const elides = (name) => /^[aeiouyàâéèêëîïôöùûü]/i.test(name)

// A count and its noun.
/** @type {(count: number, singular: string, several?: string) => string} */
export const plural = (count, singular, several = `${singular}s`) => `${formatNumber(count)} ${noun(count, singular, several)}`
