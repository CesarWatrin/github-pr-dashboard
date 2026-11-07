// The language of the page: the button beside the method's switches between French and English, kept in this browser,
// and the page loads again in it (lib/i18n.js), still unlocked.

import { language, storeLanguage, t } from '../lib/i18n.js'
import { $ } from '../ui/dom.js'

// The button reads the language it switches to.
export function renderLanguageToggle() {
  const button = $('[data-language-toggle]', HTMLButtonElement)
  const label = language === 'en' ? t('Passer en français') : t('Passer en anglais')
  button.textContent = language === 'en' ? 'FR' : 'EN'
  button.setAttribute('aria-label', label)
  button.dataset.label = label
}

// Listens to the button.
export function setupLanguage() {
  $('[data-language-toggle]').addEventListener('click', () => {
    storeLanguage(language === 'en' ? 'fr' : 'en')
    location.reload()
  })
}
