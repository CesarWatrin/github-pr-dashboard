// The line of a card (a person, a squad, a repository) that counts the AC delivered and the hotfixes opened over the
// period, under the line of its projects.

import { plural } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { el } from './dom.js'

// « 12 AC livrées · 3 hotfix », what is not zero; none when both are.
/** @param {{ acs?: number, hotfixes?: number }} counts */
export function workLine({ acs = 0, hotfixes = 0 }) {
  const parts = [...(acs ? [plural(acs, 'AC livrée', 'AC livrées')] : []), ...(hotfixes ? [plural(hotfixes, 'hotfix', 'hotfix')] : [])]

  return parts.length
    ? [el('p', { className: 'work-line', textContent: parts.join(' · '), title: t('Améliorations continues livrées et hotfix ouverts sur la période') })]
    : []
}
