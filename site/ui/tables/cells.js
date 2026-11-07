// Cells shared by the tables: lines added and deleted, stack, repository, technologies.

import { formatLines, formatNumber, formatShare, plural } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import {
  CATEGORIES,
  STACK_CATEGORIES,
  STACK_TECHNOLOGIES,
  stackType,
  topTechnologies,
} from '../../model/repositories.js'
import { el } from '../dom.js'
import { technologyIcon } from '../icons.js'
import { repoLink } from '../links.js'
import { bindTooltip, hideTooltip, showTooltip } from '../tooltip.js'

// Lines added over lines deleted, one above the other like a diff, rounded: narrow enough for the tables to fit.
export const LINES_COLUMN = {
  key: 'added',
  label: t('Lignes'),
  cell: (row) => linesCell(row),
  hint: t('Lignes ajoutées (+) et supprimées (−) par les PR mergées, au total, arrondies (k : milliers, M : millions). Le tri suit les lignes ajoutées.'),
}

export const formatTechnologyShare = (value) => (value < 0.01 ? t('< 1 %') : formatShare(value))

export function technologyLogos(technologies) {
  const names = technologies.slice(0, STACK_TECHNOLOGIES).map(([name]) => name)
  const logos = el('span', { className: 'stack-logos', title: names.join(', ') }, ...names.map((name) => technologyIcon(name)))
  if (names.length) {
    logos.setAttribute('role', 'img')
    logos.setAttribute('aria-label', t('Technos : {technologies}', { technologies: names.join(', ') }))
  }

  return logos
}

export function stackCell({ counts, technologies }) {
  const type = stackType(counts)
  if (!type) {
    return el('td', { className: 'muted', textContent: '–' })
  }
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  const parts = STACK_CATEGORIES.filter((category) => counts[category.key] > 0)
  const share = (category) => Math.round((100 * counts[category.key]) / total)
  const fullStack = type.key === 'full-stack'
  const top = topTechnologies(technologies)
  const technologyText = top.map(([name, part]) => t('{label} {value} %', { label: name, value: Math.round(100 * part) })).join(', ')

  const bar = el(
    'span',
    { className: 'stack-bar' },
    ...parts.map((category) => {
      const segment = el('span')
      segment.style.flexGrow = counts[category.key]
      segment.style.background = category.color

      return segment
    }),
  )
  const cell = el(
    'span',
    { className: 'stack-cell', tabIndex: 0 },
    el('span', { className: `stack-type is-${type.key}`, textContent: type.label }),
    bar,
    el('span', { className: 'stack-logos' }, ...top.map(([name]) => technologyIcon(name))),
  )
  const split = parts.map((category) => t('{label} {value} %', { label: category.label, value: share(category) })).join(', ')
  cell.setAttribute('aria-label', `${fullStack ? `${t('Full-stack.')} ` : ''}${split}. ${technologyText}`)
  bindTooltip(
    cell,
    (x, y) =>
      showTooltip(
        {
          title: fullStack ? t('Stack full-stack') : t('Stack'),
          rows: parts.map((category) => ({
            color: category.color,
            value: t('{value} %', { value: share(category) }),
            label: `${category.label.toLowerCase()} · ${plural(counts[category.key], 'PR', 'PR')}`,
          })),
          note: technologyText ? t('Technos : {technologies}', { technologies: technologyText }) : null,
        },
        x,
        y,
      ),
    hideTooltip,
  )

  return el('td', {}, cell)
}

export function repoTypeTag(category) {
  const type = CATEGORIES.find((item) => item.key === category) ?? CATEGORIES.at(-1)

  return el('span', { className: `stack-type is-${type.key}`, textContent: type.key === 'other' ? t('autre') : type.label.toLowerCase() })
}

export function repoCell({ repo, category }) {
  return el('td', { className: 'person repo-cell' }, repoLink(repo), repoTypeTag(category))
}

export function linesCell({ added, deleted }) {
  return el(
    'td',
    { className: 'lines-cell' },
    el('span', { textContent: `+${formatLines(added)}` }),
    el('span', { textContent: `−${formatLines(deleted)}` }),
  )
}

export function technologiesCell(technologies) {
  if (technologies.length === 0) {
    return el('td', { className: 'text muted', textContent: '–' })
  }
  const content = el(
    'span',
    { className: 'stack-logos', tabIndex: 0 },
    ...technologies.slice(0, STACK_TECHNOLOGIES).map(([name]) => technologyIcon(name)),
  )
  content.setAttribute('aria-label', technologies.map(([name, share]) => `${name} ${formatTechnologyShare(share)}`).join(', '))
  bindTooltip(
    content,
    (x, y) =>
      showTooltip(
        {
          title: t('Technologies'),
          rows: technologies.map(([name, share]) => ({ value: formatTechnologyShare(share), label: name })),
          note: t('Part dans le code du dépôt'),
        },
        x,
        y,
      ),
    hideTooltip,
  )

  return el('td', { className: 'text' }, content)
}

// The main repository only, the others in the tooltip: the full list made the column too wide.
export function topReposCell(topRepos, unit) {
  if (topRepos.length === 0) {
    return el('td', { className: 'text muted', textContent: '–' })
  }
  const [[repo, count], ...others] = topRepos
  const content = el(
    'span',
    { className: 'top-repos', tabIndex: 0 },
    el('span', { className: 'top-repos-name', textContent: repo }),
    el('span', { className: 'muted', textContent: formatNumber(count) }),
  )
  if (others.length > 0) {
    content.append(el('span', { className: 'top-repos-more', textContent: `+${others.length}` }))
  }
  content.setAttribute('aria-label', topRepos.map(([name, prs]) => t('{label} : {value}', { label: name, value: `${formatNumber(prs)} ${unit}` })).join(', '))
  bindTooltip(
    content,
    (x, y) =>
      showTooltip(
        {
          title: t('Principaux dépôts'),
          rows: topRepos.map(([name, prs]) => ({ value: formatNumber(prs), label: name })),
          note: unit,
        },
        x,
        y,
      ),
    hideTooltip,
  )

  return el('td', { className: 'text' }, content)
}
