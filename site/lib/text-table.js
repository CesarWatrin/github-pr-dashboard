// A table as plain text, for a chat to show in a block of code, where every character takes the same width: each column
// as wide as its widest cell, framed with + - and |, the first column to the left and the others to the right, each
// group on a line of its own across the table, then its rows. A row may carry a note after its frame (a colored dot).

/** @typedef {{ cells: string[], note?: string }} TextRow */

// Characters rather than UTF-16 units: an accented letter, a narrow space or a minus sign each take one.
/** @type {(text: string) => number} */
const widthOf = (text) => [...text].length

/**
 * @param {string[]} head
 * @param {{ label: string, rows: TextRow[] }[]} groups
 * @returns {string}
 */
export function textTable(head, groups) {
  const rows = groups.flatMap((group) => group.rows)
  const widths = head.map((title, column) => Math.max(widthOf(title), ...rows.map((row) => widthOf(row.cells[column] ?? ''))))
  /** @type {() => number} */
  const across = () => widths.reduce((total, width) => total + width, 0) + 3 * (widths.length - 1)
  // A group's label wider than the table widens its first column.
  widths[0] += Math.max(0, ...groups.map((group) => widthOf(group.label) - across()))
  /** @type {(text: string, width: number, right: boolean) => string} */
  const pad = (text, width, right) => {
    const space = ' '.repeat(Math.max(0, width - widthOf(text)))

    return right ? space + text : text + space
  }
  /** @type {(cells: string[]) => string} */
  const line = (cells) => `| ${widths.map((width, column) => pad(cells[column] ?? '', width, column > 0)).join(' | ')} |`
  const rule = `+${widths.map((width) => '-'.repeat(width + 2)).join('+')}+`

  return [
    rule,
    line(head),
    rule,
    ...groups.flatMap((group) => [
      `| ${pad(group.label, across(), false)} |`,
      rule,
      ...group.rows.map((row) => (row.note ? `${line(row.cells)} ${row.note}` : line(row.cells))),
      rule,
    ]),
  ].join('\n')
}
