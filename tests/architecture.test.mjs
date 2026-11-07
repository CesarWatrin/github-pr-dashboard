// Tests of the structure of the code: the layers of the page and of the sync, without import cycles, and the page
// loading every module and style it has, at the version of the deploy.
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, test } from 'node:test'

import { currentBlock, ENTRY, importsOf, moduleBlock, pageModules, SITE } from '../scripts/module-map.mjs'

const ROOT = join(import.meta.dirname, '..')
const SCRIPTS = join(ROOT, 'scripts')

// The files of a folder, as paths from it, data aside.
function filesOf(folder, extension, from = folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) {
      return entry.name === 'data' || entry.name === 'node_modules' ? [] : filesOf(path, extension, from)
    }

    return entry.name.endsWith(extension) ? [relative(from, path).split('\\').join('/')] : []
  })
}

const siteModules = filesOf(SITE, '.js')
const syncModules = filesOf(SCRIPTS, '.mjs')
const graphOf = (root, modules) => new Map(modules.map((path) => [path, importsOf(path, readFileSync(join(root, path), 'utf8'))]))
const siteGraph = graphOf(SITE, siteModules)
const syncGraph = graphOf(SCRIPTS, syncModules)

// The import cycles of a graph: its strongly connected components of more than one module.
function cyclesOf(graph) {
  let index = 0
  const stack = []
  const meta = new Map()
  const cycles = []
  const visit = (node) => {
    meta.set(node, { index, low: index, onStack: true })
    index++
    stack.push(node)
    for (const next of graph.get(node) ?? []) {
      if (!meta.has(next)) {
        visit(next)
        meta.get(node).low = Math.min(meta.get(node).low, meta.get(next).low)
      } else if (meta.get(next).onStack) {
        meta.get(node).low = Math.min(meta.get(node).low, meta.get(next).index)
      }
    }
    if (meta.get(node).low === meta.get(node).index) {
      const members = []
      let member
      do {
        member = stack.pop()
        meta.get(member).onStack = false
        members.push(member)
      } while (member !== node)
      if (members.length > 1) {
        cycles.push(members.sort())
      }
    }
  }
  for (const node of graph.keys()) {
    if (!meta.has(node)) {
      visit(node)
    }
  }

  return cycles
}

// The layers of the page, lowest first: a module imports from its own layer or the ones below only.
const SITE_LAYERS = ['domain', 'lib', 'model', 'services', 'ui', 'pages', 'shell', ENTRY]
const layerOf = (path) => SITE_LAYERS.findIndex((layer) => path === layer || path.startsWith(`${layer}/`))
// A page is a module of pages/, or a folder of them.
const pageOf = (path) => (path.startsWith('pages/') ? path.split('/').slice(0, 2).join('/').replace(/\.js$/, '') : null)

describe('the page', () => {
  test('every module belongs to a layer', () => {
    assert.deepEqual(siteModules.filter((path) => layerOf(path) === -1), [])
  })

  test('every import leads to a module that exists', () => {
    const broken = [...siteGraph].flatMap(([path, imports]) => imports.filter((target) => !siteGraph.has(target)).map((target) => `${path} → ${target}`))
    assert.deepEqual(broken, [])
  })

  test('a module only imports from its own layer or those below', () => {
    const upward = [...siteGraph].flatMap(([path, imports]) =>
      imports.filter((target) => layerOf(target) > layerOf(path)).map((target) => `${path} → ${target}`),
    )
    assert.deepEqual(upward, [])
  })

  test('a page never imports another page: what they share goes to ui/ or model/', () => {
    const across = [...siteGraph].flatMap(([path, imports]) =>
      imports.filter((target) => pageOf(path) && pageOf(target) && pageOf(path) !== pageOf(target)).map((target) => `${path} → ${target}`),
    )
    assert.deepEqual(across, [])
  })

  test('no import cycle', () => {
    assert.deepEqual(cyclesOf(siteGraph), [])
  })

  test('the domain imports nothing of the page: the sync runs it in Node', () => {
    const outside = [...siteGraph]
      .filter(([path]) => path.startsWith('domain/'))
      .flatMap(([path, imports]) => imports.filter((target) => !target.startsWith('domain/')).map((target) => `${path} → ${target}`))
    assert.deepEqual(outside, [])
  })

  test('the page loads every module, at the version of the deploy (npm run modules)', () => {
    const { eager, lazy } = pageModules()
    assert.deepEqual(siteModules.filter((path) => !eager.includes(path) && !lazy.includes(path)), [], 'a module the page never imports')
    assert.equal(currentBlock(readFileSync(join(SITE, 'index.html'), 'utf8')), moduleBlock(), 'index.html is out of date: npm run modules')
  })

  test('the page loads every style once, at the version of the deploy, touch.css last', () => {
    const html = readFileSync(join(SITE, 'index.html'), 'utf8')
    const linked = [...html.matchAll(/<link rel="stylesheet" href="([^"?]+)\?v=__BUILD__" \/>/g)].map((match) => match[1])
    assert.deepEqual(linked.toSorted(), filesOf(SITE, '.css').toSorted())
    assert.equal(linked.at(-1), 'styles/touch.css')
  })
})

describe('the sync', () => {
  test('every import leads to a module that exists', () => {
    const broken = [...syncGraph].flatMap(([path, imports]) =>
      imports
        .filter((target) => !syncGraph.has(target) && !existsSync(join(SCRIPTS, target)))
        .map((target) => `${path} → ${target}`),
    )
    assert.deepEqual(broken, [])
  })

  test('no import cycle', () => {
    assert.deepEqual(cyclesOf(syncGraph), [])
  })
})

describe('every file', () => {
  // A type says what a value is: any says nothing, and lets anything through unchecked. unknown, narrowed where read,
  // when a value really is unknown.
  test('never types anything as any', () => {
    const typed = [
      ...siteModules.map((path) => join(SITE, path)),
      ...syncModules.map((path) => join(SCRIPTS, path)),
      ...filesOf(join(ROOT, 'tests'), '.mjs').map((path) => join(ROOT, 'tests', path)),
    ]
    const found = typed.flatMap((file) =>
      // The types of the JSDoc, between the braces of a tag or a cast.
      [...readFileSync(file, 'utf8').matchAll(/@(?:type|param|returns?|typedef|template|property|satisfies)\s*\{([^@]*?)\}\s/g)]
        .filter((match) => /\bany\b/.test(match[1]))
        .map((match) => `${relative(ROOT, file)}: {${match[1]}}`),
    )
    const declarations = filesOf(join(ROOT, 'types'), '.d.ts').flatMap((path) =>
      readFileSync(join(ROOT, 'types', path), 'utf8')
        .split('\n')
        .filter((line) => !line.trim().startsWith('//') && /\bany\b/.test(line))
        .map((line) => `types/${path}: ${line.trim()}`),
    )
    assert.deepEqual([...found, ...declarations], [])
  })

  test('starts with a comment that says what it is for', () => {
    const files = [
      ...siteModules.map((path) => join(SITE, path)),
      ...syncModules.map((path) => join(SCRIPTS, path)),
      ...filesOf(join(ROOT, 'tests'), '.mjs').map((path) => join(ROOT, 'tests', path)),
    ]
    assert.deepEqual(
      files.filter((file) => !readFileSync(file, 'utf8').startsWith('//')).map((file) => relative(ROOT, file)),
      [],
    )
  })
})
