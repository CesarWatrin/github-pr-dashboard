// The helpers that build the page: $() and $$() find, el() and svg() create.

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * The first element of the page a selector finds, an HTMLElement unless the caller says which:
 * `$(…)` for a container, `/** @type {HTMLInputElement} *\/ ($(…))` for a field.
 * @param {string} selector
 * @returns {HTMLElement}
 */
export const $ = (selector) => /** @type {HTMLElement} */ (document.querySelector(selector))

/**
 * Every element of the page a selector finds, as an array.
 * @param {string} selector
 * @returns {HTMLElement[]}
 */
export const $$ = (selector) => [.../** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll(selector))]

export function el(tag, properties = {}, ...children) {
  const node = document.createElement(tag)
  Object.assign(node, properties)
  node.append(...children)

  return node
}

export function svg(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, value)
  }

  return node
}
