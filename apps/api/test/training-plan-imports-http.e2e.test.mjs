import assert from 'node:assert/strict'
import test from 'node:test'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { ImportBodyParserExceptionFilter } from '../dist/config/import-body-parser-exception.filter.js'
import { registerJsonBodyParser } from '../dist/config/json-body-parser.js'
import { HttpSecurityMiddleware } from '../dist/config/http-security.middleware.js'
import { TrainingPlanImportConfirmationService } from '../dist/modules/training-plan-imports/training-plan-import-confirmation.service.js'
import { TrainingPlanImportReviewService } from '../dist/modules/training-plan-imports/training-plan-import-review.service.js'
import {
  TrainingPlanImportsController,
  TRAINING_PLAN_IMPORT_ORIGIN,
} from '../dist/modules/training-plan-imports/training-plan-imports.controller.js'

const reviewCalls = []

class TrainingPlanImportHttpTestModule {}
Module({
  controllers: [TrainingPlanImportsController],
  providers: [
    {
      provide: TrainingPlanImportReviewService,
      useValue: {
        review: async (...args) => {
          reviewCalls.push(args)
          return {
            valid: false,
            confirmable: false,
            issues: [{ code: 'INVALID_STRUCTURE', path: ['format'], message: 'Invalid format' }],
            changes: [],
            conflicts: [],
          }
        },
      },
    },
    {
      provide: TrainingPlanImportConfirmationService,
      useValue: { confirm: async () => assert.fail('not called') },
    },
  ],
})(TrainingPlanImportHttpTestModule)

test('training plan import HTTP routes enforce security, JSON parsing, and the 1 MiB body limit', async (context) => {
  reviewCalls.length = 0
  const app = await NestFactory.create(TrainingPlanImportHttpTestModule, { bodyParser: false, logger: false })
  registerJsonBodyParser(app)
  app.useGlobalFilters(new ImportBodyParserExceptionFilter())
  app.use(new HttpSecurityMiddleware(['http://localhost']).use)
  app.use((request, _response, next) => {
    request.authUserId = '7d80cce8-2a68-411b-8918-60c40d903219'
    next()
  })
  app.setGlobalPrefix('api')
  await app.listen(0, '127.0.0.1')
  const port = app.getHttpServer().address().port
  const endpoint = `http://127.0.0.1:${port}/api/training-plan-imports/reviews`
  const headers = { origin: 'http://localhost', 'x-trakia-csrf': '1' }
  context.after(async () => app.close())

  await context.test('domain-invalid documents return a review result and use the fixed origin', async () => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ document: { format: 'wrong' } }),
    })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).valid, false)
    assert.equal(reviewCalls[0][0], TRAINING_PLAN_IMPORT_ORIGIN)
    assert.equal(reviewCalls[0][2], '7d80cce8-2a68-411b-8918-60c40d903219')
  })

  await context.test('CSRF validation remains active', async () => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { origin: 'http://localhost', 'content-type': 'application/json' },
      body: JSON.stringify({ document: {} }),
    })
    assert.equal(response.status, 403)
  })

  await context.test('malformed JSON is a safe 400', async () => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: '{',
    })
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), {
      code: 'INVALID_JSON',
      message: 'La solicitud no contiene JSON válido.',
    })
  })

  await context.test('JSON bodies larger than 1 MiB are rejected with 413', async () => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ document: { padding: 'x'.repeat(1024 * 1024) } }),
    })
    assert.equal(response.status, 413)
    assert.deepEqual(await response.json(), {
      code: 'BODY_TOO_LARGE',
      message: 'El archivo supera el límite de 1 MiB.',
    })
  })

  await context.test('non-import API routes retain the existing 100 KiB JSON limit', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/not-an-import-route`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ padding: 'x'.repeat(110 * 1024) }),
    })
    assert.equal(response.status, 413)
    assert.deepEqual(await response.json(), {
      code: 'BODY_TOO_LARGE',
      message: 'La solicitud supera el tamaño máximo permitido.',
    })
  })
})
