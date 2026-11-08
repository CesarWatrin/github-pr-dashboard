// The cards of the findings of the analysis about the projects (domain/analysis/project-rules.js): those that stalled,
// and those that wait long for their delivery once their code is done.

import { SLOW_INTEGRATION_HOURS } from '../../domain/analysis/thresholds.js'
import { STALLED_AFTER_DAYS } from '../../domain/projects.js'
import { formatDuration, formatNumber, plural } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { formatDay, projectLink } from '../../ui/projects.js'
import { findingRows, sentence, strong } from './evidence.js'

// What each finding says from its facts, as FINDINGS of findings.js reads it.
export const PROJECT_FINDINGS = {
  stalledProjects: {
    area: t('Projets'),
    title: () => t('Des projets à l’arrêt'),
    text: ({ count, total, open }) => [
      ...sentence('{count} sur {total} dont la vie croise la période ne sont pas livrés et n’ont plus bougé depuis {days} jours : ni PR, ni review, ni merge.', {
        count: strong(plural(count, 'projet')),
        total: formatNumber(total),
        days: formatNumber(STALLED_AFTER_DAYS),
      }),
      open > 0 ? ` ${t('Il leur reste {prs} ouvertes.', { prs: plural(open, 'PR de code', 'PR de code') })}` : '',
    ],
    evidence: ({ projects }) =>
      findingRows(
        t('Les projets à l’arrêt depuis le plus longtemps'),
        projects.map((project) => ({
          name: projectLink(project),
          figures: project.open
            ? t('dernière activité le {date}, {prs} ouvertes', { date: formatDay(project.lastActivity), prs: plural(project.open, 'PR', 'PR') })
            : t('dernière activité le {date}', { date: formatDay(project.lastActivity) }),
        })),
      ),
    action: () => t('Trancher pour chacun : le reprendre, livrer ce qui est prêt, ou l’abandonner et fermer sa branche, pour que le code ne vieillisse pas à part.'),
    route: 'projects',
  },
  integration: {
    area: t('Projets'),
    title: () => t('Les projets attendent leur livraison'),
    text: ({ count, medianHours }) =>
      sentence('Une fois leur dernière PR de code mergée, les {count} livrés sur la période ont attendu {hours} en médiane avant que leur branche soit mergée dans une branche principale : {limit} ou plus, c’est une livraison qui traîne.', {
        count: plural(count, 'projet'),
        hours: strong(formatDuration(medianHours)),
        limit: formatDuration(SLOW_INTEGRATION_HOURS),
      }),
    evidence: ({ projects }) =>
      findingRows(
        t('Les intégrations les plus longues'),
        projects.map((project) => ({ name: projectLink(project), figures: t('{value} d’intégration', { value: formatDuration(project.integrationHours) }) })),
      ),
    action: () =>
      t('Regarder ce qui retient la branche une fois le code fini : une recette, une date de mise en prod, des conflits avec develop. La merger plus souvent dans develop raccourcit la dernière marche.'),
    route: 'projects',
  },
}

// Each rule, in the list of those that found nothing.
export const PROJECT_RULE_LABELS = {
  stalledProjects: t('Projets à l’arrêt'),
  integration: t('Projets qui attendent leur livraison'),
}
