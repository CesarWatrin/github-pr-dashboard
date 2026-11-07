// Theme: follows the system until the toggle is used, then sticks to the chosen one.

import { $ } from '../ui/dom.js'

const THEME_TRANSITION_MS = 350

// Also read by the inline script of index.html, which applies the theme before the first paint.
const THEME_STORAGE_KEY = 'github-pr-dashboard:theme'

const darkScheme = window.matchMedia('(prefers-color-scheme: dark)')

const currentTheme = () => document.documentElement.dataset.theme ?? (darkScheme.matches ? 'dark' : 'light')

export function renderThemeToggle() {
  const dark = currentTheme() === 'dark'
  const button = $('[data-theme-toggle]')
  button.setAttribute('aria-pressed', String(dark))
  button.dataset.label = dark ? 'Passer en mode clair' : 'Passer en mode sombre'
}

/** @type {ReturnType<typeof setTimeout> | undefined} */
let themeTimer

function toggleTheme() {
  const theme = currentTheme() === 'dark' ? 'light' : 'dark'
  // Colours cross-fade for a moment rather than switching at once.
  const root = document.documentElement
  root.classList.add('is-theme-changing')
  clearTimeout(themeTimer)
  themeTimer = setTimeout(() => root.classList.remove('is-theme-changing'), THEME_TRANSITION_MS)
  root.dataset.theme = theme
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Storage can be unavailable (private browsing): the theme only lasts for this page.
  }
  renderThemeToggle()
}

// Listens to the theme toggle, and to the theme of the system while the toggle has not been used.
export function setupTheme() {
  $('[data-theme-toggle]').addEventListener('click', toggleTheme)
  darkScheme.addEventListener('change', renderThemeToggle)
}
