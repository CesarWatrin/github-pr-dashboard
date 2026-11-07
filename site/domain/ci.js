// CI stats of a range, from the Actions runs per workflow and Paris day the sync publishes.

import { bucketOfDay, bucketsOf } from './buckets.js'
import { median, percentile, rate } from './math.js'
import { parisDay } from './time.js'

// CI stats of the range [start, end), from the runs per workflow and Paris day of the sync: a day counts whole.
export function computeCi(workflows, { start, end, bucket }) {
  const firstDay = parisDay(start)
  const lastDay = parisDay(end - 1)
  const keys = bucketsOf(start, end, bucket)
  const empty = () => ({ runs: 0, failed: 0, rerun: 0, durations: [] })
  const buckets = new Map(keys.map(({ key }) => [key, empty()]))
  const add = (stats, [runs, failed, rerun, durations]) => {
    stats.runs += runs
    stats.failed += failed
    stats.rerun += rerun
    // One by one: a busy workflow has more durations than a spread call takes arguments.
    for (const duration of durations) {
      stats.durations.push(duration)
    }
  }
  const summary = (stats) => ({
    runs: stats.runs,
    failureRate: rate(stats.failed, stats.runs),
    rerunRate: rate(stats.rerun, stats.runs),
    medianSeconds: median(stats.durations),
    p90Seconds: percentile(stats.durations, 0.9),
  })

  const total = empty()
  const rows = []
  for (const { repo, workflow, days } of workflows) {
    const stats = empty()
    for (const [day, values] of Object.entries(days)) {
      if (day >= firstDay && day <= lastDay) {
        add(stats, values)
        add(buckets.get(bucketOfDay(day, bucket)), values)
      }
    }
    if (stats.runs > 0) {
      add(total, [stats.runs, stats.failed, stats.rerun, stats.durations])
      rows.push({ repo, workflow, ...summary(stats) })
    }
  }

  return {
    totals: summary(total),
    series: keys.map(({ key, partial }) => ({ key, partial, ...summary(buckets.get(key)) })),
    workflows: rows,
  }
}
