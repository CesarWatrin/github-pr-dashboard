// The page in a real browser, on made-up stats (tests/fixtures/stats.mjs), in French then in English: unlocked with its
// password, every page shows without any error and fills every container its script draws into, the dialogs open, the
// filters apply, the drawer opens on a phone; in English, every text has its English. What the unit tests of the rules
// cannot see: a feature that no longer shows, a text left in French. Needs Chrome (CHROME_PATH, or where it usually
// lives): skipped without it, except in CI.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'

import { ENGLISH } from '../../site/lib/english.js'
import { LANGUAGE_STORAGE_KEY } from '../../site/lib/i18n.js'
import { ROUTES } from '../../site/model/routes.js'
import { madeUpStats } from '../fixtures/stats.mjs'
import { browserPath, launch } from './chrome.mjs'
import { serveSite, TEST_PASSWORD } from './site.mjs'

const stats = madeUpStats()
// The containers that stay empty on purpose: until the report is copied, the pairs that replace the review matrix on a
// narrow screen only, the note of a CI that starts after the period (none over 12 months).
const EMPTY_ON_PURPOSE = new Set(['data-report-copied', 'data-collaboration-pairs', 'data-ci-cut'])

const skip = !browserPath() && !process.env.CI && 'Chrome not found: set CHROME_PATH'
// What reads as French: accented letters, French quotes, common French words. The made-up stats have none (plain ASCII
// names and titles): in English, whatever shows with any of them is a text left in French, wrapped in t() or not.
const FRENCH = /[àâçéèêëîïôûùüÿœæ«»]|\b(?:les|des|une|avec|sans|pour|dans|aucun|aucune|depuis|jours|mois|personnes)\b/i

for (const language of ['fr', 'en']) {
  describe(`the page in a browser, in ${language === 'en' ? 'English' : 'French'}`, { skip }, () => {
    // The title of a page as it reads in the language of the suite.
    /** @param {string} french */
    const read = (french) => (language === 'en' ? (ENGLISH.get(french) ?? `no English for ${french}`) : french)
    let site
    let browser
    let page
    const errors = []
    // In English, the texts left in French, page by page.
    const french = []

    before(async () => {
      site = await serveSite(stats)
      browser = await launch()
      page = browser.page
      page.on('Runtime.exceptionThrown', ({ exceptionDetails }) => errors.push(exceptionDetails.exception?.description ?? exceptionDetails.text))
      page.on('Runtime.consoleAPICalled', ({ type, args }) => {
        if (type === 'error' || type === 'warning') {
          errors.push(args.map((arg) => arg.value ?? arg.description).join(' '))
        }
      })
      // A file of the page that does not load: a module or a style left out, say.
      page.on('Log.entryAdded', ({ entry }) => {
        if (entry.level === 'error' && entry.url?.startsWith(site.url)) {
          errors.push(`${entry.text} ${entry.url}`)
        }
      })
      await page.send('Runtime.enable')
      await page.send('Log.enable')
      await page.send('Page.enable')
      await page.send('Network.enable')
      // Nothing leaves the machine: avatars and the GitHub API are refused.
      await page.send('Network.setBlockedURLs', { urls: ['*://github.com/*', '*://api.github.com/*', '*://avatars.githubusercontent.com/*'] })
      // The clock of the page stands five minutes after the last sync of the stats.
      const now = Date.parse(stats.generatedAt) + 5 * 60_000
      await page.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `(() => {
          const RealDate = Date
          const start = performance.now()
          const now = () => ${now} + Math.floor(performance.now() - start)
          globalThis.Date = class extends RealDate {
            constructor(...args) { super(...(args.length ? args : [now()])) }
            static now() { return now() }
          }
        })()`,
      })
      if (language === 'en') {
        await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('${LANGUAGE_STORAGE_KEY}', 'en')` })
      }
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
      await resize(1536)
      await page.send('Page.navigate', { url: site.url })
      await page.waitFor(`document.readyState === 'complete' && !document.querySelector('[data-lock]').hidden`)
      if (language === 'en') {
        await page.waitFor(`document.documentElement.classList.contains('is-translated')`)
      }
      // Marks what the script fills, before it does: whatever has a data attribute and nothing in it in index.html.
      await page.evaluate(`document.querySelectorAll('[data-route] *').forEach((node) => {
        const named = [...node.attributes].some((attribute) => attribute.name.startsWith('data-'))
        if (named && node.childElementCount === 0 && !node.textContent.trim() && !['INPUT', 'SELECT', 'IMG'].includes(node.tagName) && !node.closest('svg')) {
          node.dataset.filled = ''
        }
      })`)
    })

    after(async () => {
      await browser?.close()
      await site?.close()
    })

    const resize = (width) =>
      page.send('Emulation.setDeviceMetricsOverride', { width, height: width < 600 ? 844 : 1000, deviceScaleFactor: 1, mobile: width < 600 })
    const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    async function show(route) {
      await page.evaluate(`location.hash = ${JSON.stringify(ROUTES[route].hash)}`)
      await page.waitFor(`!document.querySelector('[data-route="${route}"]').hidden`)
      await pause(400)
    }
    // The texts and labels of what shows under a selector that read as French.
    /** @param {string} selector */
    const frenchIn = (selector) =>
      page.evaluate(`(() => {
        const root = document.querySelector(${JSON.stringify(selector)})
        const labels = [...root.querySelectorAll('[title], [aria-label], [placeholder], [data-label]')]
          .filter((element) => element.checkVisibility())
          .flatMap((element) => ['title', 'aria-label', 'placeholder', 'data-label'].map((name) => element.getAttribute(name) ?? ''))
        return [...root.innerText.split('\\n'), ...labels].filter((text) => ${FRENCH}.test(text))
      })()`)
    /**
     * @param {string} where
     * @param {string} selector
     */
    const noteFrench = async (where, selector) => {
      if (language === 'en') {
        french.push(...(await frenchIn(selector)).map((text) => `${where}: ${text}`))
      }
    }
    // The containers of a page its script draws into, that it left empty.
    const emptyContainers = (route) =>
      page.evaluate(`[...document.querySelectorAll('[data-route="${route}"] [data-filled]')]
        .filter((node) => node.childElementCount === 0 && !node.textContent.trim())
        .map((node) => [...node.attributes].find((attribute) => attribute.name.startsWith('data-') && attribute.name !== 'data-filled').name)`)

    test('asks for the password, then unlocks', async () => {
      await page.evaluate(`(() => {
        document.querySelector('[data-lock-password]').value = ${JSON.stringify(TEST_PASSWORD)}
        document.querySelector('[data-lock-form]').requestSubmit()
      })()`)
      await page.waitFor(`document.querySelector('[data-lock]').hidden && !document.querySelector('[data-main]').classList.contains('is-loading')`)
      assert.equal(await page.evaluate(`document.querySelector('[data-org]').textContent`), stats.org)
    })

    for (const [route, { title }] of Object.entries(ROUTES)) {
      test(`${title}: shows and fills everything it draws`, async () => {
        await show(route)
        assert.equal(await page.evaluate(`document.querySelector('[data-route-title]').textContent`), read(title))
        // Every page but the method draws something: no container marked would check nothing.
        const marked = await page.evaluate(`document.querySelectorAll('[data-route="${route}"] [data-filled]').length`)
        assert.ok(route === 'method' || marked > 0, 'no container marked')
        const empty = (await emptyContainers(route)).filter((name) => !EMPTY_ON_PURPOSE.has(name))
        assert.deepEqual(empty, [])
        await noteFrench(route, '[data-page]')
      })
    }

    test('a name, a repository, a pull request, a squad and a project open their dialog', async () => {
      for (const [route, opener, dialog] of [
        ['team', '.person-link', '[data-person-dialog]'],
        ['repositories', '.repo-link', '[data-person-dialog]'],
        ['unblock', 'a[aria-haspopup="dialog"]', '[data-pr-dialog]'],
        ['squads', '.squad-card button', '[data-person-dialog]'],
        ['projects', '.project-card-head', '[data-person-dialog]'],
        ['projects', '.gantt-row', '[data-person-dialog]'],
        // A project named on another page opens its dialog too.
        ['overview', '.project-link', '[data-person-dialog]'],
        ['team', '.project-line .project-link', '[data-person-dialog]'],
      ]) {
        await show(route)
        await page.evaluate(`document.querySelector('[data-route="${route}"] ${opener}').click()`)
        assert.equal(await page.evaluate(`document.querySelector('${dialog}').open`), true, `${route}: ${opener}`)
        assert.ok(await page.evaluate(`document.querySelector('${dialog}').textContent.trim().length > 0`))
        await noteFrench(`${route} dialog`, dialog)
        await page.evaluate(`document.querySelector('${dialog}').close()`)
      }
    })

    test('the projects show every status, and their table sorts on it, the ongoing ones first', async () => {
      await show('projects')
      const statuses = `[...document.querySelectorAll('[data-projects] tbody .project-status')].map((tag) => tag.className.split('is-')[1])`
      assert.deepEqual(new Set(await page.evaluate(statuses)), new Set(['ongoing', 'stalled', 'abandoned', 'delivered']))
      const sortOnStatus = `[...document.querySelectorAll('[data-projects] thead button')][1].click()`
      await page.evaluate(sortOnStatus)
      const sorted = await page.evaluate(statuses)
      const order = ['ongoing', 'stalled', 'abandoned', 'delivered']
      assert.deepEqual(sorted, sorted.toSorted((a, b) => order.indexOf(a) - order.indexOf(b)))
      await page.evaluate(sortOnStatus)
      assert.deepEqual(await page.evaluate(statuses), sorted.toReversed())
      // A merge of a project branch shows on the timeline.
      assert.ok(await page.evaluate(`document.querySelectorAll('[data-project-timeline] .gantt-marker').length > 0`))
    })

    test('a name taken up again makes two projects, and the projects filter by status, by repository and search', async () => {
      await show('projects')
      const cards = `[...document.querySelectorAll('[data-project-cards] .repo-card-name')].map((name) => name.textContent)`
      // Each project of the name carries the month it started, and its dialog names the other one.
      const falcons = (await page.evaluate(cards)).filter((name) => name.startsWith('blue-falcon'))
      assert.equal(falcons.length, 2)
      assert.ok(falcons.every((name) => /^blue-falcon \(.+\)$/.test(name)), falcons.join(', '))
      await page.evaluate(`[...document.querySelectorAll('[data-project-cards] .project-card-head')].find((head) => head.textContent.startsWith('blue-falcon')).click()`)
      assert.ok(await page.evaluate(`document.querySelector('[data-person-dialog] .project-namesakes').textContent.length > 0`))
      await noteFrench('project dialog of a name taken up again', '[data-person-dialog]')
      await page.evaluate(`document.querySelector('[data-person-dialog]').close()`)

      // The statuses picked: the stalled projects only, on the cards, the timeline and the table, and the filter says so.
      const statuses = (selector) => page.evaluate(`[...document.querySelectorAll('${selector} .project-status')].map((tag) => tag.className.split('is-')[1])`)
      const toggle = (status) => page.evaluate(`document.querySelector('[data-status-filter] input[data-status="${status}"]').click()`)
      await toggle('ongoing')
      await toggle('abandoned')
      await toggle('delivered')
      for (const selector of ['[data-project-cards]', '[data-project-timeline]', '[data-projects] tbody']) {
        const shown = await statuses(selector)
        assert.ok(shown.length > 0 && shown.every((status) => status === 'stalled'), `${selector}: ${shown.join(', ')}`)
      }
      assert.equal(await page.evaluate(`document.querySelector('[data-status-filter] [data-status-label]').textContent`), read('À l’arrêt'))
      await toggle('ongoing')
      await toggle('abandoned')
      await toggle('delivered')
      assert.equal(await page.evaluate(`document.querySelector('[data-status-filter] [data-status-label]').textContent`), read('Tous les statuts'))

      // The repositories picked: the projects with pull requests there only.
      await page.evaluate(`document.querySelector('[data-repo-filter="projects"] [data-preset="none"]').click()`)
      await page.evaluate(`document.querySelector('[data-repo-filter="projects"] input[data-repo="billing"]').click()`)
      assert.deepEqual(await page.evaluate(cards), ['red-heron'])
      await page.evaluate(`document.querySelector('[data-repo-filter="projects"] [data-preset="all"]').click()`)

      // The search finds a project by its name, and says so.
      assert.equal(await page.evaluate(`document.querySelector('[data-search]').placeholder`), read('Filtrer projet, personne ou dépôt'))
      await page.evaluate(`(() => {
        const search = document.querySelector('[data-search]')
        search.value = 'kite'
        search.dispatchEvent(new Event('input'))
      })()`)
      assert.deepEqual(await page.evaluate(cards), ['paper-kite'])
      await page.evaluate(`(() => {
        const search = document.querySelector('[data-search]')
        search.value = ''
        search.dispatchEvent(new Event('input'))
      })()`)
      await show('authors')
      assert.equal(await page.evaluate(`document.querySelector('[data-search]').placeholder`), read('Filtrer une personne ou un dépôt'))
    })

    test('a period, the search and a squad apply to the pages', async () => {
      await show('devops')
      await page.evaluate(`document.querySelector('[data-period="730d"]').click()`)
      await pause(400)
      // The CI only goes back about 13 months: over 24, the page says so.
      assert.notEqual(await page.evaluate(`document.querySelector('[data-ci-cut]').textContent.trim()`), '')

      await show('authors')
      const rows = () => page.evaluate(`document.querySelectorAll('[data-authors] tbody tr').length`)
      const everyone = await rows()
      await page.evaluate(`(() => {
        const search = document.querySelector('[data-search]')
        search.value = 'Ada'
        search.dispatchEvent(new Event('input'))
      })()`)
      assert.ok((await rows()) < everyone)

      await page.evaluate(`(() => {
        const search = document.querySelector('[data-search]')
        search.value = ''
        search.dispatchEvent(new Event('input'))
        const squad = document.querySelector('[data-squad-filter]')
        squad.value = 'Shop'
        squad.dispatchEvent(new Event('change'))
      })()`)
      await pause(400)
      assert.equal(await page.evaluate(`document.querySelector('[data-squad-filter]').classList.contains('is-active')`), true)
      assert.ok((await rows()) < everyone)
    })

    test('on « Mes PR », the tab and the red badges count what to act on, the grey one all the person’s own', async () => {
      await show('me')
      await page.evaluate(`(() => {
        const picker = document.querySelector('[data-me-picker]')
        picker.value = 'ada-l'
        picker.dispatchEvent(new Event('change'))
      })()`)
      /** @param {string[]} lists */
      const listed = (lists) =>
        page.evaluate(`document.querySelectorAll('${lists.map((list) => `[data-me="${list}"] li:not(.feed-empty)`).join(', ')}').length`)
      const urgent = await listed(['toReview', 'ready', 'changes', 'forgotten'])
      const own = await listed(['ready', 'changes', 'forgotten', 'owners', 'open', 'drafts'])
      assert.ok(urgent > 0 && (await listed(['drafts'])) > 0, 'the made-up person has pull requests to act on, and a draft')
      assert.ok(await page.evaluate(`document.title.startsWith('(${urgent}) ')`))
      assert.deepEqual(
        await page.evaluate(`[...document.querySelectorAll('[data-reviews-badge]')].map((badge) => badge.textContent)`),
        [String(urgent), String(urgent)],
      )
      assert.equal(await page.evaluate(`document.querySelector('[data-own-badge]').textContent`), String(own))
    })

    test('the film of the map page plays from the start, and pauses', async () => {
      await show('cartography')
      const date = `document.querySelector('[data-replay-date]').textContent`
      const end = await page.evaluate(date)
      await page.evaluate(`document.querySelector('[data-replay-play]').click()`)
      await page.waitFor(`${date} !== ${JSON.stringify(end)} && document.querySelectorAll('[data-replay-feed] li').length > 0`)
      await page.evaluate(`document.querySelector('[data-replay-play]').click()`)
      assert.equal(await page.evaluate(`document.querySelector('[data-replay-play]').getAttribute('aria-pressed')`), 'false')
    })

    test('the address holds the filters and the card open, and an address pasted leads back to them', async () => {
      await show('projects')
      await page.evaluate(`document.querySelector('[data-project-cards] .project-card-head').click()`)
      await page.waitFor(`location.hash.startsWith('#/projets?') && location.hash.includes('card=project%3A')`)
      await page.evaluate(`document.querySelector('[data-person-dialog]').close()`)
      await page.waitFor(`!location.hash.includes('card=')`)
      // Another place, pasted in the tab: its page, its period, its search and its card.
      await page.evaluate(`location.hash = '#/equipe?period=90d&q=ada&card=person%3Aada-l'`)
      await page.waitFor(`document.querySelector('[data-person-dialog]').open`)
      assert.equal(await page.evaluate(`document.querySelector('[data-search]').value`), 'ada')
      assert.equal(await page.evaluate(`document.querySelector('[data-person-dialog] h2').textContent.length > 0`), true)
      await page.evaluate(`document.querySelector('[data-person-dialog]').close()`)
      // Back to the defaults for the tests after.
      await page.evaluate(`location.hash = '#/?period=365d'`)
      await page.waitFor(`document.querySelector('[data-search]').value === '' && !location.hash.includes('q=')`)
    })

    test('the theme toggles, and locking asks first', async () => {
      const theme = await page.evaluate(`document.documentElement.dataset.theme ?? ''`)
      await page.evaluate(`document.querySelector('[data-theme-toggle]').click()`)
      assert.notEqual(await page.evaluate(`document.documentElement.dataset.theme`), theme)
      await page.evaluate(`document.querySelector('[data-lock-now]').click()`)
      assert.equal(await page.evaluate(`document.querySelector('[data-lock-dialog]').open`), true)
      await page.evaluate(`document.querySelector('[data-lock-dialog]').close()`)
    })

    test('on a phone, the pairs replace the review matrix and the menu opens as a drawer', async () => {
      await resize(390)
      await show('collaboration')
      await pause(400)
      assert.ok(await page.evaluate(`document.querySelector('[data-collaboration-pairs]').childElementCount > 0`))
      await page.evaluate(`document.querySelector('[data-nav-toggle]').click()`)
      assert.equal(await page.evaluate(`document.querySelector('[data-page]').classList.contains('is-nav-open')`), true)
      await page.evaluate(`document.querySelector('[data-nav-close]').click()`)
      await resize(1536)
    })

    if (language === 'en') {
      test('every text has its English', async () => {
        assert.equal(await page.evaluate(`document.documentElement.lang`), 'en')
        assert.deepEqual(await page.evaluate(`import('./lib/i18n.js').then(({ missing }) => [...missing])`), [])
        // Beside the texts through t(), what shows: a text written without t() would stay in French.
        assert.deepEqual([...new Set(french)], [])
      })
    } else {
      test('the language button switches the page to English, still unlocked', async () => {
        await show('overview')
        await page.evaluate(`document.querySelector('[data-language-toggle]').click()`)
        await page.waitFor(`document.documentElement.lang === 'en' && document.documentElement.classList.contains('is-translated')`)
        await page.waitFor(`document.querySelector('[data-lock]').hidden && !document.querySelector('[data-main]').classList.contains('is-loading')`)
        assert.equal(await page.evaluate(`document.querySelector('[data-route-title]').textContent`), ENGLISH.get(ROUTES.overview.title))
      })
    }

    test('no error in the console', () => {
      assert.deepEqual(errors, [])
    })
  })
}
