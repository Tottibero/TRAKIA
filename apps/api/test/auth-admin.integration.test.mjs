import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import dataSource from '../dist/database/data-source.js'
import { PasswordService } from '../dist/modules/users/password.service.js'
import { getIntegrationDatabaseUrl } from '../../../scripts/integration-database.mjs'

const expectedDatabase = decodeURIComponent(getIntegrationDatabaseUrl().pathname.slice(1))
const script = fileURLToPath(new URL('../scripts/auth-admin.mjs', import.meta.url))

function runCommand(operation, email, password, confirmation = password, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, operation], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk))
    child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk))
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }))
    child.stdin.end(`${email}\n${password}\n${confirmation}\n`)
  })
}

test('admin CLI reports Nest initialization failure instead of aborting silently', async () => {
  const env = { ...process.env }
  delete env.DATABASE_URL
  const password = 'synthetic initialization password'
  const result = await runCommand('bootstrap', 'init@example.test', password, password, env)

  assert.equal(result.code, 1)
  assert.equal(result.signal, null)
  assert.match(result.stdout, /Falta DATABASE_URL/)
  assert.doesNotMatch(
    `${result.stdout}\n${result.stderr}`,
    /synthetic initialization password|postgres(?:ql)?:\/\//i,
  )
})

test('admin CLI bootstraps, rejects repeats, resets, and serializes concurrent bootstraps', async () => {
  const suffix = randomUUID()
  const firstEmail = `hc-01-05b-${suffix}-first@example.test`
  const secondEmail = `hc-01-05b-${suffix}-second@example.test`
  const raceEmails = [`hc-01-05b-${suffix}-race-a@example.test`, `hc-01-05b-${suffix}-race-b@example.test`]
  const testEmails = [firstEmail, secondEmail, ...raceEmails]
  const firstPassword = 'integration first synthetic phrase'
  const replacementPassword = 'integration replacement synthetic phrase'
  const racePassword = 'integration concurrent synthetic phrase'

  await dataSource.initialize()
  try {
    const [{ database }] = await dataSource.query('SELECT current_database() AS database')
    assert.equal(database, expectedDatabase)
    assert.equal(expectedDatabase, 'trakia_test')
    const [{ count }] = await dataSource.query('SELECT count(*)::int AS count FROM users')
    assert.equal(count, 0, 'refusing bootstrap integration unless trakia_test has no users')

    let result = await runCommand('bootstrap', firstEmail, firstPassword)
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`)
    assert.ok(!result.stdout.includes(firstPassword) && !result.stderr.includes(firstPassword))
    let [user] = await dataSource.query(
      'SELECT id, password_hash, session_version FROM users WHERE email = $1',
      [firstEmail],
    )
    assert.ok(user)
    assert.equal(user.session_version, 0)
    assert.match(user.password_hash, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
    assert.equal(await new PasswordService().verify(user.password_hash, firstPassword), true)

    result = await runCommand('bootstrap', secondEmail, 'integration rejected synthetic phrase')
    assert.equal(result.code, 1)
    assert.match(result.stdout, /solo está permitido cuando no existen usuarios/)
    assert.ok(!result.stdout.includes('integration rejected synthetic phrase'))
    const [{ count: afterRepeat }] = await dataSource.query('SELECT count(*)::int AS count FROM users')
    assert.equal(afterRepeat, 1)

    result = await runCommand('reset-password', firstEmail, replacementPassword)
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`)
    assert.ok(!result.stdout.includes(replacementPassword) && !result.stderr.includes(replacementPassword))
    ;[user] = await dataSource.query(
      'SELECT id, password_hash, session_version FROM users WHERE email = $1',
      [firstEmail],
    )
    assert.equal(user.session_version, 1)
    assert.equal(await new PasswordService().verify(user.password_hash, replacementPassword), true)
    assert.equal(await new PasswordService().verify(user.password_hash, firstPassword), false)

    result = await runCommand('reset-password', `${firstEmail}-missing`, replacementPassword)
    assert.equal(result.code, 1)
    assert.match(result.stdout, /No existe un usuario/)
    assert.ok(!result.stdout.includes(replacementPassword))

    result = await runCommand('bootstrap', `${firstEmail}-invalid`, 'too-short')
    assert.equal(result.code, 1)
    assert.match(result.stdout, /at least 12 characters/)
    assert.ok(!result.stdout.includes('too-short'))

    await dataSource.query('DELETE FROM users WHERE email = $1', [firstEmail])
    const [{ count: afterCleanup }] = await dataSource.query('SELECT count(*)::int AS count FROM users')
    assert.equal(afterCleanup, 0)

    const outcomes = await Promise.all(
      raceEmails.map((email) => runCommand('bootstrap', email, racePassword)),
    )
    assert.deepEqual(outcomes.map(({ code }) => code).sort(), [0, 1])
    assert.ok(
      outcomes.every(
        ({ stdout, stderr }) => !stdout.includes(racePassword) && !stderr.includes(racePassword),
      ),
    )
    const created = await dataSource.query('SELECT email FROM users')
    assert.equal(created.length, 1)
    assert.ok(raceEmails.includes(created[0].email))
  } finally {
    const [{ database }] = await dataSource.query('SELECT current_database() AS database')
    assert.equal(database, 'trakia_test')
    await dataSource.query('DELETE FROM users WHERE email = ANY($1::text[])', [testEmails])
    const [{ remaining }] = await dataSource.query(
      'SELECT count(*)::int AS remaining FROM users WHERE email = ANY($1::text[])',
      [testEmails],
    )
    assert.equal(remaining, 0)
    await dataSource.destroy()
  }
})
