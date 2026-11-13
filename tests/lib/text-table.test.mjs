// Tests of the tables written as text (site/lib/text-table.js), as « Copier le bilan » pastes them. Made-up figures.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { textTable } from '../../site/lib/text-table.js'

describe('textTable', () => {
  test('pads each column to its widest cell, the first to the left, the others to the right, a group across', () => {
    const table = textTable(
      ['Indicateur', 'Mai', 'Évolution'],
      [
        { label: 'LIVRAISON', rows: [{ cells: ['PR ouvertes', '1 204', '+9 %'], note: '🟢' }, { cells: ['Délai', '3 h', '–'] }] },
        { label: 'REVUE', rows: [{ cells: ['PR relues', '87', '−12 %'] }] },
      ],
    )
    assert.equal(
      table,
      [
        '+-------------+-------+-----------+',
        '| Indicateur  |   Mai | Évolution |',
        '+-------------+-------+-----------+',
        '| LIVRAISON                       |',
        '+-------------+-------+-----------+',
        '| PR ouvertes | 1 204 |      +9 % | 🟢',
        '| Délai       |   3 h |         – |',
        '+-------------+-------+-----------+',
        '| REVUE                           |',
        '+-------------+-------+-----------+',
        '| PR relues   |    87 |     −12 % |',
        '+-------------+-------+-----------+',
      ].join('\n'),
    )
  })

  test('a group wider than the table widens its first column', () => {
    const lines = textTable(['A', 'B'], [{ label: 'A rather long group', rows: [{ cells: ['x', '1'] }] }]).split('\n')
    assert.equal(lines[3], '| A rather long group |')
    assert.ok(lines.every((line) => line.length === lines[0].length))
  })
})
