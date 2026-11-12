import assert from 'node:assert/strict'
import { test } from 'node:test'

const { HttpSecurityMiddleware } = await import('../dist/config/http-security.middleware.js')

function invoke(
  middleware,
  { method = 'POST', path = '/api/auth/login', origin, csrf, ip = '127.0.0.1' } = {},
) {
  const result = { status: 200, body: undefined, headers: {}, next: false }
  const request = {
    method,
    path,
    ip,
    get(name) {
      if (name.toLowerCase() === 'origin') return origin
      if (name.toLowerCase() === 'x-trakia-csrf') return csrf
      return undefined
    },
  }
  const response = {
    setHeader(name, value) {
      result.headers[name] = value
    },
    status(code) {
      result.status = code
      return this
    },
    json(body) {
      result.body = body
    },
  }
  middleware.use(request, response, () => (result.next = true))
  return result
}

test('rejects missing and untrusted Origin on state-changing requests', () => {
  const middleware = new HttpSecurityMiddleware(['https://trakia.example'])
  assert.equal(invoke(middleware, { csrf: '1' }).status, 403)
  assert.equal(invoke(middleware, { origin: 'https://attacker.example', csrf: '1' }).status, 403)
})

test('requires the CSRF header and allows a request with the configured Origin', () => {
  const middleware = new HttpSecurityMiddleware(['https://trakia.example'])
  assert.equal(invoke(middleware, { origin: 'https://trakia.example' }).status, 403)
  assert.equal(invoke(middleware, { origin: 'https://trakia.example', csrf: '1' }).next, true)
})

test('limits login to five requests per minute per resolved client IP', () => {
  const middleware = new HttpSecurityMiddleware(['https://trakia.example'])
  const options = { origin: 'https://trakia.example', csrf: '1', ip: '192.0.2.1' }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal(invoke(middleware, options).next, true)
  }
  const limited = invoke(middleware, options)
  assert.equal(limited.status, 429)
  assert.ok(Number(limited.headers['Retry-After']) > 0)
  assert.equal(invoke(middleware, { ...options, ip: '192.0.2.2' }).next, true)
})

test('does not rate limit other routes or preflight requests', () => {
  const middleware = new HttpSecurityMiddleware(['https://trakia.example'])
  for (let attempt = 0; attempt < 7; attempt += 1) {
    assert.equal(
      invoke(middleware, {
        method: 'OPTIONS',
        path: '/api/auth/login',
        origin: 'https://trakia.example',
        ip: '192.0.2.1',
      }).next,
      true,
    )
  }
  assert.equal(
    invoke(middleware, {
      path: '/api/auth/logout',
      origin: 'https://trakia.example',
      csrf: '1',
      ip: '192.0.2.1',
    }).next,
    true,
  )
})
