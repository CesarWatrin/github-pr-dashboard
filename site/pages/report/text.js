// « Copier le bilan »: the report as text to paste in a chat or a meeting. Its figures as the table of the page, in a
// block of code (textTable()), which Google Chat and Slack show in a font whose characters all take the same width; a
// change in green or orange on the page gets a dot of that color after its row. Then its lists, *bold* titles and
// bullets, as they read them, and the link of the page. Figures without a value, such as the CI of a month GitHub had
// forgotten the runs of, are left out.

import { isMissing } from '../../domain/math.js'
import { capitalize, formatNumber, monthName } from '../../lib/format.js'
import { inContext, t } from '../../lib/i18n.js'
import { textTable } from '../../lib/text-table.js'
import { displayName, isCurrent } from '../../model/people.js'
import { ROUTES } from '../../model/routes.js'
import { amountOf } from '../../ui/badges.js'
import { projectLabel } from '../../ui/projects.js'

const REPORT_TONE_MARKS = { better: '🟢', worse: '🟠', neutral: '' }

// The figures of the report, by group, as on the page.
function reportTable({ month, previous, groups }) {
  const head = [
    t('Indicateur'),
    capitalize(monthName(month)),
    previous ? capitalize(monthName(previous)) : t('Mois précédent'),
    t('Évolution'),
    t('Médiane sur 12 mois'),
  ]

  return textTable(
    head,
    groups
      .map((group) => ({
        label: group.label.toLocaleUpperCase(),
        rows: group.rows
          .filter((row) => !isMissing(row.value))
          .map(({ figure, format, value, earlier, change, yearly }) => ({
            cells: [figure.label, format(value), format(earlier), change?.text ?? '–', format(yearly)],
            note: change ? REPORT_TONE_MARKS[change.tone] : '',
          })),
      }))
      .filter((group) => group.rows.length),
  )
}

/** @type {(label: string, value: string) => string} */
const bullet = (label, value) => `• ${t('{label} : {value}', { label, value })}`

/** @type {(pairs: [string, number][], name: (key: string) => string) => string} */
const pairsText = (pairs, name) => (pairs.length ? pairs.map(([key, count]) => `${name(key)} (${formatNumber(count)})`).join(', ') : t('aucun'))

export function reportText(content) {
  const { month, current, previous, person, projects } = content
  const title = t('Bilan de {month}', { month: monthName(month) })
  const lines = [
    `*${person ? t('{label} : {value}', { label: title, value: displayName(person) }) : title}*`,
    current
      ? t('Mois en cours, jusqu’à la dernière synchro : chiffres provisoires.')
      : previous
        ? t('Évolutions par rapport à {month}.', { month: monthName(previous) })
        : person
          ? t('Premier mois de la personne dans les données synchronisées.')
          : t('Premier mois complet des données synchronisées.'),
    '',
    '```',
    reportTable(content),
    '```',
  ]
  if (person) {
    lines.push(
      '',
      `*${t('Ses badges du mois')}*`,
      ...content.badges.map(({ badge, value, leads }) => {
        const amount = amountOf(value, badge.units, badge.format)

        return bullet(`${badge.icon} ${badge.name}`, leads ? t('{amount}, en tête de l’équipe', { amount }) : amount)
      }),
      '',
      `*${t('Ses dépôts les plus actifs')}*`,
      bullet(t('PR de code ouvertes'), pairsText(content.repos.code, String)),
      bullet(t('PR relues'), pairsText(content.repos.reviews, String)),
      '',
      `*${t('Ses binômes de review')}*`,
      bullet(t('Ses PR relues par'), pairsText(content.duos.reviewedBy, displayName)),
      bullet(t('A relu les PR de'), pairsText(content.duos.reviewed, displayName)),
    )
  } else {
    const name = (login) => (isCurrent(login) ? displayName(login) : t('une personne partie'))
    lines.push(
      '',
      `*${t('Champions du mois')}*`,
      ...content.champions.map(({ badge, leader }) =>
        bullet(
          `${badge.icon} ${badge.name}`,
          // « personne » is nobody here, not the noun of a count: its English has a key of its own.
          leader ? `${leader.people.map(name).join(', ')} (${amountOf(leader.value, badge.units, badge.format)})` : inContext('aucune', 'personne'),
        ),
      ),
      '',
      `*${t('Dépôts les plus actifs')}*`,
      bullet(t('PR de code ouvertes'), pairsText(content.repos.code, String)),
      bullet(t('Déploiements'), pairsText(content.repos.deployments, String)),
    )
  }
  if (projects.started.length || projects.delivered.length) {
    const projectLine = (label, rows) => bullet(label, rows.length ? rows.map(projectLabel).join(', ') : t('aucun'))
    lines.push('', `*${t('Projets du mois')}*`, projectLine(t('Démarrés'), projects.started), projectLine(t('Livrés'), projects.delivered))
  }
  if (!person && content.arrivals.length) {
    lines.push('', t('{label} : {value}', { label: `*${t('Arrivées')}*`, value: content.arrivals.map(({ login }) => displayName(login)).join(', ') }))
  }
  lines.push('', `${location.origin}${location.pathname}${ROUTES.report.hash}`)

  return lines.join('\n')
}
