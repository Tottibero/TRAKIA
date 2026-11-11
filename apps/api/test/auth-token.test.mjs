import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { test } from 'node:test'

process.env.JWT_SECRET = 'unit-test-secret-that-is-at-least-thirty-two-bytes-long'
const { AuthTokenService } = await import('../dist/modules/auth/auth-token.service.js')

test('signs and verifies JWT claims with the configured issuer, audience, and lifetime', () => {
  const tokens = new AuthTokenService()
  const token = tokens.issue('user-id', 4, 1_800_000_000)
  const claims = tokens.verify(token, 1_800_000_001)
  assert.deepEqual(claims, {
    sub: 'user-id',
    sessionVersion: 4,
    iat: 1_800_000_000,
    exp: 1_800_043_200,
    iss: 'trakia-api',
    aud: 'trakia-web',
  })
})

test('rejects expired, altered, and non-HS256 tokens', () => {
  const tokens = new AuthTokenService()
  const token = tokens.issue('user-id', 0, 1_800_000_000)
  assert.throws(() => tokens.verify(token, 1_800_043_200), /Authentication required/)
  assert.throws(() => tokens.verify(`${token.slice(0, -1)}x`), /Authentication required/)
  const parts = token.split('.')
  parts[0] = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  assert.throws(() => tokens.verify(parts.join('.')), /Authentication required/)
})

test('rejects tokens with invalid issuer or audience even when correctly signed', () => {
  const tokens = new AuthTokenService()
  const now = 1_800_000_000
  const secret = process.env.JWT_SECRET
  for (const claims of [
    { sub: 'user-id', sessionVersion: 0, iat: now, exp: now + 43_200, iss: 'other', aud: 'trakia-web' },
    { sub: 'user-id', sessionVersion: 0, iat: now, exp: now + 43_200, iss: 'trakia-api', aud: 'other' },
  ]) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
    const body = `${header}.${payload}`
    const token = `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`
    assert.throws(() => tokens.verify(token, now), /Authentication required/)
  }
})

test('fails closed when the signing secret is missing or too short', async () => {
  const { getJwtSecret } = await import('../dist/config/runtime-config.js')
  const previous = process.env.JWT_SECRET
  delete process.env.JWT_SECRET
  assert.throws(() => getJwtSecret(), /JWT_SECRET must be configured/)
  assert.throws(() => new AuthTokenService(), /JWT_SECRET must be configured/)
  if (previous !== undefined) process.env.JWT_SECRET = previous
  assert.throws(() => getJwtSecret('short'), /JWT_SECRET must be configured/)
})
