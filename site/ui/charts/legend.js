// The legend of a chart's series.

import { capitalize } from '../../lib/format.js'
import { el } from '../dom.js'

export function renderLegend(container, series) {
  container.replaceChildren(
    ...series.map((item) => {
      const swatch = el('span', { className: 'swatch' })
      swatch.style.background = item.color

      return el('span', {}, swatch, document.createTextNode(capitalize(item.label)))
    }),
  )
}
