import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import {
  getIntegrationDatabaseUrl,
  getIntegrationProcessEnvironment,
} from '../../../scripts/integration-database.mjs'

const runnerPath = fileURLToPath(new URL('../../../scripts/run-integration-tests.mjs', import.meta.url))
const validUrl = 'postgres://test-user:test-password@127.0.0.1:5434/trakia_test'

function runIntegrationRunner(env) {
  const childEnv = { ...env }
  delete childEnv.NODE_TEST_CONTEXT
  return spawnSync(process.execPath, [runnerPath], { env: childEnv, encoding: 'utf8' })
}

test('accepts the authorized test URL without inherited database variables', () => {
  const env = getIntegrationProcessEnvironment({ TRAKIA_TEST_DATABASE_URL: validUrl })
  assert.equal(getIntegrationDatabaseUrl(env).pathname, '/trakia_test')
  assert.equal(env.DATABASE_URL, validUrl)
  assert.equal(env.POSTGRES_DB, undefined)
  assert.equal(env.PGDATABASE, undefined)
})

test('test URL overrides inherited POSTGRES_DB destination', () => {
  const env = getIntegrationProcessEnvironment({
    TRAKIA_TEST_DATABASE_URL: validUrl,
    POSTGRES_DB: 'trakia_dev',
  })
  assert.equal(new URL(env.DATABASE_URL).pathname, '/trakia_test')
  assert.equal(env.POSTGRES_DB, undefined)
  assert.equal(env.PGDATABASE, undefined)
})

test('test URL overrides inherited PGDATABASE destination', () => {
  const env = getIntegrationProcessEnvironment({
    TRAKIA_TEST_DATABASE_URL: validUrl,
    PGDATABASE: 'trakia_dev',
  })
  assert.equal(new URL(env.DATABASE_URL).pathname, '/trakia_test')
  assert.equal(env.POSTGRES_DB, undefined)
  assert.equal(env.PGDATABASE, undefined)
})

test('rejects missing configuration before invoking build or migration commands', () => {
  const env = { ...process.env, POSTGRES_DB: 'trakia_dev', PGDATABASE: 'trakia_dev' }
  delete env.TRAKIA_TEST_DATABASE_URL
  const result = runIntegrationRunner(env)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /TRAKIA_TEST_DATABASE_URL is required/)
  assert.equal(result.stdout, '')
})

for (const database of ['trakia_dev', 'postgres', 'trakia_prod']) {
  test(`rejects unauthorized database ${database} before invoking migrations`, () => {
    const env = {
      ...process.env,
      TRAKIA_TEST_DATABASE_URL: `postgres://user:password@localhost:5434/${database}`,
      POSTGRES_DB: 'trakia_dev',
      PGDATABASE: 'trakia_dev',
    }
    const result = runIntegrationRunner(env)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /authorized only for local PostgreSQL database trakia_test/)
    assert.equal(result.stdout, '')
  })
}
