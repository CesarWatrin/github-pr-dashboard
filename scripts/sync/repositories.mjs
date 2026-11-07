// The type of each repository (front, back, mobile, other) and its technologies, from its languages and manifests.

import { round } from '../../site/domain/math.js'
import { CATEGORY_OVERRIDES, ORG } from './config.mjs'
import { graphql } from './github.mjs'
import { REPOSITORY_DETAILS_QUERY } from './queries.mjs'

/** @type {Map<string, Category>} */
const LANGUAGE_CATEGORIES = new Map(
  Object.entries({
    front: ['Vue', 'Svelte', 'SCSS', 'CSS', 'Less', 'HTML'],
    back: ['PHP', 'Blade', 'Go', 'Rust', 'Python', 'Java', 'Ruby', 'C#', 'PLpgSQL'],
    mobile: ['Dart', 'Swift', 'Kotlin', 'Objective-C'],
    other: ['HCL', 'Dockerfile', 'Makefile', 'Shell', 'Jinja', 'Go Template', 'Batchfile', 'CMake'],
  }).flatMap(([category, languages]) => languages.map((language) => /** @type {[string, Category]} */ ([language, category]))),
)
const SCRIPT_LANGUAGES = ['TypeScript', 'JavaScript']
const FRAMEWORK_LANGUAGES = ['Vue', 'Svelte']

// Technologies: the languages of a repository grouped under the framework they serve, read from its root manifests
// (composer.json, package.json, pubspec.yaml). PHP and Blade make Laravel, Vue and TypeScript make Nuxt, and so on.
const FRAMEWORK_DEPENDENCIES = new Map(
  Object.entries({
    'laravel/framework': 'Laravel',
    'symfony/framework-bundle': 'Symfony',
    nuxt: 'Nuxt',
    next: 'Next.js',
    vitepress: 'VitePress',
    '@nestjs/core': 'NestJS',
    vue: 'Vue',
    react: 'React',
    svelte: 'Svelte',
  }),
)
const PHP_FRAMEWORKS = ['Laravel', 'Symfony']
// The first one found wins: a Nuxt project depends on Vue too.
const WEB_FRAMEWORKS = ['Nuxt', 'Next.js', 'VitePress', 'NestJS', 'Vue', 'React', 'Svelte']
const WEB_LANGUAGES = ['Vue', 'Svelte', 'TypeScript', 'JavaScript', 'HTML', 'CSS', 'SCSS', 'Less']
// Native code of the iOS and Android shells around a Flutter application.
const FLUTTER_LANGUAGES = ['Dart', 'Swift', 'Kotlin', 'Objective-C', 'C++', 'C', 'CMake', 'Ruby']
/** @type {Record<string, string>} */
const TECHNOLOGY_NAMES = { HCL: 'Terraform', Dockerfile: 'Docker', PLpgSQL: 'PostgreSQL', 'Go Template': 'Go', Makefile: 'Make' }
const MIN_TECHNOLOGY_SHARE = 0.02

// A manifest of npm or Composer: only its dependencies are read.
/**
 * @param {GithubBlob} blob
 * @returns {{
 *   require?: Record<string, string>, dependencies?: Record<string, string>, devDependencies?: Record<string, string>,
 * }}
 */
function parseManifest(blob) {
  try {
    return JSON.parse(blob?.text ?? '{}')
  } catch {
    return {}
  }
}

/**
 * @param {GithubRepositoryDetails} node
 * @returns {string[]}
 */
function frameworksOf(node) {
  const composer = parseManifest(node.composer)
  const npm = parseManifest(node.packageJson)
  const dependencies = [composer.require, npm.dependencies, npm.devDependencies].flatMap((list) => Object.keys(list ?? {}))
  const frameworks = /** @type {string[]} */ (
    dependencies.map((dependency) => FRAMEWORK_DEPENDENCIES.get(dependency)).filter(Boolean)
  )
  if (node.pubspec?.text?.includes('flutter')) {
    frameworks.push('Flutter')
  }

  return [...new Set(frameworks)]
}

// Languages of every repository of the organization, as [name, bytes] pairs largest first, and the frameworks its
// manifests declare.
export async function fetchRepositoryDetails() {
  /** @type {{ languages: Record<string, RepositoryLanguages>, frameworks: Record<string, string[]> }} */
  const details = { languages: {}, frameworks: {} }
  /** @type {string | null} */
  let cursor = null
  do {
    /** @type {GraphqlAnswer<typeof REPOSITORY_DETAILS_QUERY>} */
    const data = await graphql(REPOSITORY_DETAILS_QUERY, { org: ORG, cursor })
    const { nodes, pageInfo } = data.organization.repositories
    for (const node of nodes) {
      details.languages[node.name] = node.languages.edges.map((edge) => [edge.node.name, edge.size])
      details.frameworks[node.name] = frameworksOf(node)
    }
    cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null
  } while (cursor)

  return details
}

/**
 * @param {string} language
 * @param {string[]} frameworks
 */
function technologyOf(language, frameworks) {
  if (language === 'PHP' || language === 'Blade') {
    return PHP_FRAMEWORKS.find((framework) => frameworks.includes(framework)) ?? 'PHP'
  }
  if (WEB_LANGUAGES.includes(language)) {
    return WEB_FRAMEWORKS.find((framework) => frameworks.includes(framework)) ?? language
  }
  if (FLUTTER_LANGUAGES.includes(language) && frameworks.includes('Flutter')) {
    return 'Flutter'
  }

  return TECHNOLOGY_NAMES[language] ?? language
}

/**
 * @param {string} repo
 * @param {RepositoryLanguages} languages
 * @returns {Category}
 */
export function repositoryCategory(repo, languages) {
  if (CATEGORY_OVERRIDES.has(repo)) {
    return /** @type {Category} */ (CATEGORY_OVERRIDES.get(repo))
  }
  const withVue = languages.some(([name]) => FRAMEWORK_LANGUAGES.includes(name))
  /** @type {Map<Category, number>} */
  const sizes = new Map()
  for (const [name, size] of languages) {
    const category = SCRIPT_LANGUAGES.includes(name) ? (withVue ? 'front' : 'back') : LANGUAGE_CATEGORIES.get(name)
    if (category) {
      sizes.set(category, (sizes.get(category) ?? 0) + size)
    }
  }

  return [...sizes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'other'
}

// Share of each technology in the code of a repository, without the marginal ones.
/**
 * @param {RepositoryLanguages} languages
 * @param {string[]} frameworks
 * @returns {[name: string, share: number][]}
 */
export function technologyShares(languages, frameworks) {
  const total = languages.reduce((sum, [, size]) => sum + size, 0)
  /** @type {Map<string, number>} */
  const shares = new Map()
  for (const [language, size] of languages) {
    const technology = technologyOf(language, frameworks)
    shares.set(technology, (shares.get(technology) ?? 0) + size / total)
  }

  return [...shares]
    .map(([name, share]) => /** @type {[string, number]} */ ([name, round(share, 3)]))
    .filter(([, share]) => share >= MIN_TECHNOLOGY_SHARE)
    .sort((a, b) => b[1] - a[1])
}
