// The sync reads its configuration when loaded: a made-up one, set by this module, which each test of the sync imports
// first. Its published stats go to a temporary folder, no address of a deployed page is known, and the calls to GitHub
// get made-up answers: the tests never reach the network.

import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after } from 'node:test'

// Synchronous: a module that waits would let the modules imported after it load before it is done.
const statsFolder = mkdtempSync(join(tmpdir(), 'sync-test-'))
process.env.ORG = 'example-org'
process.env.DASHBOARD_PASSWORD = 'test-password'
process.env.GITHUB_TOKEN = 'test-token'
process.env.BOT_USERS = 'robot, dependabot'
process.env.REPO_CATEGORIES = 'docs-site:other'
process.env.STATS_PATH = join(statsFolder, 'stats.enc.json')
delete process.env.DISPATCH_TOKEN
delete process.env.GITHUB_REPOSITORY
delete process.env.PUBLISHED_STATS_URL
delete process.env.FULL_SYNC_PASSWORD
delete process.env.FULL_SYNC_PROOF
delete process.env.SQUADS
after(() => rm(statsFolder, { recursive: true, force: true }))
