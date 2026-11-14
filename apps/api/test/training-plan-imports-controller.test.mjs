import assert from 'node:assert/strict'
import test from 'node:test'
import {
  TrainingPlanImportsController,
  TRAINING_PLAN_IMPORT_ORIGIN,
} from '../dist/modules/training-plan-imports/training-plan-imports.controller.js'
import {
  ImportConfirmationConflictError,
  InvalidImportConfirmationError,
} from '../dist/modules/training-plan-imports/training-plan-import-confirmation.service.js'
import { InvalidImportReviewReceiptError } from '../dist/modules/training-plan-imports/import-review-receipt.js'

const proposal = {
  key: 'base-plan',
  name: 'Base plan',
  startDate: '2026-11-14',
  endDate: '2026-11-14',
  days: [{ type: 'rest', key: 'rest-day', date: '2026-11-14' }],
}

function makeController(reviewResult = undefined, confirmationResult = undefined) {
  const calls = { review: [], confirmation: [] }
  const review = {
    review: async (...args) => {
      calls.review.push(args)
      return reviewResult
    },
  }
  const confirmation = {
    confirm: async (...args) => {
      calls.confirmation.push(args)
      return confirmationResult
    },
  }
  return { controller: new TrainingPlanImportsController(review, confirmation), calls }
}

test('review adapts the fixed origin and omits persisted ids/version from its public response', async () => {
  const { controller, calls } = makeController({
    valid: true,
    confirmable: true,
    issues: [],
    plan: { id: 'internal-id', version: 7, definition: proposal },
    changes: [{ kind: 'plan', key: 'base-plan', path: ['plan'], status: 'created' }],
    conflicts: [],
    reviewToken: 'opaque-receipt',
    reviewExpiresAt: '2026-11-14T12:00:00.000Z',
  })
  const result = await controller.createReview({ authUserId: 'user-id' }, { document: { any: 'json' } })
  assert.equal(calls.review[0][0], TRAINING_PLAN_IMPORT_ORIGIN)
  assert.equal(calls.review[0][2], 'user-id')
  assert.deepEqual(result.proposal, proposal)
  assert.equal('id' in result, false)
  assert.equal('version' in result, false)
})

test('confirmation forwards the fixed origin and strips operation persistence metadata', async () => {
  const operationId = '9f298cae-7eb1-4d44-9028-32919f869105'
  const { controller, calls } = makeController(undefined, {
    status: 'confirmed',
    operationId,
    planId: 'internal-id',
    version: 7,
    changes: [{ kind: 'plan', key: 'base-plan', status: 'created' }],
  })
  const result = await controller.confirm(
    { authUserId: 'user-id' },
    { document: null, reviewToken: 'opaque-receipt', operationId },
  )
  assert.equal(calls.confirmation[0][1], TRAINING_PLAN_IMPORT_ORIGIN)
  assert.equal(calls.confirmation[0][0], 'user-id')
  assert.deepEqual(result, {
    status: 'confirmed',
    operationId,
    changes: [{ kind: 'plan', key: 'base-plan', status: 'created' }],
  })
})

test('confirmation maps domain failures to stable HTTP errors', async (context) => {
  const operationId = '9f298cae-7eb1-4d44-9028-32919f869105'
  for (const [error, expectedStatus, expectedCode] of [
    [
      new InvalidImportConfirmationError([{ code: 'INVALID_PLAN', path: ['plan'], message: 'invalid' }]),
      422,
      'DOCUMENT_INVALID',
    ],
    [new ImportConfirmationConflictError('STALE_IMPORT_REVIEW', 'stale'), 409, 'STALE_IMPORT_REVIEW'],
    [new InvalidImportReviewReceiptError(), 409, 'INVALID_OR_EXPIRED_REVIEW_RECEIPT'],
  ]) {
    await context.test(expectedCode, async () => {
      const { controller } = makeController(undefined, undefined)
      controller.confirmation.confirm = async () => {
        throw error
      }
      await assert.rejects(
        controller.confirm(
          { authUserId: 'user-id' },
          {
            document: {},
            reviewToken: 'opaque-receipt',
            operationId,
          },
        ),
        (caught) => {
          assert.equal(caught.getStatus(), expectedStatus)
          assert.equal(caught.getResponse().code, expectedCode)
          return true
        },
      )
    })
  }
})
