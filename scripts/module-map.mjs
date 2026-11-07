// The modules of the page, as site/index.html loads them: an import map that gives every module the version of the
// deploy (the workflow stamps __BUILD__ with the commit), so that the cache of GitHub Pages never mixes the files of two
// deploys, and a preload of each, so that the browser fetches them all at once rather than level by level of imports.
//
// Usage: node scripts/module-map.mjs (npm run modules), after adding, moving or removing a module of site/. The tests
// fail while index.html is out of date.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, posix, relative } from 'node:path'

export const SITE = join(import.meta.dirname, '..', 'site')
export const ENTRY = 'app.js'
const START = '<!-- modules: written by scripts/module-map.mjs -->'
const END = '<!-- /modules -->'

// The relative imports of a module, as paths from site/.
/**
 * @param {string} path
 * @param {string} [source]
 * @returns {string[]}
 */
export function importsOf(path, source = readFileSync(join(SITE, path), 'utf8')) {
  const specifiers = [...source.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s*'([^']+)'|^\s*import\s*'([^']+)'/gms)].map(
    (match) => match[1] ?? match[2],
  )

  return specifiers.filter((specifier) => specifier.startsWith('.')).map((specifier) => posix.join(dirname(path), specifier))
}

// The modules a module loads on demand, import('./…'), as paths from site/: the English, say, only in English.
/**
 * @param {string} path
 * @param {string} [source]
 * @returns {string[]}
 */
export function lazyImportsOf(path, source = readFileSync(join(SITE, path), 'utf8')) {
  return [...source.matchAll(/\bimport\(\s*'(\.[^']+)'\s*\)/g)].map((match) => posix.join(dirname(path), match[1]))
}

// The modules the page loads with the entry (eager), in the order they are first met, and those it loads on demand,
// with what they import (lazy).
export function pageModules() {
  /**
   * @param {string[]} modules
   * @param {Set<string>} [known]
   */
  const closure = (modules, known = new Set()) => {
    for (let index = 0; index < modules.length; index++) {
      for (const path of importsOf(modules[index])) {
        if (!modules.includes(path) && !known.has(path)) {
          modules.push(path)
        }
      }
    }

    return modules
  }
  const eager = closure([ENTRY])
  const lazy = closure(
    [...new Set(eager.flatMap((path) => lazyImportsOf(path)))].filter((path) => !eager.includes(path)),
    new Set(eager),
  )

  return { eager, lazy }
}

// The block of index.html that loads them, sorted so that it reads like the folders: every module in the import map,
// those loaded with the entry preloaded too.
export function moduleBlock({ eager, lazy } = pageModules(), indent = '    ') {
  const imported = [...eager, ...lazy].filter((path) => path !== ENTRY).sort()
  const preloaded = eager.filter((path) => path !== ENTRY).sort()
  const map = JSON.stringify({ imports: Object.fromEntries(imported.map((path) => [`./${path}`, `./${path}?v=__BUILD__`])) }, null, 2)

  return [
    START,
    '<script type="importmap">',
    ...map.split('\n'),
    '</script>',
    ...[ENTRY, ...preloaded].map((path) => `<link rel="modulepreload" href="${path}?v=__BUILD__" />`),
    END,
  ]
    .map((line) => `${indent}${line}`)
    .join('\n')
}

// The block as index.html holds it now, null without one.
/** @param {string} html */
export function currentBlock(html) {
  const start = html.indexOf(START)
  const end = html.indexOf(END)
  if (start === -1 || end === -1) {
    return null
  }
  const lineStart = html.lastIndexOf('\n', start) + 1

  return html.slice(lineStart, end + END.length)
}

if (import.meta.main) {
  const path = join(SITE, 'index.html')
  const html = readFileSync(path, 'utf8')
  const current = currentBlock(html)
  if (!current) {
    throw new Error(`No ${START} … ${END} block in ${relative(process.cwd(), path)}`)
  }
  writeFileSync(path, html.replace(current, moduleBlock()))
  const { eager, lazy } = pageModules()
  console.log(`${eager.length} modules preloaded, ${lazy.length} on demand, in ${relative(process.cwd(), path)}`)
}
