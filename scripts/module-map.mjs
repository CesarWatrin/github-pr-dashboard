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

// Every module the page loads, from the entry, in the order they are first met.
export function pageModules() {
  const modules = [ENTRY]
  for (let index = 0; index < modules.length; index++) {
    for (const path of importsOf(modules[index])) {
      if (!modules.includes(path)) {
        modules.push(path)
      }
    }
  }

  return modules
}

// The block of index.html that loads them, sorted so that it reads like the folders.
export function moduleBlock(modules = pageModules(), indent = '    ') {
  const imported = modules.filter((path) => path !== ENTRY).sort()
  const map = JSON.stringify({ imports: Object.fromEntries(imported.map((path) => [`./${path}`, `./${path}?v=__BUILD__`])) }, null, 2)

  return [
    START,
    '<script type="importmap">',
    ...map.split('\n'),
    '</script>',
    ...[ENTRY, ...imported].map((path) => `<link rel="modulepreload" href="${path}?v=__BUILD__" />`),
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
  console.log(`${pageModules().length} modules in ${relative(process.cwd(), path)}`)
}
