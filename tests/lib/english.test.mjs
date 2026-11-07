// Tests of the English of the page (site/lib/english/): each English keeps what its French holds, and reads as English.
// Whether every text has one is the browser test's (tests/browser/pages.test.mjs).
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { BLOCKS } from '../../site/lib/english/blocks.js'
import { FRAME } from '../../site/lib/english/frame.js'
import { METHOD } from '../../site/lib/english/method.js'
import { PAGES } from '../../site/lib/english/pages.js'

const PARTS = { frame: FRAME, method: METHOD, pages: PAGES, blocks: BLOCKS }
const entries = Object.entries(PARTS).flatMap(([part, english]) => Object.entries(english).map(([french, text]) => ({ part, french, text })))

/** @param {string} text */
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
// The inline elements of a sentence of index.html, their attributes but those read by someone, which translate.
/** @param {string} text */
const elements = (text) =>
  [...text.matchAll(/<(\/?[\w-]+)([^>]*)>/g)]
    .map(([, name, attributes]) => {
      const kept = [...attributes.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)]
        .filter(([, attribute]) => !['title', 'aria-label', 'alt', 'placeholder', 'data-label'].includes(attribute))
        .map(([whole]) => whole)

      return [name, ...kept].join(' ')
    })
    .sort()

describe('the English of the page', () => {
  test('keeps the placeholders of each French', () => {
    const lost = entries.filter(({ french, text }) => placeholders(french).join() !== placeholders(text).join())
    assert.deepEqual(lost.map(({ part, french }) => `${part}: ${french}`), [])
  })

  test('keeps the inline elements of each sentence of index.html, which the scripts may fill', () => {
    const lost = entries.filter(({ french, text }) => elements(french).join('|') !== elements(text).join('|'))
    assert.deepEqual(lost.map(({ part, french }) => `${part}: ${french}`), [])
  })

  test('gives a French found in two parts the same English', () => {
    /** @type {Map<string, Set<string>>} */
    const translations = new Map()
    for (const { french, text } of entries) {
      translations.set(french, (translations.get(french) ?? new Set()).add(text))
    }
    assert.deepEqual([...translations].filter(([, texts]) => texts.size > 1).map(([french]) => french), [])
  })

  test('reads as English: no French quotes, no space before a colon, a question mark or a percent', () => {
    // The text read, outside the tags; code reads as a word.
    /** @param {string} text */
    const prose = (text) => text.replace(/<code>[\s\S]*?<\/code>/g, 'code').replace(/<[^>]+>/g, '')
    const french = entries.filter(({ text }) => /[«»]|[\s  ][:;?!%](?=\s|$|[)<,.])/.test(prose(text)))
    assert.deepEqual(french.map(({ part, french: key }) => `${part}: ${key}`), [])
  })

  test('is never empty', () => {
    assert.deepEqual(entries.filter(({ text }) => !text.trim()).map(({ french }) => french), [])
  })
})
