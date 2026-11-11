import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { after, before, test } from 'node:test'
import { Pool } from 'pg'
import * as argon2 from 'argon2'
import { getIntegrationProcessEnvironment } from '../../../scripts/integration-database.mjs'

let apiProcess
let apiUrl
let pool
let userId
let cookie
const email = `auth-${randomUUID()}@example.test`
const password = 'synthetic-auth-password'
const jwtSecret = 'integration-test-secret-at-least-thirty-two-bytes'
let processOutput = ''

process.env.JWT_SECRET = jwtSecret
const { AuthTokenService } = await import('../dist/modules/auth/auth-token.service.js')
const { cookieName, cookieOptions } = await import('../dist/modules/auth/auth.guard.js')

function signedToken(claimOverrides = {}, headerOverrides = {}) {
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT', ...headerOverrides })).toString(
    'base64url',
  )
  const claims = Buffer.from(
    JSON.stringify({
      sub: userId,
      sessionVersion: 0,
      iat: now,
      exp: now + 43_200,
      iss: 'trakia-api',
      aud: 'trakia-web',
      ...claimOverrides,
    }),
  ).toString('base64url')
  const body = `${header}.${claims}`
  return `${body}.${createHmac('sha256', jwtSecret).update(body).digest('base64url')}`
}

function sessionCookie(token) {
  return `${cookieName()}=${token}`
}

async function availablePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Could not determine a free port.')
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  return address.port
}

before(async () => {
  const env = getIntegrationProcessEnvironment()
  pool = new Pool({ connectionString: env.DATABASE_URL })
  userId = randomUUID()
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  })
  await pool.query('INSERT INTO users (id, email, password_hash, session_version) VALUES ($1, $2, $3, 0)', [
    userId,
    email,
    passwordHash,
  ])

  const port = await availablePort()
  apiUrl = `http://127.0.0.1:${port}/api`
  apiProcess = spawn(
    process.execPath,
    [resolve(process.cwd(), process.env.TRAKIA_DB_DIST ?? 'dist', 'main.js')],
    {
      cwd: process.cwd(),
      env: { ...env, PORT: String(port), JWT_SECRET: jwtSecret },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  apiProcess.stdout.on('data', (chunk) => {
    processOutput += chunk
  })
  apiProcess.stderr.on('data', (chunk) => {
    processOutput += chunk
  })
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (apiProcess.exitCode !== null) throw new Error(`API exited before ready.\n${processOutput}`)
    try {
      if ((await fetch(`${apiUrl}/health`)).ok) return
    } catch {
      /* API may still be starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`API did not become ready.\n${processOutput}`)
})

after(async () => {
  if (apiProcess && apiProcess.exitCode === null) {
    apiProcess.kill('SIGTERM')
    await Promise.race([
      new Promise((resolve) => apiProcess.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ])
    if (apiProcess.exitCode === null) apiProcess.kill('SIGKILL')
  }
  if (pool) {
    if (userId) await pool.query('DELETE FROM users WHERE id = $1', [userId])
    await pool.end()
  }
})

test('health remains public and other routes reject missing authentication', async () => {
  assert.equal((await fetch(`${apiUrl}/health`)).status, 200)
  assert.equal((await fetch(`${apiUrl}/auth/me`)).status, 401)
  const preflight = await fetch(`${apiUrl}/auth/me`, {
    method: 'OPTIONS',
    headers: {
      origin: 'http://localhost:5173',
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'content-type',
    },
  })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:5173')
})

test('auth rejects invalid JWTs and login returns a signed 12 hour HS256 session cookie', async () => {
  const tokens = new AuthTokenService()
  const invalidTokens = [
    signedToken({ exp: Math.floor(Date.now() / 1000) - 1 }),
    `${signedToken().slice(0, -1)}x`,
    signedToken({ iss: 'wrong-issuer' }),
    signedToken({ aud: 'wrong-audience' }),
    signedToken({}, { alg: 'none' }),
  ]
  for (const token of invalidTokens) {
    assert.equal(
      (await fetch(`${apiUrl}/auth/me`, { headers: { cookie: sessionCookie(token) } })).status,
      401,
    )
  }

  const invalid = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'missing@example.test', password }),
  })
  assert.equal(invalid.status, 401)
  const denied = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'incorrect-password' }),
  })
  assert.equal(denied.status, invalid.status)
  assert.equal(await denied.text(), await invalid.text())

  const login = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  assert.equal(login.status, 201)
  const setCookie = login.headers.get('set-cookie')
  assert.match(
    setCookie ?? '',
    /^trakia_session=.+; Max-Age=43200; Path=\/; Expires=.*; HttpOnly; SameSite=Lax/i,
  )
  assert.doesNotMatch(setCookie ?? '', /; Domain=/i)
  cookie = setCookie.split(';', 1)[0]
  const token = cookie.slice(cookie.indexOf('=') + 1)
  const claims = tokens.verify(token)
  assert.equal(claims.exp - claims.iat, 43_200)
  assert.equal(claims.iss, 'trakia-api')
  assert.equal(claims.aud, 'trakia-web')

  const me = await fetch(`${apiUrl}/auth/me`, { headers: { cookie } })
  assert.equal(me.status, 200)
  assert.deepEqual(await me.json(), { id: userId, email })

  const secondLogin = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  assert.equal(secondLogin.status, 201)
  const secondCookie = secondLogin.headers.get('set-cookie').split(';', 1)[0]
  assert.equal((await fetch(`${apiUrl}/auth/me`, { headers: { cookie: secondCookie } })).status, 200)

  const logout = await fetch(`${apiUrl}/auth/logout`, { method: 'POST', headers: { cookie } })
  assert.equal(logout.status, 201)
  const clearedCookie = logout.headers.get('set-cookie')
  assert.match(clearedCookie ?? '', /^trakia_session=;/i)
  assert.match(clearedCookie ?? '', /Expires=Thu, 01 Jan 1970/i)
  assert.match(clearedCookie ?? '', /HttpOnly/i)
  assert.match(clearedCookie ?? '', /SameSite=Lax/i)
  const {
    rows: [{ session_version: sessionVersion }],
  } = await pool.query('SELECT session_version FROM users WHERE id = $1', [userId])
  assert.equal(sessionVersion, 1)
  assert.equal((await fetch(`${apiUrl}/auth/me`, { headers: { cookie } })).status, 401)
  assert.equal((await fetch(`${apiUrl}/auth/me`, { headers: { cookie: secondCookie } })).status, 401)
})

test('requires JWT configuration at application startup', async () => {
  const env = getIntegrationProcessEnvironment()
  const port = await availablePort()
  const child = spawn(process.execPath, [resolve(process.cwd(), 'dist/main.js')], {
    cwd: process.cwd(),
    env: { ...env, PORT: String(port), NODE_ENV: 'test', JWT_SECRET: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (chunk) => {
    output += chunk
  })
  child.stderr.on('data', (chunk) => {
    output += chunk
  })
  const exitCode = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('API did not reject missing JWT_SECRET promptly.'))
    }, 5000)
    child.once('error', reject)
    child.once('exit', (code) => {
      clearTimeout(timeout)
      resolve(code)
    })
  })
  assert.notEqual(exitCode, 0)
  assert.match(output, /JWT_SECRET must be configured/)
  assert.doesNotMatch(output, /synthetic-auth-password|integration-test-secret/)
})

test('cookie settings are safe in development and production', () => {
  const previous = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  assert.equal(cookieName(), 'trakia_session')
  assert.deepEqual(cookieOptions(), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: false,
    maxAge: 43_200_000,
  })
  process.env.NODE_ENV = 'production'
  assert.equal(cookieName(), '__Host-trakia_session')
  assert.deepEqual(cookieOptions(), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: true,
    maxAge: 43_200_000,
  })
  if (previous === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = previous
})
