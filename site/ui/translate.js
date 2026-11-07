// The static texts of index.html in the language of the page. index.html is written in French; in English, each text
// takes its English through t(), keyed by its French, its whitespace collapsed: a sentence with inline markup (strong,
// code, a link…) as a whole block, its HTML the key; any other text on its own, beside an icon or a field say; and the
// text attributes. The scripts write their own texts through t().

import { language, t } from '../lib/i18n.js'

// The attributes that hold a text read by someone.
const ATTRIBUTES = ['title', 'aria-label', 'placeholder', 'data-label', 'alt']
// The elements a sentence may hold and still translate as a whole.
const INLINE = new Set(['A', 'ABBR', 'B', 'BR', 'CODE', 'EM', 'I', 'KBD', 'MARK', 'Q', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'TIME'])

/** @param {string} text */
const collapse = (text) => text.replace(/\s+/g, ' ').trim()

/** @param {Element} element */
const isSentence = (element) =>
  [...element.querySelectorAll('*')].every((inner) => INLINE.has(inner.tagName)) &&
  [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())

/**
 * What translates in an element and what it holds: sentences (whole blocks), lone texts, and the elements that hold a
 * text attribute.
 * @param {Element} root
 * @returns {{ blocks: Element[], texts: Text[], labelled: Element[] }}
 */
export function textsOf(root) {
  /** @type {Element[]} */
  const blocks = []
  /** @type {Text[]} */
  const texts = []
  /** @type {Element[]} */
  const labelled = []
  /** @param {Element} element */
  const visit = (element) => {
    if (ATTRIBUTES.some((name) => element.hasAttribute(name))) {
      labelled.push(element)
    }
    if (['SCRIPT', 'STYLE', 'svg'].includes(element.tagName)) {
      return
    }
    // A sentence, attributes of what it holds included, translates as a whole.
    if (isSentence(element)) {
      blocks.push(element)

      return
    }
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
        texts.push(/** @type {Text} */ (node))
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        visit(/** @type {Element} */ (node))
      }
    }
  }
  visit(root)

  return { blocks, texts, labelled }
}

/**
 * The French of a sentence, as its key: its HTML, its whitespace collapsed.
 * @param {Element} block
 */
export const blockKey = (block) => collapse(block.innerHTML)

/**
 * The French of a lone text, as its key.
 * @param {Text} text
 */
export const textKey = (text) => collapse(text.textContent ?? '')

// Translates the page once, before anything else writes in it; nothing to do in French.
export function translatePage() {
  if (language !== 'en') {
    return
  }
  const { blocks, texts, labelled } = textsOf(document.body)
  for (const element of labelled) {
    for (const name of ATTRIBUTES) {
      const value = element.getAttribute(name)
      if (value?.trim()) {
        element.setAttribute(name, t(collapse(value)))
      }
    }
  }
  for (const text of texts) {
    // The spaces around a text keep it apart from its neighbours.
    const [, before, , after] = /** @type {RegExpMatchArray} */ ((text.textContent ?? '').match(/^(\s*)([\s\S]*?)(\s*)$/))
    text.textContent = `${before ? ' ' : ''}${t(textKey(text))}${after ? ' ' : ''}`
  }
  for (const block of blocks) {
    const english = t(blockKey(block))
    if (english !== blockKey(block)) {
      block.innerHTML = english
    }
  }
  document.documentElement.lang = 'en'
  document.title = t('Stats PR')
  document.documentElement.classList.add('is-translated')
}
