// The film of the map page: the code pull requests of the period replayed day after day, who opens, reviews and
// merges what, and the repositories growing with the lines merged into them. Play, pause, and a slider through time.

import { DAY_MS } from '../../domain/time.js'
import { formatNumber, plural, rangeLongFormat, rangeShortFormat } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { displayName } from '../../model/people.js'
import { repoInfo } from '../../model/repositories.js'
import { createReplay, REPLAY_TRAIL_DAYS, replayEvents } from '../../model/replay.js'
import { periodRange, periodTitle } from '../../model/selection.js'
import { scopedRecords, squadKey } from '../../model/squads.js'
import { loadedStats } from '../../model/state.js'
import { replayGraph } from '../../ui/charts/replay-graph.js'
import { $, el } from '../../ui/dom.js'
import { personNode, personNote, typeColor } from './nodes.js'

const DAY_MINUTES = DAY_MS / 60_000
// The speeds offered, in days of the period per second; the one picked at first plays the period in about FILM_SECONDS.
const SPEEDS = [1, 3, 7, 14, 30]
const FILM_SECONDS = 30
// The events the feed lists, the latest first.
const FEED_EVENTS = 6

const ACTIONS = { opened: t('a ouvert'), reviewed: t('a relu'), merged: t('a mergé') }

// The film: what it replays (the period and squad it was made for), where it stands, and whether it plays.
let film = {
  key: '',
  start: 0,
  end: 0,
  at: 0,
  speed: SPEEDS[0],
  playing: false,
  /** @type {ReturnType<typeof createReplay> | null} */
  replay: null,
  maxAdded: 0,
}
/** @type {ReturnType<typeof replayGraph>} */
let graph = null
let lastTick = 0
let tickRequest = 0

const minutesDate = (/** @type {number} */ minutes) => new Date(minutes * 60_000)

// Draws the film for the period and squad picked: a new period or squad starts a new one, shown at its end, paused; a
// new width draws the same one again where it stands.
/** @param {(login: string) => import('../../model/repositories.js').Stack} stackFor */
export function renderReplay(stackFor) {
  const range = periodRange()
  const key = `${loadedStats().generatedAt}:${range.start}:${range.end}:${squadKey()}`
  if (key !== film.key) {
    const replay = createReplay(replayEvents(scopedRecords(), range))
    const [start, end] = [range.start / 60_000, range.end / 60_000]
    const last = replay.frame(end)
    const days = (end - start) / DAY_MINUTES
    film = {
      key,
      start,
      end,
      at: end,
      speed: SPEEDS.reduce((best, speed) => (Math.abs(days / speed - FILM_SECONDS) < Math.abs(days / best - FILM_SECONDS) ? speed : best)),
      playing: false,
      replay,
      maxAdded: Math.max(0, ...[...last.repos.values()].map((repo) => repo.added)),
    }
    renderSpeeds()
  }
  const replay = /** @type {ReturnType<typeof createReplay>} */ (film.replay)
  graph?.stop()
  graph = replayGraph($('[data-map-replay]'), {
    replay,
    maxAdded: film.maxAdded,
    trailMinutes: REPLAY_TRAIL_DAYS * DAY_MINUTES,
    ariaLabel: t('Les PR de code rejouées jour après jour, {period}', { period: periodTitle() }),
    details: $('[data-map-replay-details]'),
    hint: t('Survoler un rond ou un carré pour voir ses chiffres à ce moment'),
    person: (login) => personNode(login, 1, stackFor),
    repository: (repo) => ({ id: `repo:${repo}`, label: repo, value: 1, fill: typeColor(repoInfo(repo).category) }),
    personDetails: (login, frame) => {
      const repos = [...frame.links.values()].filter((link) => link.login === login).map((link) => link.repo)

      return {
        title: displayName(login),
        rows: [{ value: formatNumber(repos.length), label: repos.length > 1 ? t('dépôts touchés ces 30 derniers jours') : t('dépôt touché ces 30 derniers jours') }],
        note: [repos.slice(0, 4).join(', '), personNote(login, stackFor)].filter(Boolean).join(' · ') || null,
      }
    },
    repositoryDetails: (repo, frame) => {
      const counts = frame.repos.get(repo) ?? { opened: 0, added: 0 }

      return {
        title: repo,
        rows: [
          { value: formatNumber(counts.opened), label: t('PR de code ouvertes depuis le début') },
          { value: formatNumber(counts.added), label: t('lignes ajoutées par ses PR mergées') },
        ],
      }
    },
  })
  const slider = $('[data-replay-slider]', HTMLInputElement)
  Object.assign(slider, { min: String(film.start), max: String(film.end), step: String(DAY_MINUTES / 4) })
  showAt(film.at)
  renderPlayButton()
}

function pause() {
  film.playing = false
  renderPlayButton()
  cancelAnimationFrame(tickRequest)
  tickRequest = 0
}

// The film stops when its page hides: nothing plays out of sight.
export function pauseReplay() {
  if (film.playing) {
    pause()
  }
  graph?.stop()
}

// Shows a moment of the film: the network, the slider, the date and totals, and the latest events.
/** @param {number} at */
function showAt(at) {
  film.at = Math.min(film.end, Math.max(film.start, at))
  const frame = graph?.show(film.at) ?? film.replay?.frame(film.at)
  if (!frame) {
    return
  }
  $('[data-replay-slider]', HTMLInputElement).value = String(film.at)
  $('[data-replay-date]').textContent = rangeLongFormat.format(minutesDate(film.at))
  $('[data-replay-totals]').textContent = [
    plural(frame.totals.opened, 'PR ouverte', 'PR ouvertes'),
    plural(frame.totals.merged, 'PR mergée', 'PR mergées'),
    t('{count} lignes ajoutées', { count: formatNumber(frame.totals.added) }),
  ].join(' · ')
  $('[data-replay-feed]').replaceChildren(
    ...frame.recent
      .slice(-FEED_EVENTS)
      .reverse()
      .map((event) =>
        el(
          'li',
          { className: `replay-event is-${event.kind}` },
          el('time', { textContent: rangeShortFormat.format(minutesDate(event.at)) }),
          document.createTextNode(` ${displayName(event.login)} ${ACTIONS[event.kind]} ${event.repo}#${event.number}`),
        ),
      ),
  )
}

// Each animation frame moves the film forward by the time passed at its speed, until its end.
/** @param {number} now */
function tick(now) {
  tickRequest = 0
  if (!film.playing) {
    return
  }
  const seconds = lastTick ? Math.min(0.1, (now - lastTick) / 1000) : 0
  lastTick = now
  showAt(film.at + seconds * film.speed * DAY_MINUTES)
  if (film.at >= film.end) {
    film.playing = false
    renderPlayButton()

    return
  }
  tickRequest = requestAnimationFrame(tick)
}

function play() {
  // At its end, the film starts again from the beginning.
  if (film.at >= film.end) {
    showAt(film.start)
  }
  film.playing = true
  lastTick = 0
  renderPlayButton()
  cancelAnimationFrame(tickRequest)
  tickRequest = requestAnimationFrame(tick)
}

function renderPlayButton() {
  const button = $('[data-replay-play]', HTMLButtonElement)
  button.setAttribute('aria-pressed', String(film.playing))
  $('[data-replay-play-label]').textContent = film.playing ? t('Pause') : t('Lecture')
}

function renderSpeeds() {
  const select = $('[data-replay-speed]', HTMLSelectElement)
  select.replaceChildren(
    ...SPEEDS.map((speed) => new Option(speed === 1 ? t('1 jour par seconde') : t('{count} jours par seconde', { count: formatNumber(speed) }), String(speed))),
  )
  select.value = String(film.speed)
}

// Listens to the controls of the film: play and pause, the slider, the speed.
export function setupReplay() {
  $('[data-replay-play]').addEventListener('click', () => (film.playing ? pause() : play()))
  $('[data-replay-slider]').addEventListener('input', (event) => showAt(Number(/** @type {HTMLInputElement} */ (event.target).value)))
  $('[data-replay-speed]').addEventListener('change', (event) => {
    film.speed = Number(/** @type {HTMLSelectElement} */ (event.target).value)
  })
}
