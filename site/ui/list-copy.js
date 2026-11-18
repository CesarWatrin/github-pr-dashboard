// Copies the list of pull requests of a card as one text, to paste into a chat with Claude: the title of the card and
// what it holds, then a line per pull request with what the page says of it, its title and its address on GitHub.

import { t } from '../lib/i18n.js'

// How long « Copié » stays beside the button.
const COPIED_MS = 3000

// A line of text per pull request of a list: the text of its item, its pieces spaced (link, tags, who it waits for),
// its title, its address and since when it stands there, the date in full.
/** @param {HTMLElement} item */
function itemLine(item) {
  const text = item.querySelector('.feed-text')
  const link = text?.querySelector('a[href*="/pull/"]')
  if (!text || !(link instanceof HTMLAnchorElement)) {
    return null
  }
  const said = [...text.childNodes]
    .filter((node) => !(node instanceof HTMLElement && node.classList.contains('feed-pr-title')))
    .map((node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
  const title = text.querySelector('.feed-pr-title')?.textContent?.trim()
  // The date in full rather than « il y a 2 h », which no longer means anything once pasted.
  const time = item.querySelector('.feed-time time')
  const since = time
    ? `${(time.parentElement?.firstChild?.textContent ?? '').trim()} ${time.getAttribute('title') ?? time.textContent}`.trim()
    : null

  return `- ${[said, title, link.href, since].filter(Boolean).join(' — ')}`
}

// The text of a card: its title, its hint, then its pull requests.
/** @param {HTMLElement} card */
export function listText(card) {
  const lines = [...card.querySelectorAll('.feed > li.feed-item')].map((item) => itemLine(/** @type {HTMLElement} */ (item)))

  return [
    card.querySelector('h2')?.textContent?.trim(),
    card.querySelector('.card-sub')?.textContent?.trim(),
    '',
    ...lines.filter(Boolean),
  ]
    .filter((line) => line !== undefined)
    .join('\n')
}

/** @type {WeakMap<HTMLElement, ReturnType<typeof setTimeout>>} */
const timers = new WeakMap()

// Listens to the copy buttons found by selector: each copies the card it sits in, and says so beside it.
/** @param {string} selector */
export function setupListCopies(selector) {
  for (const button of document.querySelectorAll(selector)) {
    button.addEventListener('click', async () => {
      const card = /** @type {HTMLElement | null} */ (button.closest('.card'))
      const status = /** @type {HTMLElement | null} */ (card?.querySelector('[data-list-copied]'))
      if (!card || !status) {
        return
      }
      try {
        await navigator.clipboard.writeText(listText(card))
        status.textContent = t('Copié')
      } catch {
        status.textContent = t('Copie impossible dans ce navigateur')
      }
      clearTimeout(timers.get(status))
      timers.set(
        status,
        setTimeout(() => {
          status.textContent = ''
        }, COPIED_MS),
      )
    })
  }
}
