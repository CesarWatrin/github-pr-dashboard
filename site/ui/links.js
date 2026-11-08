// Names of people, repositories and pull requests: buttons that open their dialog, GitHub when they have none.

import { t } from '../lib/i18n.js'
import { displayName } from '../model/people.js'
import { pullRequestOf } from '../model/pull-requests.js'
import { state } from '../model/state.js'
import { el, svg } from './dom.js'
import { ICONS_URL } from './icons.js'

// A click on a name asks for its dialog with one of these events, bubbling from the name; the dialogs listen to them
// (setupPersonDialog() and the others), so that a link knows no dialog. Its detail: the login, the repository, the
// record of the pull request, the key of the project, or the name of the squad.
export const OPEN_PERSON = 'dashboard:open-person'
export const OPEN_REPOSITORY = 'dashboard:open-repository'
export const OPEN_PULL_REQUEST = 'dashboard:open-pull-request'
export const OPEN_PROJECT = 'dashboard:open-project'
export const OPEN_SQUAD = 'dashboard:open-squad'

export const askToOpen = (opener, type, detail) => opener.dispatchEvent(new CustomEvent(type, { bubbles: true, detail }))

export const githubUrl = (path) => `https://github.com/${path}`
// GitHub serves the avatar at twice its displayed size, for sharp high-density screens.
export const avatarUrl = (login, size = 48) => githubUrl(`${encodeURIComponent(login)}.png?size=${size}`)

export function avatar(login) {
  return el('img', { className: 'avatar', src: avatarUrl(login), alt: '', loading: 'lazy', width: 24, height: 24 })
}

// A repository, wherever it shows: a click opens its dialog, which leads to GitHub.
export function repoLink(repo, className = 'repo-link') {
  const button = el('button', { type: 'button', className, textContent: repo, title: repo })
  button.setAttribute('aria-haspopup', 'dialog')
  button.addEventListener('click', () => askToOpen(button, OPEN_REPOSITORY, repo))

  return button
}

// A link to GitHub, at the right of the name, with the GitHub mark of the icon sprite.
export function githubPill(path, text) {
  const mark = svg('svg', { viewBox: '0 0 24 24', width: 16, height: 16, 'aria-hidden': 'true' })
  mark.append(svg('use', { href: `${ICONS_URL}#github` }))

  return el('a', { className: 'person-dialog-github', href: githubUrl(path), target: '_blank', rel: 'noopener' }, mark, document.createTextNode(text))
}

// A person's name, with their avatar or not. Wherever it shows, it opens their dialog, the one of the team page, whose
// head links to their GitHub profile.
export function personLink(login, { withAvatar = true } = {}) {
  const button = el(
    'button',
    { type: 'button', className: 'person-link', title: login },
    ...(withAvatar ? [avatar(login)] : []),
    el('span', { className: 'person-link-name', textContent: displayName(login) }),
  )
  button.setAttribute('aria-haspopup', 'dialog')
  button.addEventListener('click', () => askToOpen(button, OPEN_PERSON, login))

  return button
}

export const pullRequestPath = (repo, number) => `${state.stats.org}/${encodeURIComponent(repo)}/pull/${number}`

// A pull request named in a list. A click opens its timeline when the records have it; a click with a modifier key, the
// middle button or the menu of the link open it on GitHub, as the link of the timeline does.
export function pullRequestLink(repo, number) {
  const link = el('a', {
    href: githubUrl(pullRequestPath(repo, number)),
    target: '_blank',
    rel: 'noopener',
    textContent: `${repo}#${number}`,
  })
  if (pullRequestOf(repo, number)) {
    link.title = t('Voir sa frise (Ctrl ou ⌘ + clic : l’ouvrir sur GitHub)')
    link.setAttribute('aria-haspopup', 'dialog')
    link.addEventListener('click', (event) => {
      const pr = pullRequestOf(repo, number)
      if (!pr || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
        return
      }
      event.preventDefault()
      askToOpen(link, OPEN_PULL_REQUEST, pr)
    })
  }

  return link
}
