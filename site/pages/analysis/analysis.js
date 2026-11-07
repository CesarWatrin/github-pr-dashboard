// Analyse: what stands out of the period, worked out when the page shows.

import { analyze } from '../../domain/analysis.js'
import { capitalize, plural } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { isCurrent } from '../../model/people.js'
import { currentRoute } from '../../model/routes.js'
import { periodRange, periodTitle } from '../../model/selection.js'
import { scopedRecords, squadKey } from '../../model/squads.js'
import { state } from '../../model/state.js'
import { $, el } from '../../ui/dom.js'
import { findingCard, RULE_LABELS } from './findings.js'

// The findings of analyze() for the period, worked out once per stats and range: the page only reads them when it shows.
function currentAnalysis() {
  const range = periodRange()
  const key = `${range.start}:${range.end}:${squadKey()}`
  if (state.analysisCache?.stats !== state.stats || state.analysisCache.key !== key) {
    state.analysisCache = { stats: state.stats, key, analysis: analyze(scopedRecords(), state.stats.ci ?? [], { ...range, isCurrent }) }
  }

  return state.analysisCache.analysis
}

export function renderAnalysis() {
  if (!state.stats || currentRoute() !== 'analysis') {
    return
  }
  const { findings, clear, few } = currentAnalysis()
  const urgent = findings.filter((finding) => finding.level === 'high').length
  const issues = findings.filter((finding) => finding.level !== 'good').length
  $('[data-analysis-title]').textContent = capitalize(periodTitle())
  const counts = { findings: plural(issues, 'constat'), urgent: plural(urgent, 'prioritaire'), rules: plural(Object.keys(RULE_LABELS).length, 'règle') }
  $('[data-analysis-sub]').textContent = issues
    ? urgent
      ? t('{findings}, dont {urgent}, sur {rules} vérifiées', counts)
      : t('{findings}, sur {rules} vérifiées', counts)
    : t('Rien ne ressort sur la période')
  $('[data-findings]').replaceChildren(...findings.map(findingCard))
  $('[data-analysis-clear-card]').hidden = clear.length + few.length === 0
  $('[data-analysis-clear]').replaceChildren(
    ...clear.map((key) => el('li', {}, el('span', { className: 'analysis-check', textContent: '✓', ariaHidden: 'true' }), RULE_LABELS[key])),
    ...few.map((key) =>
      el('li', { className: 'is-few' }, el('span', { className: 'analysis-check', textContent: '–', ariaHidden: 'true' }), t('{rule} : pas assez de PR ou d’exécutions sur la période', { rule: RULE_LABELS[key] })),
    ),
  )
}
