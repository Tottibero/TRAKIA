import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'

const outputDirectory = process.env.TRAKIA_DB_DIST ?? 'dist'
const configModuleUrl = pathToFileURL(resolve(process.cwd(), outputDirectory, 'config/database-config.js'))
const { getDatabaseConfig } = await import(configModuleUrl.href)

const validUrl = 'postgres://user:top-secret@localhost:5434/trakia_test'

test('builds PostgreSQL options with safe schema defaults', () => {
  const config = getDatabaseConfig({ DATABASE_URL: validUrl })
  assert.equal(config.type, 'postgres')
  assert.equal(config.host, 'localhost')
  assert.equal(config.port, 5434)
  assert.equal(config.database, 'trakia_test')
  assert.equal(config.username, 'user')
  assert.equal(config.password, 'top-secret')
  assert.equal(config.synchronize, false)
  assert.equal(config.migrationsRun, false)
  assert.equal(config.dropSchema, false)
  assert.equal(config.ssl, false)
  assert.deepEqual(getDatabaseConfig({ DATABASE_URL: validUrl, NODE_ENV: 'production' }).ssl, { rejectUnauthorized: true })
})

test('requires DATABASE_URL without exposing credentials', () => {
  assert.throws(() => getDatabaseConfig({}), (error) => {
    assert.match(error.message, /DATABASE_URL is required/)
    assert.doesNotMatch(error.message, /top-secret/)
    return true
  })
})

test('rejects non-PostgreSQL and incomplete URLs', () => {
  assert.throws(() => getDatabaseConfig({ DATABASE_URL: 'mysql://localhost/trakia' }), /postgres:\/\//)
  assert.throws(() => getDatabaseConfig({ DATABASE_URL: 'postgres://localhost' }), /include a host and database/)
})

test('enables certificate-verified TLS and rejects incompatible SSL settings', () => {
  const config = getDatabaseConfig({ DATABASE_URL: validUrl, DATABASE_SSL: 'true' })
  assert.deepEqual(config.ssl, { rejectUnauthorized: true })
  assert.throws(() => getDatabaseConfig({ DATABASE_URL: 'postgres://localhost/db?sslmode=disable', DATABASE_SSL: 'true' }), /conflicts/)
  assert.throws(() => getDatabaseConfig({ DATABASE_URL: validUrl, DATABASE_SSL: 'maybe' }), /DATABASE_SSL must/)
})

test('uses credentials already supplied by Compose when present', () => {
  const config = getDatabaseConfig({
    DATABASE_URL: 'postgres://db:5432/trakia_dev',
    POSTGRES_DB: 'trakia_dev',
    POSTGRES_USER: 'local-user',
    POSTGRES_PASSWORD: 'local-password',
  })
  assert.equal(config.database, 'trakia_dev')
  assert.equal(config.username, 'local-user')
  assert.equal(config.password, 'local-password')
})
