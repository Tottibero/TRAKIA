import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  canonicalJson,
  ImportReviewReceiptService,
  InvalidImportReviewReceiptError,
  sha256,
} from '../dist/modules/training-plan-imports/import-review-receipt.js'

const receipts = new ImportReviewReceiptService('unit-test-secret-with-at-least-thirty-two-bytes')
const claims = {
  userId: '7d80cce8-2a68-411b-8918-60c40d903219',
  origin: 'local-import',
  planKey: 'base-cycle',
  documentHash: 'a'.repeat(64),
  proposalHash: 'b'.repeat(64),
  planVersion: 3,
}

test('canonical JSON ignores object formatting but preserves array order and null distinctions', () => {
  assert.equal(canonicalJson({ b: 2, a: { y: 1, x: 0 } }), canonicalJson({ a: { x: 0, y: 1 }, b: 2 }))
  assert.notEqual(canonicalJson({ values: ['a', 'b'] }), canonicalJson({ values: ['b', 'a'] }))
  assert.notEqual(canonicalJson({ value: null }), canonicalJson({}))
  assert.notEqual(
    sha256(canonicalJson({ origin: 'one', plan: {} })),
    sha256(canonicalJson({ origin: 'two', plan: {} })),
  )
})

test('signed review receipts expire at 15 minutes and reject changes', () => {
  const issuedAt = Date.parse('2026-11-14T11:00:00.000Z')
  const token = receipts.issue(claims, issuedAt)
  assert.equal(receipts.verify(token, issuedAt + 15 * 60 * 1000 - 1).userId, claims.userId)
  assert.throws(() => receipts.verify(token, issuedAt + 15 * 60 * 1000), InvalidImportReviewReceiptError)
  const [body, signature] = token.split('.')
  assert.throws(
    () => receipts.verify(`${body}.${signature.slice(0, -1)}x`, issuedAt),
    InvalidImportReviewReceiptError,
  )
})
