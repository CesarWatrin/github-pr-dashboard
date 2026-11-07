// A film of a network, as Gource replays a history: frame after frame, repositories appear and grow, people come in
// when they act and leave when they no longer do, and each event travels from a person to a repository. The page
// drives it (play, pause, the moment shown); the layout keeps moving between frames, by forces (lib/force-layout.js).

import { forceLayout } from '../../lib/force-layout.js'
import { svg } from '../dom.js'
import { reducedMotion } from '../motion.js'
import { addCircleClip, graphHeight, nodeShapes, onHover, RING_WIDTH, showDetails } from './force-graph.js'

/** @typedef {import('../../model/replay.js').ReplayFrame} ReplayFrame */
/** @typedef {import('../../model/replay.js').ReplayEvent} ReplayEvent */

const PERSON_RADIUS = 10
const PHONE_PERSON_RADIUS = 7
const REPO_RADIUS = [5, 26]
const PHONE_REPO_RADIUS = [4, 16]
// How long an event takes to travel from its person to its repository, and how many travel at once at most.
const TRAVEL_MS = 700
const MAX_TRAVELLERS = 60
// A person or a repository shows its name for this long after something happened to it, in minutes of the film; the
// biggest repositories always do.
const NAMED_MINUTES = 3 * 24 * 60
const NAMED_REPOSITORIES = 8

/**
 * @param {HTMLElement} container
 * @param {{
 *   replay: { frame: (at: number) => ReplayFrame },
 *   maxAdded: number,
 *   trailMinutes: number,
 *   ariaLabel: string,
 *   details: HTMLElement,
 *   hint: string,
 *   person: (login: string) => import('./force-graph.js').GraphNode,
 *   repository: (repo: string) => import('./force-graph.js').GraphNode,
 *   personDetails: (login: string, frame: ReplayFrame) => import('../tooltip.js').Tooltip,
 *   repositoryDetails: (repo: string, frame: ReplayFrame) => import('../tooltip.js').Tooltip,
 * }} options
 * @returns {{ show: (at: number) => ReplayFrame, stop: () => void } | null}
 */
export function replayGraph(container, options) {
  const { replay, maxAdded, trailMinutes, ariaLabel, details, hint } = options
  const width = container.clientWidth
  if (width === 0) {
    return null
  }
  const height = graphHeight(width)
  const phone = width < 600
  const personRadius = phone ? PHONE_PERSON_RADIUS : PERSON_RADIUS
  const [minRepo, maxRepo] = phone ? PHONE_REPO_RADIUS : REPO_RADIUS
  // A repository grows with the lines merged into it, against the most any reaches by the end of the film.
  const repoRadius = (/** @type {number} */ added) => minRepo + (maxRepo - minRepo) * Math.sqrt(added / Math.max(1, maxAdded))

  const chart = svg('svg', { class: 'force-graph replay-graph', viewBox: `0 0 ${width} ${height}`, width, height, role: 'group', 'aria-label': ariaLabel })
  const clipId = addCircleClip(chart)
  const linkLayer = svg('g', { class: 'force-graph-links' })
  const travelLayer = svg('g', { class: 'replay-travellers' })
  const nodeLayer = svg('g', { class: 'force-graph-nodes' })
  chart.append(linkLayer, travelLayer, nodeLayer)
  container.replaceChildren(chart)
  showDetails(details, null, hint)

  /** @type {Map<string, { group: SVGGElement, size: number, kind: 'person' | 'repository' }>} */
  const shown = new Map()
  /** @type {Map<string, SVGLineElement>} */
  const lines = new Map()
  /** @type {Map<string, { x: number, y: number }>} */
  const places = new Map()
  /** @type {{ element: SVGCircleElement, from: string, to: string, start: number }[]} */
  let travellers = []
  /** @type {ReturnType<typeof forceLayout> | null} */
  let layout = null
  /** @type {string[]} */
  let order = []
  /** @type {ReplayFrame | null} */
  let current = null
  let pointed = ''
  let played = 0
  let frameRequest = 0

  // A node of the frame: drawn once, a repository resized as it grows; a new one starts beside what it is linked to.
  /**
   * @param {string} id
   * @param {'person' | 'repository'} kind
   * @param {number} size
   * @param {string | undefined} near
   */
  function nodeOf(id, kind, size, near) {
    const existing = shown.get(id)
    if (existing) {
      if (existing.size !== size && kind === 'repository') {
        resizeSquare(existing.group, size)
        existing.size = size
      }

      return existing
    }
    const name = id.slice(id.indexOf(':') + 1)
    const node = kind === 'person' ? options.person(name) : options.repository(name)
    const group = /** @type {SVGGElement} */ (svg('g', { class: `force-graph-node replay-node is-${kind}` }))
    group.append(...nodeShapes(node, size, clipId))
    onHover(
      group,
      () => {
        pointed = id
        showPointed()
      },
      () => {
        pointed = ''
        showDetails(details, null, hint)
      },
    )
    nodeLayer.append(group)
    const anchor = near ? places.get(near) : null
    places.set(id, anchor ? { x: anchor.x + 12, y: anchor.y + 12 } : { x: width / 2, y: height / 2 })
    const entry = { group, size, kind }
    shown.set(id, entry)

    return entry
  }

  function showPointed() {
    if (!current || !pointed) {
      return
    }
    const name = pointed.slice(pointed.indexOf(':') + 1)
    showDetails(details, pointed.startsWith('person:') ? options.personDetails(name, current) : options.repositoryDetails(name, current), hint)
  }

  // What a frame shows: its repositories and people, and their links, faded as they age; the events since the frame
  // before set off on their way.
  /** @param {number} at */
  function show(at) {
    const frame = replay.frame(at)
    current = frame
    /** @type {Set<string>} */
    const ids = new Set()
    /** @type {Map<string, number>} */
    const repoLastAt = new Map()
    for (const link of frame.links.values()) {
      repoLastAt.set(link.repo, Math.max(link.lastAt, repoLastAt.get(link.repo) ?? -Infinity))
    }
    const biggest = new Set(
      [...frame.repos]
        .sort((a, b) => b[1].added - a[1].added)
        .slice(0, NAMED_REPOSITORIES)
        .map(([repo]) => repo),
    )
    for (const [repo, { added }] of frame.repos) {
      const id = `repo:${repo}`
      ids.add(id)
      const { group } = nodeOf(id, 'repository', repoRadius(added), undefined)
      group.classList.toggle('is-acting', biggest.has(repo) || at - (repoLastAt.get(repo) ?? -Infinity) <= NAMED_MINUTES)
    }
    for (const [login, lastAt] of frame.people) {
      const id = `person:${login}`
      ids.add(id)
      const link = [...frame.links.values()].find((other) => other.login === login)
      const { group } = nodeOf(id, 'person', personRadius, link ? `repo:${link.repo}` : undefined)
      group.classList.toggle('is-acting', at - lastAt <= NAMED_MINUTES)
    }
    for (const [id, { group }] of shown) {
      if (!ids.has(id)) {
        group.remove()
        shown.delete(id)
      }
    }
    for (const [key, link] of frame.links) {
      let line = lines.get(key)
      if (!line) {
        line = /** @type {SVGLineElement} */ (svg('line', { class: `force-graph-link replay-link is-${link.kind}` }))
        lines.set(key, line)
        linkLayer.append(line)
      }
      line.style.opacity = String(Math.max(0.08, 1 - (at - link.lastAt) / trailMinutes))
    }
    for (const [key, line] of lines) {
      if (!frame.links.has(key)) {
        line.remove()
        lines.delete(key)
      }
    }
    // The layout follows the nodes shown: when they change, it starts again from where they are, a little warm.
    const nextOrder = [...shown.keys()]
    if (nextOrder.join('\n') !== order.join('\n')) {
      order = nextOrder
      const index = new Map(order.map((id, position) => [id, position]))
      layout = forceLayout(
        order.map((id) => ({ radius: (shown.get(id)?.size ?? 0) + RING_WIDTH, ...places.get(id) })),
        [...frame.links.values()].flatMap((link) => {
          const source = index.get(`person:${link.login}`)
          const target = index.get(`repo:${link.repo}`)

          return source === undefined || target === undefined ? [] : [{ source, target, weight: 1 }]
        }),
        { width, height, margin: 10, bottom: 18 },
        { heat: 0.3 },
      )
    } else {
      layout?.reheat(0.08)
    }
    if (frame.played < played) {
      played = 0
    }
    if (!reducedMotion.matches) {
      for (const event of frame.recent.slice(Math.max(0, frame.recent.length - (frame.played - played)))) {
        setOff(event)
      }
    }
    played = frame.played
    showPointed()
    run()

    return frame
  }

  /** @param {ReplayEvent} event */
  function setOff(event) {
    const from = `person:${event.login}`
    const to = `repo:${event.repo}`
    if (travellers.length >= MAX_TRAVELLERS) {
      return
    }
    if (event.kind === 'merged') {
      // A merge lights the repository up.
      const group = shown.get(to)?.group
      group?.classList.remove('is-merging')
      void group?.getBoundingClientRect()
      group?.classList.add('is-merging')

      return
    }
    const element = /** @type {SVGCircleElement} */ (svg('circle', { class: `replay-traveller is-${event.kind}`, r: 3 }))
    travelLayer.append(element)
    travellers.push({ element, from, to, start: performance.now() })
  }

  // Each animation frame moves the layout a step, the nodes and links after it, and the travellers along their way.
  function run() {
    if (frameRequest) {
      return
    }
    frameRequest = requestAnimationFrame(function move(now) {
      frameRequest = 0
      if (layout) {
        layout.step()
        for (const [position, id] of order.entries()) {
          const { x, y } = layout.nodes[position]
          places.set(id, { x, y })
          shown.get(id)?.group.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`)
        }
      }
      for (const [key, line] of lines) {
        const [login, repo] = key.split('\n')
        const from = places.get(`person:${login}`)
        const to = places.get(`repo:${repo}`)
        if (from && to) {
          line.setAttribute('x1', from.x.toFixed(1))
          line.setAttribute('y1', from.y.toFixed(1))
          line.setAttribute('x2', to.x.toFixed(1))
          line.setAttribute('y2', to.y.toFixed(1))
        }
      }
      travellers = travellers.filter((traveller) => {
        const progress = (now - traveller.start) / TRAVEL_MS
        const from = places.get(traveller.from)
        const to = places.get(traveller.to)
        if (progress >= 1 || !from || !to) {
          traveller.element.remove()

          return false
        }
        traveller.element.setAttribute('cx', (from.x + (to.x - from.x) * progress).toFixed(1))
        traveller.element.setAttribute('cy', (from.y + (to.y - from.y) * progress).toFixed(1))

        return true
      })
      if ((layout && layout.alpha > 0.002) || travellers.length) {
        run()
      }
    })
  }

  return {
    show,
    stop: () => {
      cancelAnimationFrame(frameRequest)
      frameRequest = 0
    },
  }
}

// A repository square grown or shrunk to a size, its label moved under it.
/**
 * @param {SVGGElement} group
 * @param {number} size
 */
function resizeSquare(group, size) {
  const square = group.querySelector('rect')
  for (const [name, value] of Object.entries({ x: -size, y: -size, width: 2 * size, height: 2 * size, rx: size * 0.35 })) {
    square?.setAttribute(name, String(value))
  }
  group.querySelector('text')?.setAttribute('y', String(size + RING_WIDTH + 11))
}
