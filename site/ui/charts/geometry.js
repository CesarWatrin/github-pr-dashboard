// Paths and steps shared by the charts.

export function niceStep(rawStep, integer) {
  const power = 10 ** Math.floor(Math.log10(rawStep))
  const fraction = rawStep / power
  const nice = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power

  return integer ? Math.max(1, nice) : nice
}

// Square at the baseline, 4px rounded at the data end.
export function columnPath(x, y, width, height) {
  const radius = Math.min(4, width / 2, height)

  return [
    `M${x},${y + height}`,
    `V${y + radius}`,
    `A${radius},${radius} 0 0 1 ${x + radius},${y}`,
    `H${x + width - radius}`,
    `A${radius},${radius} 0 0 1 ${x + width},${y + radius}`,
    `V${y + height}`,
    'Z',
  ].join(' ')
}

// A part of a stacked bar, square on every side.
export const squarePath = (x, y, width, height) => `M${x},${y} H${x + width} V${y + height} H${x} Z`

export function barPath(x, y, width, height) {
  const radius = Math.min(4, height / 2, width)

  return [
    `M${x},${y}`,
    `H${x + width - radius}`,
    `A${radius},${radius} 0 0 1 ${x + width},${y + radius}`,
    `V${y + height - radius}`,
    `A${radius},${radius} 0 0 1 ${x + width - radius},${y + height}`,
    `H${x}`,
    'Z',
  ].join(' ')
}
