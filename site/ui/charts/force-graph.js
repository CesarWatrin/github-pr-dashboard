// A network laid out by forces (lib/force-layout.js), as react-force-graph draws one: nodes that push each other away,
// links that pull theirs together. The nodes can be dragged, the view zoomed and moved; a node lights up its neighbours,
// and its figures show in a strip under the network rather than in a tooltip, which would hide the nodes around it.

import { ALPHA_MIN, forceLayout, settle } from '../../lib/force-layout.js'
import { t } from '../../lib/i18n.js'
import { el, svg } from '../dom.js'
import { reducedMotion } from '../motion.js'

/**
 * A node to draw: an avatar in a ring of colored shares (a person), or a filled square (a repository).
 * @typedef {{
 *   id: string,
 *   label: string,
 *   value: number,
 *   image?: string,
 *   fill?: string,
 *   ring?: { color: string, share: number }[],
 * }} GraphNode
 */
/** @typedef {{ source: string, target: string, weight: number, color?: string }} GraphLink */

const MIN_RADIUS = 6
// The radius of the heaviest node, smaller on a phone.
const MAX_RADIUS = 24
const PHONE_MAX_RADIUS = 16
// At rest, the labels of the nodes asked for, else those of the MAX_LABELS heaviest; a node pointed at shows those of
// its neighbours.
const MAX_LABELS = 20
export const RING_WIDTH = 3
const ZOOM_LIMITS = [0.5, 4]
// Moved less than this, a press on a node is a click.
const DRAG_THRESHOLD = 4

// What each container draws: its layout, kept between two drawings (new filters, a new width) so that the nodes move
// from where they were rather than starting again; and how to stop its animation.
/** @type {WeakMap<HTMLElement, { places: Map<string, { x: number, y: number }>, stop: () => void }>} */
const graphs = new WeakMap()
let clipCount = 0

/**
 * @param {HTMLElement} container
 * @param {{
 *   nodes: GraphNode[],
 *   links: GraphLink[],
 *   ariaLabel: string,
 *   details: HTMLElement,
 *   hint: string,
 *   tooltip: (node: GraphNode) => import('../tooltip.js').Tooltip,
 *   linkTooltip: (link: GraphLink) => import('../tooltip.js').Tooltip,
 *   open: (node: GraphNode, element: Element) => void,
 *   found?: (node: GraphNode) => boolean,
 *   labelled?: (node: GraphNode) => boolean,
 * }} options
 */
export function forceGraph(container, { nodes, links, ariaLabel, details, hint, tooltip, linkTooltip, open, found, labelled: label }) {
  const width = container.clientWidth
  const previous = graphs.get(container)
  previous?.stop()
  if (width === 0) {
    return
  }
  showDetails(details, null, hint)
  if (nodes.length === 0) {
    container.replaceChildren(el('p', { className: 'chart-empty', textContent: t('Aucune donnée sur la période') }))

    return
  }
  const height = graphHeight(width)
  const heaviest = Math.max(...nodes.map((node) => node.value))
  const maxRadius = width < 600 ? PHONE_MAX_RADIUS : MAX_RADIUS
  const radius = (/** @type {GraphNode} */ node) => MIN_RADIUS + (maxRadius - MIN_RADIUS) * Math.sqrt(node.value / heaviest)
  const index = new Map(nodes.map((node, position) => [node.id, position]))
  const kept = links.filter((link) => index.has(link.source) && index.has(link.target))
  const places = previous?.places ?? new Map()
  const layout = forceLayout(
    nodes.map((node) => {
      const place = places.get(node.id)

      return { radius: radius(node) + RING_WIDTH, ...(place ? { x: place.x * width, y: place.y * height } : {}) }
    }),
    kept.map((link) => ({ source: Number(index.get(link.source)), target: Number(index.get(link.target)), weight: link.weight })),
    { width, height, margin: 10, bottom: 18 },
    // Nodes that already had a place only settle again.
    { heat: nodes.every((node) => places.has(node.id)) ? 0.25 : 1 },
  )

  // Neighbours of each node, to light them up with it.
  /** @type {Map<string, Set<string>>} */
  const neighbours = new Map(nodes.map((node) => [node.id, new Set([node.id])]))
  for (const link of kept) {
    neighbours.get(link.source)?.add(link.target)
    neighbours.get(link.target)?.add(link.source)
  }
  const labelled = new Set(
    (label ? nodes.filter(label) : nodes.slice().sort((a, b) => b.value - a.value).slice(0, MAX_LABELS)).map((node) => node.id),
  )
  const searched = found ? new Set(nodes.filter(found).map((node) => node.id)) : null
  const leave = () => {
    focus(null)
    showDetails(details, null, hint)
  }

  const chart = svg('svg', { class: 'force-graph', viewBox: `0 0 ${width} ${height}`, width, height, role: 'group', 'aria-label': ariaLabel })
  const clipId = addCircleClip(chart)
  const view = svg('g', { class: 'force-graph-view' })
  const linkLayer = svg('g', { class: 'force-graph-links' })
  const nodeLayer = svg('g', { class: 'force-graph-nodes' })
  view.append(linkLayer, nodeLayer)
  chart.append(view)

  const heaviestLink = Math.max(1, ...kept.map((link) => link.weight))
  const linkElements = kept.map((link) => {
    const strength = link.weight / heaviestLink
    const line = svg('line', { class: 'force-graph-link', 'stroke-width': 1 + 4 * strength, 'stroke-opacity': 0.25 + 0.5 * strength })
    if (link.color) {
      line.style.stroke = link.color
    }
    // A wider, invisible line under the pointer: a thin link is hard to point at.
    const hit = svg('line', { class: 'force-graph-link-hit' })
    onHover(
      hit,
      () => {
        focus([link.source, link.target], [link])
        showDetails(details, linkTooltip(link), hint)
      },
      leave,
    )
    linkLayer.append(line, hit)

    return { link, line, hit }
  })

  const nodeElements = nodes.map((node, position) => {
    const size = radius(node)
    const group = svg('g', { class: 'force-graph-node', tabindex: 0, role: 'button', 'aria-label': node.label })
    group.setAttribute('aria-haspopup', 'dialog')
    group.append(...nodeShapes(node, size, clipId))
    group.classList.toggle('is-unlabelled', !labelled.has(node.id))
    group.classList.toggle('is-found', searched?.has(node.id) ?? false)
    onHover(
      group,
      () => {
        if (!dragged) {
          focus([...(neighbours.get(node.id) ?? [])], kept.filter((link) => link.source === node.id || link.target === node.id))
          showDetails(details, tooltip(node), hint)
        }
      },
      leave,
    )
    group.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        open(node, group)
      }
    })
    dragOn(group, position, node)
    nodeLayer.append(group)

    return group
  })
  chart.classList.toggle('has-search', searched !== null)
  container.replaceChildren(chart)

  // A node pointed at lights up with its neighbours and links, the rest fades.
  /**
   * @param {string[] | null} ids
   * @param {GraphLink[]} [near]
   */
  function focus(ids, near = []) {
    const lit = new Set(ids ?? [])
    const litLinks = new Set(near)
    chart.classList.toggle('is-focused', ids !== null)
    for (const [position, group] of nodeElements.entries()) {
      group.classList.toggle('is-near', lit.has(nodes[position].id))
    }
    for (const { link, line } of linkElements) {
      line.classList.toggle('is-near', litLinks.has(link))
    }
  }

  // Zoom (pinch, or Ctrl or ⌘ and the wheel) and move (drag the background with a mouse or a pen): a double click puts
  // the view back. The page still scrolls with the wheel alone and a finger.
  let zoom = { k: 1, x: 0, y: 0 }
  const drawView = () => view.setAttribute('transform', `translate(${zoom.x} ${zoom.y}) scale(${zoom.k})`)
  // A point of the screen in the coordinates of the drawing, zoom undone.
  const toChart = (/** @type {number} */ clientX, /** @type {number} */ clientY) => {
    const box = chart.getBoundingClientRect()
    const x = ((clientX - box.left) * width) / box.width
    const y = ((clientY - box.top) * height) / box.height

    return { x, y, graphX: (x - zoom.x) / zoom.k, graphY: (y - zoom.y) / zoom.k }
  }
  chart.addEventListener(
    'wheel',
    (event) => {
      if (!event.ctrlKey && !event.metaKey) {
        return
      }
      event.preventDefault()
      const { x, y, graphX, graphY } = toChart(event.clientX, event.clientY)
      const k = Math.min(ZOOM_LIMITS[1], Math.max(ZOOM_LIMITS[0], zoom.k * Math.exp(-event.deltaY * 0.01)))
      zoom = { k, x: x - graphX * k, y: y - graphY * k }
      drawView()
    },
    { passive: false },
  )
  /** @type {{ x: number, y: number, zoom: typeof zoom } | null} */
  let pan = null
  chart.addEventListener('pointerdown', (event) => {
    if (event.target !== chart || event.pointerType === 'touch' || event.button !== 0) {
      return
    }
    pan = { x: event.clientX, y: event.clientY, zoom }
    chart.setPointerCapture(event.pointerId)
    chart.classList.add('is-panning')
  })
  chart.addEventListener('pointermove', (event) => {
    if (pan) {
      const box = chart.getBoundingClientRect()
      const scale = width / box.width
      zoom = { ...pan.zoom, x: pan.zoom.x + (event.clientX - pan.x) * scale, y: pan.zoom.y + (event.clientY - pan.y) * scale }
      drawView()
    }
  })
  const endPan = () => {
    pan = null
    chart.classList.remove('is-panning')
  }
  chart.addEventListener('pointerup', endPan)
  chart.addEventListener('pointercancel', endPan)
  chart.addEventListener('dblclick', (event) => {
    if (event.target === chart) {
      zoom = { k: 1, x: 0, y: 0 }
      drawView()
    }
  })

  // A node follows the pointer that drags it, the others making room; let go, it floats again. Pressed without moving,
  // it opens its dialog.
  let dragged = false
  /**
   * @param {SVGGElement} group
   * @param {number} position
   * @param {GraphNode} node
   */
  function dragOn(group, position, node) {
    /** @type {{ x: number, y: number } | null} */
    let press = null
    group.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) {
        return
      }
      press = { x: event.clientX, y: event.clientY }
      group.setPointerCapture(event.pointerId)
    })
    group.addEventListener('pointermove', (event) => {
      if (!press) {
        return
      }
      if (!dragged && Math.hypot(event.clientX - press.x, event.clientY - press.y) < DRAG_THRESHOLD) {
        return
      }
      if (!dragged) {
        dragged = true
        group.classList.add('is-dragged')
      }
      const { graphX, graphY } = toChart(event.clientX, event.clientY)
      Object.assign(layout.nodes[position], { fx: graphX, fy: graphY })
      layout.reheat()
      animate()
    })
    const release = (/** @type {boolean} */ clicked) => {
      if (press && !dragged && clicked) {
        open(node, group)
      }
      press = null
      if (dragged) {
        Object.assign(layout.nodes[position], { fx: null, fy: null })
        group.classList.remove('is-dragged')
        dragged = false
      }
    }
    group.addEventListener('pointerup', () => release(true))
    group.addEventListener('pointercancel', () => release(false))
  }

  function draw() {
    for (const [position, group] of nodeElements.entries()) {
      const { x, y } = layout.nodes[position]
      group.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`)
      places.set(nodes[position].id, { x: x / width, y: y / height })
    }
    for (const { link, line, hit } of linkElements) {
      const source = layout.nodes[Number(index.get(link.source))]
      const target = layout.nodes[Number(index.get(link.target))]
      for (const element of [line, hit]) {
        element.setAttribute('x1', source.x.toFixed(1))
        element.setAttribute('y1', source.y.toFixed(1))
        element.setAttribute('x2', target.x.toFixed(1))
        element.setAttribute('y2', target.y.toFixed(1))
      }
    }
  }

  // The layout moves at each frame until it settles, or at once without motion.
  let frame = 0
  function animate() {
    if (frame) {
      return
    }
    frame = requestAnimationFrame(function move() {
      layout.step()
      draw()
      frame = layout.alpha >= ALPHA_MIN || dragged ? requestAnimationFrame(move) : 0
    })
  }
  if (reducedMotion.matches) {
    settle(layout)
  }
  draw()
  drawView()
  if (!reducedMotion.matches) {
    animate()
  }
  graphs.set(container, {
    places,
    stop: () => {
      cancelAnimationFrame(frame)
      frame = 0
    },
  })
}

// The height of a network drawn at a width.
/** @param {number} width */
export const graphHeight = (width) => Math.round(Math.min(640, Math.max(380, width * 0.62)))

// A clip path that cuts an image to the circle within its box, for the avatars of a network: its id.
/** @param {SVGElement} chart */
export function addCircleClip(chart) {
  const id = `force-graph-clip-${(clipCount += 1)}`
  const clip = svg('clipPath', { id, clipPathUnits: 'objectBoundingBox' })
  clip.append(svg('circle', { cx: 0.5, cy: 0.5, r: 0.5 }))
  const defs = svg('defs')
  defs.append(clip)
  chart.prepend(defs)

  return id
}

// What draws a node around its centre: an avatar on a disc in its ring, or a filled square; and its label under it.
/**
 * @param {Pick<GraphNode, 'label' | 'image' | 'fill' | 'ring'>} node
 * @param {number} size
 * @param {string} clipId
 * @returns {SVGElement[]}
 */
export function nodeShapes(node, size, clipId) {
  const label = svg('text', { class: 'force-graph-label', y: size + RING_WIDTH + 11, 'text-anchor': 'middle' })
  label.textContent = node.label
  if (!node.image) {
    const square = svg('rect', { class: 'force-graph-square', x: -size, y: -size, width: 2 * size, height: 2 * size, rx: size * 0.35 })
    if (node.fill) {
      // Its colour, for what lights the square up too.
      square.style.setProperty('--node-color', node.fill)
      square.style.fill = node.fill
    }

    return [square, label]
  }
  const image = svg('image', { href: node.image, x: -size, y: -size, width: 2 * size, height: 2 * size, 'clip-path': `url(#${clipId})` })
  // An avatar GitHub does not serve leaves the disc, rather than the mark of a broken image.
  image.addEventListener('error', () => image.remove())

  return [svg('circle', { class: 'force-graph-disc', r: size }), image, ...ringArcs(node.ring ?? [], size + RING_WIDTH / 2), label]
}

// The ring of a person: an arc per share, a gap of the surface between two, a full circle for a single one.
/**
 * @param {{ color: string, share: number }[]} ring
 * @param {number} r
 * @returns {SVGElement[]}
 */
function ringArcs(ring, r) {
  const shares = ring.filter((part) => part.share > 0)
  if (shares.length === 0) {
    return [svg('circle', { class: 'force-graph-ring is-empty', r })]
  }
  if (shares.length === 1) {
    const circle = svg('circle', { class: 'force-graph-ring', r })
    circle.style.stroke = shares[0].color

    return [circle]
  }
  const gap = 2 / r
  let angle = -Math.PI / 2

  return shares.map((part) => {
    const start = angle + gap / 2
    const end = angle + part.share * 2 * Math.PI - gap / 2
    angle += part.share * 2 * Math.PI
    const point = (/** @type {number} */ at) => `${(r * Math.cos(at)).toFixed(2)} ${(r * Math.sin(at)).toFixed(2)}`
    const arc = svg('path', {
      class: 'force-graph-ring',
      d: `M ${point(start)} A ${r} ${r} 0 ${end - start > Math.PI ? 1 : 0} 1 ${point(Math.max(start, end))}`,
    })
    arc.style.stroke = part.color

    return arc
  })
}

// Pointed at or focused, and no longer.
/**
 * @param {Element} target
 * @param {() => void} enter
 * @param {() => void} leave
 */
export function onHover(target, enter, leave) {
  target.addEventListener('pointerenter', enter)
  target.addEventListener('pointerleave', leave)
  target.addEventListener('focus', enter)
  target.addEventListener('blur', leave)
}

// The figures of what is pointed at on one line under the network, else what to point at.
/**
 * @param {HTMLElement} details
 * @param {import('../tooltip.js').Tooltip | null} content
 * @param {string} hint
 */
export function showDetails(details, content, hint) {
  if (!content) {
    details.replaceChildren(el('span', { className: 'force-graph-hint', textContent: hint }))

    return
  }
  details.replaceChildren(
    el('strong', { textContent: content.title }),
    ...content.rows.map((row) => el('span', { className: 'force-graph-figure' }, el('b', { textContent: row.value }), document.createTextNode(` ${row.label}`))),
    ...(content.note ? [el('span', { className: 'force-graph-note', textContent: content.note })] : []),
  )
}
