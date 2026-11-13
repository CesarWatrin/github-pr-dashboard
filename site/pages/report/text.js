// « Copier le bilan »: the report as text to paste in a chat or a meeting, *bold* titles and bullets as Google Chat and
// Slack read them. Under what the month is set against, as the page says it, a line per figure with the values of the
// page: the month in bold, the month before and the change, a dot of its color when the page shows it in green or
// orange, and the median of the year. Then its lists and the link of the page. Figures without a value, such as the CI
// of a month GitHub had forgotten the runs of, are left out.

import { isMissing } from '../../domain/math.js'
import { capitalize, formatNumber, monthName } from '../../lib/format.js'
import { inContext, t } from '../../lib/i18n.js'
import { displayName, isCurrent } from '../../model/people.js'
import { ROUTES } from '../../model/routes.js'
import { amountOf } from '../../ui/badges.js'
import { projectLabel } from '../../ui/projects.js'

const REPORT_TONE_MARKS = { better: ' 🟢', worse: ' 🟠', neutral: '' }

/** @type {(label: string, value: string) => string} */
const bullet = (label, value) => `• ${t('{label} : {value}', { label, value })}`

/** @type {(pairs: [string, number][], name: (key: string) => string) => string} */
const pairsText = (pairs, name) => (pairs.length ? pairs.map(([key, count]) => `${name(key)} (${formatNumber(count)})`).join(', ') : t('aucun'))

// « PR ouvertes : *24*, contre 17 (+41 %) · médiane 14 », each part only when it has a value.
function figureLine({ figure, format, value, earlier, change, yearly }) {
  let text = `*${format(value)}*`
  if (!isMissing(earlier)) {
    text = t('{value}, contre {earlier}', { value: text, earlier: format(earlier) })
    if (change) {
      text += ` (${change.text}${REPORT_TONE_MARKS[change.tone]})`
    }
  }
  if (!isMissing(yearly)) {
    text += ` · ${t('médiane {value}', { value: format(yearly) })}`
  }

  return bullet(figure.label, text)
}

export function reportText(content) {
  const { month, person, sub, groups, projects } = content
  // « Bilan du mois : Octobre 2026 · Ada Lune », without « de » before a month that starts with a vowel.
  const shown = capitalize(monthName(month))
  const lines = [`*${t('{label} : {value}', { label: t('Bilan du mois'), value: person ? `${shown} · ${displayName(person)}` : shown })}*`, `${sub}.`]
  for (const group of groups) {
    const rows = group.rows.filter((row) => !isMissing(row.value))
    if (rows.length) {
      lines.push('', `*${group.label}*`, ...rows.map(figureLine))
    }
  }
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
