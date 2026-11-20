// Performance annuelle: each developer over the last twelve whole months (site/domain/review.js), for the managers only. The
// page asks for their password (MANAGER_PASSWORD) and opens for 30 days on the browser it was typed in; its link, last
// in the sidebar, shows a padlock open meanwhile. Then the recommendations, whether the gaps between people are real,
// the effort of everyone, the ranking, the squads, a dossier per person, those too new to judge and how to read it all.

import { isManagerPassword } from '../../domain/manager.js'
import { formatDecimal, formatDuration, formatNumber, formatShare, monthName } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { displayName } from '../../model/people.js'
import { currentReview } from '../../model/review.js'
import { currentRoute } from '../../model/routes.js'
import { managerUnlocked, state, storeManager } from '../../model/state.js'
import { $, el, svg } from '../../ui/dom.js'
import { askToOpen, OPEN_PERSON, personLink } from '../../ui/links.js'
import { dossier } from './dossier.js'
import { effortChart, setupEffortChart } from './effort-chart.js'
import { GROUPS, groupOf, PROFILE_LABELS, stackOf } from './words.js'

/** @typedef {import('../../domain/review.js').TeamReview} TeamReview */
/** @typedef {import('../../domain/review.js').ReviewedPerson} ReviewedPerson */

/** @param {number} value */
const one = (value) => formatDecimal(Math.round(value * 10) / 10)

// The columns of the ranking: what each reads, how it sorts.
/** @type {{ key: string, label: string, text?: boolean, sort: (person: ReviewedPerson) => number | string, cell: (person: ReviewedPerson) => Node | string }[]} */
const COLUMNS = [
  { key: 'name', label: t('Personne'), text: true, sort: (person) => displayName(person.login).toLowerCase(), cell: (person) => dossierButton(person, 'review-name') },
  {
    key: 'group',
    label: t('Niveau'),
    text: true,
    sort: (person) => GROUPS.findIndex((group) => group.key === groupOf(person)),
    cell: (person) => el('span', { className: `review-pill is-${groupOf(person)}`, textContent: GROUPS.find((group) => group.key === groupOf(person))?.label ?? '' }),
  },
  {
    key: 'profile',
    label: t('Stack'),
    text: true,
    sort: (person) => `${person.profile === 'Build' ? 'a' : person.profile === 'Mixte' ? 'b' : 'c'} ${stackOf(person)}`,
    cell: (person) =>
      el(
        'span',
        { className: 'review-work' },
        stackOf(person),
        ...(person.profile === 'Build' ? [] : [el('span', { className: 'review-tag is-tma', textContent: PROFILE_LABELS[person.profile] })]),
      ),
  },
  { key: 'overall', label: t('Note'), sort: (person) => person.overall, cell: (person) => el('strong', { textContent: String(person.overall) }) },
  { key: 'productivity', label: t('Productivité'), sort: (person) => person.marks.productivity, cell: (person) => meter(person.marks.productivity) },
  { key: 'efficiency', label: t('Efficacité'), sort: (person) => person.marks.efficiency, cell: (person) => meter(person.marks.efficiency) },
  { key: 'collaboration', label: t('Collaboration'), sort: (person) => person.marks.collaboration, cell: (person) => meter(person.marks.collaboration) },
  { key: 'importance', label: t('Importance'), sort: (person) => person.marks.importance, cell: (person) => meter(person.marks.importance) },
  {
    key: 'delivered',
    label: t('Livré par mois'),
    sort: (person) => person.deliveredMean,
    cell: (person) => t('{count} unités', { count: one(person.deliveredMean) }),
  },
  { key: 'reviews', label: t('Relues par mois'), sort: (person) => person.reviewsMean, cell: (person) => formatNumber(Math.round(person.reviewsMean)) },
  { key: 'presence', label: t('Présence'), sort: (person) => person.presence, cell: (person) => formatShare(person.presence) },
]
let sort = { key: 'overall', direction: -1 }

// A person's name that opens their dossier, in the dialog of the review.
/**
 * @param {ReviewedPerson} person
 * @param {string} className
 */
function dossierButton(person, className) {
  const button = el('button', { type: 'button', className, textContent: displayName(person.login) })
  button.setAttribute('aria-haspopup', 'dialog')
  button.addEventListener('click', () => openDossier(person, button))

  return button
}

// The dossier of a person, in a dialog over the page: closed by its button, Escape or the backdrop.
/**
 * @param {ReviewedPerson} person
 * @param {HTMLElement} opener
 */
function openDossier(person, opener) {
  const dialog = $('[data-review-dialog]', HTMLDialogElement)
  const close = el('button', { type: 'button', className: 'icon-button review-dialog-close', title: t('Fermer') }, svg('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true' }))
  close.firstChild?.appendChild(svg('path', { d: 'M4 4l8 8M12 4l-8 8' }))
  close.setAttribute('aria-label', t('Fermer'))
  close.addEventListener('click', () => dialog.close())
  $('[data-review-dialog-card]').replaceChildren(close, dossier(person, currentReview()))
  dialog.addEventListener('close', () => opener.isConnected && opener.focus(), { once: true })
  if (!dialog.open) {
    dialog.showModal()
  }
  dialog.scrollTop = 0
}

/** @param {number} value */
function meter(value) {
  const bar = el('i')
  bar.style.width = `${value}%`

  return el('span', { className: 'review-meter' }, el('span', { textContent: String(value) }), el('span', { className: 'review-meter-bar' }, bar))
}

// The link of the sidebar: shown once the stats carry the managers' password, its padlock open while this browser opens
// the page.
export function renderReviewLink() {
  const link = $('[data-review-link]')
  link.hidden = !state.stats?.manager
  link.classList.toggle('is-unlocked', managerUnlocked())
}

export function renderReview() {
  renderReviewLink()
  const unlocked = managerUnlocked()
  $('[data-review-gate]').hidden = unlocked
  $('[data-review-content]').hidden = !unlocked
  // Worked out only for the managers, and when the page shows.
  if (!unlocked || !state.stats || currentRoute() !== 'review') {
    return
  }
  const review = currentReview()
  $('[data-review-period]').textContent = t(
    'De {from} à {to} : {people} personnes évaluées, {others} avec trop peu de recul. Tout vient de l’activité GitHub : PR, reviews et merges.',
    { from: monthName(review.months[0]), to: monthName(/** @type {string} */ (review.months.at(-1))), people: review.people.length, others: review.others.length },
  )
  renderBoard(review)
  renderFacts(review)
  $('[data-review-effort]').replaceChildren(...effortChart(review, dossierButton))
  renderTable(review)
  renderSquadTable(review)
  renderMethod()
}

/** @param {TeamReview} review */
function renderBoard(review) {
  $('[data-review-board]').replaceChildren(
    ...GROUPS.flatMap((group) => {
      const people = review.people.filter((person) => groupOf(person) === group.key)

      return people.length
        ? [
            el(
              'div',
              { className: `review-lane is-${group.key}` },
              el('h3', {}, el('span', { textContent: group.label }), el('span', { textContent: String(people.length) })),
              el('p', { textContent: group.hint }),
              el(
                'div',
                { className: 'review-chips' },
                ...people.map((person) => dossierButton(person, 'review-chip')),
              ),
            ),
          ]
        : []
    }),
    // Those too new to judge, or with too little code: their figures on hover, their card on a click.
    ...(review.others.length
      ? [
          el(
            'div',
            { className: 'review-lane is-short' },
            el('h3', {}, el('span', { textContent: t('Trop peu de recul') }), el('span', { textContent: String(review.others.length) })),
            el('p', { textContent: t('Arrivée récente ou activité de code marginale : pas de niveau.') }),
            el(
              'div',
              { className: 'review-chips' },
              ...review.others.map((person) => {
                const chip = el('button', {
                  type: 'button',
                  className: 'review-chip',
                  textContent: displayName(person.login),
                  title: t('{months} mois évalués, {code} PR de code dont {merged} mergées, {reviewed} PR relues, {tma} de TMA.', {
                    months: person.months,
                    code: person.code,
                    merged: person.merged,
                    reviewed: person.reviewed,
                    tma: formatShare(person.hotfixShare),
                  }),
                })
                chip.setAttribute('aria-haspopup', 'dialog')
                chip.addEventListener('click', () => askToOpen(chip, OPEN_PERSON, person.login))

                return chip
              }),
            ),
          ),
        ]
      : []),
  )
}

/** @param {TeamReview} review */
function renderFacts(review) {
  const { differences } = review
  /** @type {[string, string][]} */
  const facts = []
  if (differences) {
    facts.push([
      differences.units.p < 0.01 ? t('Oui, nettement') : differences.units.p < 0.05 ? t('Oui') : t('Pas clairement'),
      t('Sur ce que chacun livre par mois, les écarts entre personnes sont {how} que le hasard d’un mois à l’autre (test de Kruskal-Wallis, p = {p}).', {
        how: differences.units.p < 0.05 ? t('bien plus grands') : t('à peine plus grands'),
        p: differences.units.p < 0.001 ? '< 0,001' : formatDecimal(Math.round(differences.units.p * 1000) / 1000),
      }),
    ])
    facts.push([
      formatShare(differences.unitsShare),
      t('des écarts de livraison d’un mois sur l’autre viennent de la personne, le reste des sujets du mois, des congés, des projets. Sur la review, c’est {share} : chacun s’y implique à un niveau très stable.', {
        share: formatShare(differences.reviewsShare),
      }),
    ])
    if (differences.spread) {
      facts.push([`×${one(differences.spread)}`, t('entre ceux qui livrent le plus et ceux qui livrent le moins (15e et 85e centiles).')])
    }
    for (const [category, test] of Object.entries(differences.byCategory)) {
      facts.push([
        t('{category} : {verdict}', { category, verdict: test.p < 0.05 ? t('écarts réels') : t('pas d’écart net') }),
        t('Entre les {count} personnes {category} évaluées, p = {p}.', {
          count: test.people,
          category,
          p: test.p < 0.001 ? '< 0,001' : formatDecimal(Math.round(test.p * 1000) / 1000),
        }),
      ])
    }
  }
  if (typeof review.workShare === 'number') {
    facts.push([
      formatShare(review.workShare),
      t('de l’activité GitHub tombe entre 9 h et 18 h, du lundi au vendredi : les plus productifs livrent plus dans le même temps, pas en faisant des heures.'),
    ])
  }
  $('[data-review-facts]').replaceChildren(
    ...facts.map(([value, text]) => el('div', { className: 'review-fact' }, el('strong', { textContent: value }), el('p', { textContent: text }))),
  )
}

/** @param {TeamReview} review */
function renderTable(review) {
  const column = COLUMNS.find((item) => item.key === sort.key) ?? COLUMNS[3]
  const rows = review.people.toSorted((a, b) => {
    const x = column.sort(a)
    const y = column.sort(b)

    return (typeof x === 'string' ? x.localeCompare(String(y)) : x - Number(y)) * sort.direction
  })
  const head = el(
    'tr',
    {},
    ...COLUMNS.map((item) => {
      const button = el('button', { type: 'button', className: 'review-sort', textContent: item.label + (item.key === sort.key ? (sort.direction < 0 ? ' ↓' : ' ↑') : '') })
      button.addEventListener('click', () => {
        sort = { key: item.key, direction: sort.key === item.key ? -sort.direction : item.text ? 1 : -1 }
        renderTable(review)
      })
      const cell = el('th', { className: item.text ? 'text' : '' }, button)
      if (item.key === sort.key) {
        cell.setAttribute('aria-sort', sort.direction < 0 ? 'descending' : 'ascending')
      }

      return cell
    }),
  )
  $('[data-review-table]').replaceChildren(
    el(
      'table',
      { className: 'review-table' },
      el('thead', {}, head),
      el('tbody', {}, ...rows.map((person) => el('tr', {}, ...COLUMNS.map((item) => el('td', { className: item.text ? 'text' : '' }, item.cell(person)))))),
    ),
  )
}

/** @param {TeamReview} review */
function renderSquadTable(review) {
  $('[data-review-squads-card]').hidden = review.squads.length === 0
  const names = [t('Squad'), t('Chef'), t('Membres évalués'), t('Livré par membre et par mois'), t('Relues par membre et par mois'), t('Délai de merge médian'), t('Mergées sans review'), t('Part de TMA'), t('Résultat')]
  $('[data-review-squads]').replaceChildren(
    el(
      'table',
      { className: 'review-table' },
      el('thead', {}, el('tr', {}, ...names.map((name, index) => el('th', { className: index < 2 ? 'text' : '', textContent: name })))),
      el(
        'tbody',
        {},
        ...review.squads
          .toSorted((a, b) => b.mark - a.mark)
          .map((squad) =>
            el(
              'tr',
              {},
              el('td', { className: 'text', textContent: squad.name }),
              el('td', { className: 'text' }, squad.lead ? personLink(squad.lead) : '–'),
              el('td', { textContent: String(squad.members) }),
              el('td', { textContent: t('{count} unités', { count: one(squad.unitsPerMember) }) }),
              el('td', { textContent: formatNumber(Math.round(squad.reviewsPerMember)) }),
              el('td', { textContent: formatDuration(squad.mergeHours) }),
              el('td', { textContent: formatShare(squad.unreviewedShare) }),
              el('td', { textContent: formatShare(squad.hotfixShare) }),
              el('td', {}, meter(squad.mark)),
            ),
          ),
      ),
    ),
  )
}

function renderMethod() {
  const items = [
    t('Stack et TMA. La stack (front, back, mobile, full-stack) se lit comme sur la page Équipe. Selon la part de hotfixes dans ses PR de code, chacun est TMA à partir de 50 %, en TMA partielle de 30 à 50 %, hors TMA en dessous. Ce profil informe, il ne change pas la mesure : chacun est jugé sur tout son travail, projets, AC, TMA et le reste, face à toute l’équipe.'),
    t('Livraison. Chaque PR mergée de projet, d’AC ou du reste compte selon sa taille, sur une échelle logarithmique : 100 lignes valent une unité, 10 lignes une demie, 1 000 lignes une et demie. Le code généré ou importé ne gonfle donc pas les chiffres. Un hotfix, petit mais tout aussi prenant, compte pour ce qu’un mois de TMA vaut un mois de construction : les unités par mois des devs hors TMA pour les hotfixes par mois des devs TMA, en médiane. Un mois de TMA pèse ainsi comme un mois de projets, et chacun est jugé sur tout son travail.'),
    t('Fiabilité. Chaque moyenne mensuelle a son intervalle de confiance à 95 %, tiré des mois eux-mêmes (bootstrap). Au-dessus ou en dessous de l’équipe veut dire que tout l’intervalle est au-dessus ou en dessous de sa médiane : l’écart ne tient pas à un ou deux mois atypiques.'),
    t('Heures ouvrées. Chaque délai ne compte que les heures de 9 h à 18 h, du lundi au vendredi, heure de Paris. Une journée vaut 9 heures : « 2,5 j » veut dire deux journées et demie de travail, pas de calendrier. Les jours actifs comptent les jours ouvrés, fériés retirés, où la personne a fait au moins une action sur GitHub : un plancher, une journée de réunions ou de spécifications n’y laisse pas de trace.'),
    t('Les quatre notes sont des rangs de 0 à 100. Productivité : ce qu’elle livre par mois, tout son travail compris, face à toute l’équipe. Efficacité : délai de merge, PR abandonnées, merges sans review, checks en échec, régularité. Collaboration : PR relues par mois, commentaires, personnes qui dépendent de ses reviews, réactivité. Importance : sa part du code, des reviews et de la TMA de l’équipe, les dépôts qui reposent sur elle, ses projets et AC, les PR des autres qu’elle merge.'),
    t('Note globale : 35 % de productivité, 25 % de collaboration, 25 % d’importance, 15 % d’efficacité. Pour un chef de squad, la productivité ne compte que pour 15 %, l’efficacité pour 10 %, et le résultat de sa squad pour 25 %. Au-delà de 25 % de PR mergées sans review, le niveau ne dépasse pas « conforme aux attentes » tant que ce n’est pas corrigé.'),
    t('Niveau : bien au-delà des attentes à partir de 72, au-dessus des attentes à partir de 58, conforme aux attentes à partir de 42, en dessous des attentes sous 42.'),
    t('Limites. GitHub ne voit ni la difficulté d’un sujet, ni l’aide donnée à l’oral, ni les spécifications, l’astreinte ou les réunions. Cette page objective et prépare les entretiens, elle ne remplace pas l’avis des chefs de squad.'),
    t('Les chiffres viennent des PR que toute l’équipe peut lire sur le dashboard : le mot de passe des managers cache la page, pas les données.'),
  ]
  $('[data-review-method]').replaceChildren(...items.map((text) => el('li', { textContent: text })))
}

// The managers' password: checked against the verifier of the stats, then remembered here for 30 days. The
// password itself is kept nowhere.
/** @param {{ render: () => void }} options */
export function setupReview({ render }) {
  const form = $('[data-review-form]', HTMLFormElement)
  const field = $('[data-review-password]', HTMLInputElement)
  const error = $('[data-review-error]')
  const dialog = $('[data-review-dialog]', HTMLDialogElement)
  // A click on the backdrop, outside the card, closes the dossier.
  dialog.addEventListener('click', (event) => event.target === dialog && dialog.close())
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const check = state.stats?.manager
    if (!check || !field.value) {
      return
    }
    error.textContent = ''
    form.setAttribute('aria-busy', 'true')
    const right = await isManagerPassword(field.value, check)
    form.removeAttribute('aria-busy')
    field.value = ''
    if (!right) {
      error.textContent = t('Mot de passe incorrect.')
      field.focus()
      return
    }
    storeManager(check.verifier)
    render()
  })
  setupEffortChart(render)
  $('[data-review-lock]').addEventListener('click', () => {
    storeManager(null)
    render()
    field.focus()
  })
}

