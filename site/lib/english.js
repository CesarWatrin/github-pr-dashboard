// The English of the page, by its French (lib/i18n.js), loaded only in English. One part per area of the page, each
// kept next to the French it translates in spirit: the frame and the static texts of index.html, the method page, the
// pages, and the building blocks (dialogs, tables, the analysis, the model). A French text found in two parts has the
// same English in both (tests/lib/english.test.mjs).

import { BLOCKS } from './english/blocks.js'
import { FRAME } from './english/frame.js'
import { METHOD } from './english/method.js'
import { PAGES } from './english/pages.js'

/** @type {Map<string, string>} */
export const ENGLISH = new Map(Object.entries({ ...FRAME, ...METHOD, ...PAGES, ...BLOCKS }))
