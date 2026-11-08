// The cards of the findings of the analysis about the AC (domain/analysis/ac-rules.js): those that drag to their merge,
// and those that grow too big.

import { BIG_PR_LINES, SLOW_AC_HOURS } from '../../domain/analysis/thresholds.js'
import { formatDuration, formatNumber, formatShare, plural } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { repoLink } from '../../ui/links.js'
import { findingRows, sentence, strong } from './evidence.js'

// What each finding says from its facts, as FINDINGS of findings.js reads it.
export const AC_FINDINGS = {
  slowAcs: {
    area: t('Améliorations continues'),
    title: () => t('Les AC traînent avant leur merge'),
    text: ({ count, medianHours }) =>
      sentence('Les {count} livrées sur la période ont mis {hours} en médiane de leur première PR à leur merge dans develop : une AC se veut petite et rapide, et dès {limit} elle traîne.', {
        count: plural(count, 'AC', 'AC'),
        hours: strong(formatDuration(medianHours)),
        limit: formatDuration(SLOW_AC_HOURS),
      }),
    evidence: ({ repositories }) =>
      findingRows(
        t('Les dépôts où elles mettent le plus de temps'),
        repositories.map(({ repo, acs, value }) => ({ name: repoLink(repo), figures: t('{value} en médiane sur {count}', { value: formatDuration(value), count: plural(acs, 'AC', 'AC') }) })),
      ),
    action: () => t('Découper une AC en plusieurs petites, chacune livrée seule, et la relire dans la journée : ce qui reste longtemps ouvert relève plutôt d’un projet.'),
    route: 'acs',
  },
  bigAcs: {
    area: t('Améliorations continues'),
    title: () => t('Des AC trop grosses'),
    text: ({ count, big, share, medianLines }) =>
      sentence('{share} des AC livrées sur la période changent {lines} lignes ou plus, soit {big} sur {count}, pour une taille médiane de {median} lignes.', {
        share: strong(formatShare(share)),
        lines: formatNumber(BIG_PR_LINES),
        big: formatNumber(big),
        count: formatNumber(count),
        median: formatNumber(Math.round(medianLines)),
      }),
    evidence: ({ repositories }) =>
      findingRows(
        t('Les dépôts où elles sont le plus souvent grosses'),
        repositories.map(({ repo, acs, value }) => ({ name: repoLink(repo), figures: t('{share} de {count}', { share: formatShare(value), count: plural(acs, 'AC', 'AC') }) })),
      ),
    action: () => t('Une grosse AC est un projet qui ne dit pas son nom : la mener sur une branche project/…, ou la découper en AC qui se relisent d’une traite.'),
    route: 'acs',
  },
}

// Each rule, in the list of those that found nothing.
export const AC_RULE_LABELS = {
  slowAcs: t('AC qui traînent avant leur merge'),
  bigAcs: t('AC trop grosses'),
}
