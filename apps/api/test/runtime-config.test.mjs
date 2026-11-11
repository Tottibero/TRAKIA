import assert from 'node:assert/strict'
import { test } from 'node:test'

const { getCorsOrigins, getPort } = await import('../dist/config/runtime-config.js')

test('uses the default API port when PORT is unset', () => {
  assert.equal(getPort(undefined), 3033)
})

test('accepts a valid configured port', () => {
  assert.equal(getPort('4100'), 4100)
})

test('rejects invalid configured ports', () => {
  assert.throws(() => getPort('abc'), /PORT must be an integer/)
  assert.throws(() => getPort('0'), /PORT must be an integer/)
  assert.throws(() => getPort('65536'), /PORT must be an integer/)
})

test('uses localhost as the default allowed CORS origin', () => {
  assert.deepEqual(getCorsOrigins(undefined), ['http://localhost:5173'])
})
