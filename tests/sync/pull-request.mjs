// A made-up pull request shaped like the snapshot's, for the tests of the sync.

export const minutes = (iso) => Date.parse(iso) / 60_000

export function pullRequest(fields) {
  return {
    repo: 'web',
    title: 'Some change',
    state: fields.mergedAt ? 'MERGED' : 'OPEN',
    draft: false,
    createdAt: '2026-03-01T09:00:00Z',
    mergedAt: null,
    closedAt: null,
    additions: 10,
    deletions: 5,
    head: 'feature/change',
    base: 'develop',
    author: 'alice',
    mergedBy: null,
    reviews: [],
    comments: [],
    checks: 'SUCCESS',
    ...fields,
  }
}
