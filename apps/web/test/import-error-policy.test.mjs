import assert from 'node:assert/strict'
import test from 'node:test'
import { getImportErrorPresentation } from '../src/features/training-plan-imports/import-error-policy.js'

const issue = { code: 'INVALID_FORMAT', path: ['format'], message: 'Unsupported format' }

test('400 and 422 are document-validation failures and may carry contract issues', () => {
  for (const status of [400, 422]) {
    const result = getImportErrorPresentation({ status, issues: [issue] })
    assert.equal(result.kind, 'validation')
    assert.equal(result.issues[0], issue)
    assert.match(result.title, /incidencias del documento/)
  }
})

test('401 requests authentication and never surfaces response issues as document issues', () => {
  const result = getImportErrorPresentation({ status: 401, issues: [issue] })
  assert.equal(result.kind, 'authentication')
  assert.deepEqual(result.issues, [])
  assert.match(result.message, /Inicia sesión/)
})

test('403 reports an authorization problem without showing JSON validation issues', () => {
  const result = getImportErrorPresentation({ status: 403, issues: [issue] })
  assert.equal(result.kind, 'permission')
  assert.deepEqual(result.issues, [])
  assert.match(result.message, /acceso/)
})

test('404 is a missing endpoint/resource even if its body happens to contain issues', () => {
  const result = getImportErrorPresentation({ status: 404, issues: [issue] })
  assert.equal(result.kind, 'not-found')
  assert.deepEqual(result.issues, [])
  assert.match(result.title, /servicio de importación/)
  assert.doesNotMatch(result.message, /JSON|documento|formato/i)
})

test('409 reports an import conflict and does not become validation', () => {
  const result = getImportErrorPresentation({ status: 409, issues: [issue] })
  assert.equal(result.kind, 'conflict')
  assert.deepEqual(result.issues, [])
  assert.match(result.message, /cambió|conflicto/i)
})

test('413 and BODY_TOO_LARGE retain the file-size guidance', () => {
  for (const error of [{ status: 413 }, { status: 400, code: 'BODY_TOO_LARGE' }]) {
    const result = getImportErrorPresentation(error)
    assert.equal(result.kind, 'file-size')
    assert.match(result.message, /1 MiB/)
    assert.deepEqual(result.issues, [])
  }
})

test('5xx reports a server problem and ignores any attached issues', () => {
  for (const status of [500, 503]) {
    const result = getImportErrorPresentation({ status, issues: [issue] })
    assert.equal(result.kind, 'server')
    assert.deepEqual(result.issues, [])
    assert.match(result.message, /servidor|momentos/i)
  }
})

test('fetch connection failures get their own recovery message', () => {
  const error = new Error('internal fetch detail')
  error.name = 'ApiNetworkError'
  const result = getImportErrorPresentation(error)
  assert.equal(result.kind, 'connection')
  assert.match(result.message, /Comprueba tu conexión/)
  assert.doesNotMatch(result.message, /internal fetch detail/)
})
