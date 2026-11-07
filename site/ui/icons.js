// Technology logos, from the local sprite (assets/technology-icons.svg, Simple Icons, CC0).

import { PAGE_BUILD } from '../services/build.js'
import { svg } from './dom.js'

export const ICONS_URL = `assets/technology-icons.svg${PAGE_BUILD ? `?v=${PAGE_BUILD}` : ''}`

// Logo in technology-icons.svg and brand color of each technology. A third value flags a brand color too close to
// the light or dark surface: the logo takes the text color there.
const TECHNOLOGY_ICONS = {
  Laravel: ['laravel', '#ff2d20'],
  Symfony: ['symfony', '#000000', 'dark'],
  Nuxt: ['nuxt', '#00dc82', 'light'],
  'Next.js': ['nextdotjs', '#000000', 'dark'],
  VitePress: ['vitepress', '#5c73e7'],
  NestJS: ['nestjs', '#e0234e'],
  Vue: ['vuedotjs', '#4fc08d'],
  React: ['react', '#61dafb', 'light'],
  Svelte: ['svelte', '#ff3e00'],
  Flutter: ['flutter', '#02569b'],
  PHP: ['php', '#777bb4'],
  TypeScript: ['typescript', '#3178c6'],
  JavaScript: ['javascript', '#f7df1e', 'light'],
  Dart: ['dart', '#0175c2'],
  Go: ['go', '#00add8'],
  Rust: ['rust', '#000000', 'dark'],
  Python: ['python', '#3776ab'],
  Ruby: ['ruby', '#cc342d'],
  Java: ['openjdk', '#000000', 'dark'],
  'C#': ['dotnet', '#512bd4'],
  Kotlin: ['kotlin', '#7f52ff'],
  Swift: ['swift', '#f05138'],
  'C++': ['cplusplus', '#00599c'],
  C: ['c', '#a8b9cc', 'light'],
  HTML: ['html5', '#e34f26'],
  CSS: ['css', '#663399'],
  SCSS: ['sass', '#cc6699'],
  Less: ['less', '#1d365d', 'dark'],
  Shell: ['gnubash', '#4eaa25'],
  Terraform: ['terraform', '#844fba'],
  Docker: ['docker', '#2496ed'],
  PostgreSQL: ['postgresql', '#4169e1'],
  CMake: ['cmake', '#064f8c'],
  Jinja: ['jinja', '#7e0c1b', 'dark'],
}
export const ICON_SIZE = 16

// Technology logo, as an inline SVG pointing to the sprite; a generic code glyph for unknown ones.
export function technologyIcon(technology, attributes = {}) {
  const [slug, color, faint] = TECHNOLOGY_ICONS[technology] ?? ['code']
  const icon = svg('svg', {
    class: faint ? `lang-icon is-faint-on-${faint}` : 'lang-icon',
    viewBox: '0 0 24 24',
    width: ICON_SIZE,
    height: ICON_SIZE,
    'aria-hidden': 'true',
    ...attributes,
  })
  if (color) {
    icon.style.setProperty('--logo', color)
  }
  icon.append(svg('use', { href: `${ICONS_URL}#${slug}` }))

  return icon
}
