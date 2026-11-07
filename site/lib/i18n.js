// The language of the page: French, or English once the viewer picks it (the button beside the method's), kept in this
// browser. Every text of the page is written in French and goes through t(): in English, it gives the English of
// lib/english/, the French being the key. What comes from GitHub (names, titles, repositories) is never translated.
// The English only loads in English, before any module that writes a text: they all import t() from here.

export const LANGUAGE_STORAGE_KEY = 'github-pr-dashboard:language'

/** @typedef {'fr' | 'en'} Language */

function readLanguage() {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'en' ? 'en' : 'fr'
  } catch {
    // Storage can be unavailable (private browsing, Node): French, the language the page is written in.
    return 'fr'
  }
}

/** @type {Language} */
export const language = readLanguage()
// The locale of the numbers and dates: European English, days before months and a 24-hour clock, as in French.
export const LOCALE = language === 'en' ? 'en-GB' : 'fr-FR'

/** @type {Map<string, string> | null} */
const english = language === 'en' ? (await import('./english.js')).ENGLISH : null

// The texts asked in English that have none yet: the browser test of the page asks for none.
/** @type {Set<string>} */
export const missing = new Set()

/**
 * A text of the page in its language: the French itself, or its English. Placeholders between braces, {count} say,
 * take the values given, already formatted.
 * @param {string} french
 * @param {Record<string, string | number>} [values]
 * @returns {string}
 */
export function t(french, values) {
  let text = french
  if (english) {
    const translated = english.get(french)
    if (translated === undefined) {
      missing.add(french)
    } else {
      text = translated
    }
  }

  return values ? text.replace(/\{(\w+)\}/g, (placeholder, name) => (name in values ? String(values[name]) : placeholder)) : text
}

// Keeps the language picked in this browser; the page then loads again in it.
/** @param {Language} picked */
export function storeLanguage(picked) {
  try {
    if (picked === 'en') {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en')
    } else {
      localStorage.removeItem(LANGUAGE_STORAGE_KEY)
    }
  } catch {
    // Without storage, the page stays in French.
  }
}
