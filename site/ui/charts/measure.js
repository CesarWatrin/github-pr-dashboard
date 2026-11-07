// The width of a chart's text, to fit or cut its labels.

const CHART_FONT = '12px system-ui, -apple-system, "Segoe UI", sans-serif'

const measureContext = document.createElement('canvas').getContext('2d')

export function measureText(text) {
  measureContext.font = CHART_FONT

  return measureContext.measureText(text).width
}

export function truncateText(text, maxWidth) {
  if (measureText(text) <= maxWidth) {
    return text
  }
  let truncated = text
  while (truncated.length > 1 && measureText(`${truncated}…`) > maxWidth) {
    truncated = truncated.slice(0, -1)
  }

  return `${truncated}…`
}
