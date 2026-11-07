// A force-directed layout, as d3-force lays a network out: nodes push each other away, links pull theirs together like
// springs, a weak pull keeps everything in the middle of its box, and nodes never overlap nor leave it. Pure
// arithmetic, no DOM: the graphs of the map page animate it one step at a time, the tests run it in Node.

/**
 * A node: its place and speed, its radius, and the place it is held at while dragged (fx, fy).
 * @typedef {{ x: number, y: number, vx: number, vy: number, radius: number, fx: number | null, fy: number | null }} ForceNode
 */
/**
 * A link between two nodes, by their indexes, the more pulling the heavier it weighs.
 * @typedef {{ source: number, target: number, weight: number }} ForceLink
 */
/**
 * The box the nodes stay in, and how much room each side leaves (bottom: the labels under the nodes).
 * @typedef {{ width: number, height: number, margin?: number, bottom?: number }} ForceBox
 */

// The heat of the layout: each step moves the nodes less, until it falls under ALPHA_MIN, in about 300 steps.
export const ALPHA_MIN = 0.001
const ALPHA_DECAY = 1 - ALPHA_MIN ** (1 / 300)
// The share of its speed a node loses at each step: the friction that lets the layout settle.
const VELOCITY_DECAY = 0.4
// The push between two nodes, weaker with their distance, never from closer than MIN_DISTANCE; and the length of a
// link between the edges of its nodes. Both grow with the room each node has in the box, within these limits, so that
// a few nodes spread over it as well as many.
const CHARGE = [150, 900]
const MIN_DISTANCE = 4
// Past this many times the room of a node, nodes no longer push each other: groups stay together, kept in the box by the
// pull toward its middle.
const CHARGE_REACH = 4
const LINK_GAP = [30, 140]
// The pull toward the middle of the box.
const GRAVITY = 0.05
// The gap nodes keep between their edges.
const COLLIDE_GAP = 4

// Where the nodes start without a place of their own: a sunflower spiral around the middle, the first ones closest,
// the same each time, so that a layout never depends on chance.
/**
 * @param {number} index
 * @param {ForceBox} box
 */
export function startPlace(index, { width, height }) {
  const radius = 12 * Math.sqrt(0.5 + index)
  const angle = index * Math.PI * (3 - Math.sqrt(5))

  return { x: width / 2 + radius * Math.cos(angle), y: height / 2 + radius * Math.sin(angle) }
}

/**
 * The layout of nodes (their radius, and a place to start from if they have one) and the links between them, in a box,
 * starting with some heat: 1 to lay them out, less to only settle nodes already laid out. step() moves them once and
 * returns the heat left; reheat() starts them moving again, after a drag say.
 * @param {{ radius: number, x?: number, y?: number }[]} items
 * @param {ForceLink[]} links
 * @param {ForceBox} box
 * @param {{ heat?: number }} [options]
 */
export function forceLayout(items, links, box, { heat = 1 } = {}) {
  const { width, height, margin = 8, bottom = margin } = box
  /** @type {ForceNode[]} */
  const nodes = items.map((item, index) => {
    const start = item.x === undefined || item.y === undefined ? startPlace(index, box) : { x: item.x, y: item.y }

    return { ...start, vx: 0, vy: 0, radius: item.radius, fx: null, fy: null }
  })
  // A link pulls the less as its nodes have more links, as in d3: a busy node is not torn apart. Heavier links pull more.
  const degree = nodes.map(() => 0)
  for (const link of links) {
    degree[link.source] += 1
    degree[link.target] += 1
  }
  const room = Math.sqrt((width * height) / Math.max(1, nodes.length))
  const charge = -Math.min(CHARGE[1], Math.max(CHARGE[0], room * 2.5))
  const linkGap = Math.min(LINK_GAP[1], Math.max(LINK_GAP[0], room * 0.5))
  const reach = (room * CHARGE_REACH) ** 2
  const heaviest = Math.max(1, ...links.map((link) => link.weight))
  const springs = links.map((link) => {
    const source = nodes[link.source]
    const target = nodes[link.target]

    return {
      source,
      target,
      length: source.radius + target.radius + linkGap,
      strength: (0.3 + (0.7 * link.weight) / heaviest) / Math.min(degree[link.source], degree[link.target]),
      // The busier end moves less.
      bias: degree[link.source] / (degree[link.source] + degree[link.target]),
    }
  })
  // A wide box pulls less sideways than up and down: the layout spreads over its width.
  const gravityX = GRAVITY * Math.min(1, height / width)
  const gravityY = GRAVITY * Math.min(1, width / height)
  let alpha = heat

  function step() {
    for (const { source, target, length, strength, bias } of springs) {
      let x = target.x + target.vx - source.x - source.vx
      let y = target.y + target.vy - source.y - source.vy
      const distance = Math.hypot(x, y) || 1
      const pull = ((distance - length) / distance) * alpha * strength
      x *= pull
      y *= pull
      target.vx -= x * bias
      target.vy -= y * bias
      source.vx += x * (1 - bias)
      source.vy += y * (1 - bias)
    }
    for (let i = 0; i < nodes.length; i += 1) {
      const a = nodes[i]
      for (let j = i + 1; j < nodes.length; j += 1) {
        const b = nodes[j]
        // Two nodes at the same place part along a direction of their own.
        const x = b.x - a.x || (j - i) * 0.01
        const y = b.y - a.y || (i - j) * 0.01
        const squared = x * x + y * y
        if (squared > reach) {
          continue
        }
        const push = (charge * alpha) / Math.max(squared, MIN_DISTANCE * MIN_DISTANCE)
        a.vx += x * push
        a.vy += y * push
        b.vx -= x * push
        b.vy -= y * push
      }
      a.vx += (width / 2 - a.x) * gravityX * alpha
      a.vy += (height / 2 - a.y) * gravityY * alpha
    }
    for (const node of nodes) {
      if (node.fx === null || node.fy === null) {
        node.vx *= 1 - VELOCITY_DECAY
        node.vy *= 1 - VELOCITY_DECAY
        node.x += node.vx
        node.y += node.vy
      } else {
        Object.assign(node, { x: node.fx, y: node.fy, vx: 0, vy: 0 })
      }
    }
    separate()
    alpha += -alpha * ALPHA_DECAY

    return alpha
  }

  // Nodes that overlap move apart, each by half of it, a held one not at all; then back into the box.
  function separate() {
    for (let i = 0; i < nodes.length; i += 1) {
      const a = nodes[i]
      for (let j = i + 1; j < nodes.length; j += 1) {
        const b = nodes[j]
        const x = b.x - a.x || (j - i) * 0.01
        const y = b.y - a.y || (i - j) * 0.01
        const distance = Math.hypot(x, y)
        const overlap = a.radius + b.radius + COLLIDE_GAP - distance
        if (overlap > 0) {
          const aHeld = a.fx !== null
          const bHeld = b.fx !== null
          const share = aHeld || bHeld ? 1 : 0.5
          const moveX = (x / distance) * overlap * share
          const moveY = (y / distance) * overlap * share
          if (!aHeld) {
            a.x -= moveX
            a.y -= moveY
          }
          if (!bHeld) {
            b.x += moveX
            b.y += moveY
          }
        }
      }
    }
    for (const node of nodes) {
      node.x = Math.min(Math.max(node.x, margin + node.radius), Math.max(margin + node.radius, width - margin - node.radius))
      node.y = Math.min(Math.max(node.y, margin + node.radius), Math.max(margin + node.radius, height - bottom - node.radius))
    }
  }

  return {
    nodes,
    step,
    /** @param {number} [to] */
    reheat(to = 0.3) {
      alpha = Math.max(alpha, to)
    },
    get alpha() {
      return alpha
    },
  }
}

// Steps a layout until it settles: what a page that shows no motion draws at once, and what the tests check.
/** @param {ReturnType<typeof forceLayout>} layout */
export function settle(layout) {
  while (layout.step() >= ALPHA_MIN) {
    // Each step moves the nodes a little less.
  }

  return layout.nodes
}
