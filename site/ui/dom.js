// The helpers that build the page: $() and $$() find, el() and svg() create, withNodes() puts nodes in a text.

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * The first element of the page a selector finds. Given the kind of element it is (HTMLDialogElement,
 * HTMLInputElement…), typed so and checked: a page that changed shows at once.
 * @template {HTMLElement} [Found=HTMLElement]
 * @param {string} selector
 * @param {new () => Found} [kind]
 * @returns {Found}
 */
export function $(selector, kind) {
  const node = document.querySelector(selector)
  if (kind && !(node instanceof kind)) {
    throw new TypeError(`${selector}: no ${kind.name}`)
  }

  return /** @type {Found} */ (node)
}

/**
 * Every element of the page a selector finds, as an array, of the kind given if any.
 * @template {HTMLElement} [Found=HTMLElement]
 * @param {string} selector
 * @param {new () => Found} [kind]
 * @returns {Found[]}
 */
export function $$(selector, kind) {
  const nodes = [...document.querySelectorAll(selector)]
  if (kind && !nodes.every((node) => node instanceof kind)) {
    throw new TypeError(`${selector}: not all ${kind.name}`)
  }

  return /** @type {Found[]} */ (nodes)
}

export function el(tag, properties = {}, ...children) {
  const node = document.createElement(tag)
  Object.assign(node, properties)
  node.append(...children)

  return node
}

// A text with nodes in it, links say: the placeholders of the text take them.
export const withNodes = (text, nodes) =>
  text
    .split(/\{(\w+)\}/)
    .map((part, index) => (index % 2 ? nodes[part] : part))
    .filter((part) => part !== '')
    .map((part) => (typeof part === 'string' ? document.createTextNode(part) : part))

export function svg(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, value)
  }

  return node
}
