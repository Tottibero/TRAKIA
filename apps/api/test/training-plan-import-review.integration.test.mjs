import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DataSource } from 'typeorm'
import { getDatabaseConfig } from '../dist/config/database-config.js'
import { CreateExerciseCatalog1794528000000 } from '../dist/database/migrations/1794528000000-CreateExerciseCatalog.js'
import { CreateTrainingPlans1794614400000 } from '../dist/database/migrations/1794614400000-CreateTrainingPlans.js'
import { PrepareTrainingPlanImportReview1794700800000 } from '../dist/database/migrations/1794700800000-PrepareTrainingPlanImportReview.js'
import { CreateTrainingPlanImportOperations1794787200000 } from '../dist/database/migrations/1794787200000-CreateTrainingPlanImportOperations.js'
import { ExerciseCatalogService } from '../dist/modules/exercises/exercise-catalog.service.js'
import { ExerciseCatalogKey } from '../dist/modules/exercises/exercise-catalog-key.entity.js'
import { Exercise } from '../dist/modules/exercises/exercise.entity.js'
import { TrainingPlanImportReviewService } from '../dist/modules/training-plan-imports/training-plan-import-review.service.js'
import { TrainingPlanImportConfirmationService } from '../dist/modules/training-plan-imports/training-plan-import-confirmation.service.js'
import { ImportReviewReceiptService } from '../dist/modules/training-plan-imports/import-review-receipt.js'
import { TrainingPlanService } from '../dist/modules/training-plans/training-plan.service.js'
import { WorkoutExecutionProtectionService } from '../dist/modules/workouts/workout-execution-protection.service.js'

function documentForToday() {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
  const future = new Date(`${today}T00:00:00Z`)
  future.setUTCDate(future.getUTCDate() + 2)
  const end = new Date(future)
  end.setUTCDate(end.getUTCDate() + 14)
  const day = (date) => date.toISOString().slice(0, 10)
  return {
    format: 'trakia.training-plan',
    version: 1,
    exercises: [{ key: 'squat', name: 'Squat', category: 'strength', supportedMetrics: ['reps'] }],
    plan: {
      key: 'review-plan',
      name: 'Review plan',
      startDate: today,
      endDate: day(end),
      days: [
        {
          type: 'session',
          key: 'review-session',
          date: day(future),
          blocks: [
            {
              type: 'sets',
              key: 'review-block',
              restBetweenSetsSeconds: 60,
              exercises: [{ key: 'squat-main', exerciseKey: 'squat', sets: 3, targets: { reps: 8 } }],
            },
          ],
        },
      ],
    },
  }
}

test('import review reads a consistent snapshot and never writes; started executions protect sessions', async () => {
  const root = new DataSource(getDatabaseConfig())
  await root.initialize()
  const admin = root.createQueryRunner()
  const schema = `training_plan_import_review_test_${process.pid}`
  let dataSource
  const document = documentForToday()
  try {
    await admin.connect()
    await admin.query(`CREATE SCHEMA "${schema}"`)
    dataSource = new DataSource({
      ...getDatabaseConfig(),
      schema,
      extra: { options: `-c search_path=${schema}` },
    })
    await dataSource.initialize()
    const runner = dataSource.createQueryRunner()
    await runner.connect()
    const exerciseMigration = new CreateExerciseCatalog1794528000000()
    const planMigration = new CreateTrainingPlans1794614400000()
    const reviewMigration = new PrepareTrainingPlanImportReview1794700800000()
    const confirmationMigration = new CreateTrainingPlanImportOperations1794787200000()
    await exerciseMigration.up(runner)
    await planMigration.up(runner)
    await reviewMigration.up(runner)
    await confirmationMigration.up(runner)

    const catalog = new ExerciseCatalogService(
      dataSource.getRepository(Exercise),
      dataSource.getRepository(ExerciseCatalogKey),
      dataSource,
    )
    await catalog.createFromDefinition(document.exercises[0])
    const plans = new TrainingPlanService(dataSource, catalog)
    await plans.create('integration-import', document.plan)
    const workouts = new WorkoutExecutionProtectionService(dataSource)
    const receipts = new ImportReviewReceiptService('integration-test-secret-with-at-least-thirty-two-bytes')
    const review = new TrainingPlanImportReviewService(dataSource, catalog, plans, workouts, receipts)
    const confirmation = new TrainingPlanImportConfirmationService(
      dataSource,
      review,
      catalog,
      plans,
      workouts,
      receipts,
    )
    const userId = '7d80cce8-2a68-411b-8918-60c40d903219'

    const tableCounts = async () => {
      const [counts] = await runner.query(`
        SELECT (SELECT count(*)::integer FROM exercises) AS exercises,
          (SELECT count(*)::integer FROM training_plans) AS plans,
          (SELECT count(*)::integer FROM training_plan_entries) AS entries,
          (SELECT count(*)::integer FROM training_plan_blocks) AS blocks,
          (SELECT count(*)::integer FROM training_plan_appearances) AS appearances,
          (SELECT count(*)::integer FROM workout_executions) AS executions,
          (SELECT count(*)::integer FROM training_plan_import_operations) AS operations`)
      return counts
    }

    // Exercise both sides of the stable session-lock protocol without adding
    // the future workouts start use case to HC-03-06.
    const lockOwner = dataSource.createQueryRunner()
    const lockContender = dataSource.createQueryRunner()
    await lockOwner.connect()
    await lockContender.connect()
    await lockOwner.startTransaction()
    await lockContender.startTransaction()
    await workouts.acquireSessionLocks(lockOwner.manager, 'review-plan', ['review-session'])
    const lockKey = 'trakia:workouts:session:review-plan:review-session'
    let [{ acquired }] = await lockContender.query(
      'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired',
      [lockKey],
    )
    assert.equal(acquired, false)
    await lockOwner.commitTransaction()
    ;[{ acquired }] = await lockContender.query(
      'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired',
      [lockKey],
    )
    assert.equal(acquired, true)
    await lockContender.rollbackTransaction()
    await lockOwner.release()
    await lockContender.release()

    const before = await tableCounts()
    const changed = structuredClone(document)
    changed.plan.days[0].blocks[0].exercises[0].targets.reps = 10
    const result = await review.review('integration-import', changed, userId)
    assert.equal(result.valid, true)
    assert.equal(result.confirmable, true)
    assert.deepEqual(await tableCounts(), before)
    assert.ok(result.reviewToken)
    await assert.rejects(
      confirmation.confirm(
        '8d80cce8-2a68-411b-8918-60c40d903219',
        'integration-import',
        changed,
        result.reviewToken,
        '5d80cce8-2a68-411b-8918-60c40d903219',
      ),
      (error) => error.code === 'INVALID_OR_EXPIRED_REVIEW_RECEIPT',
    )

    const operationId = '9d80cce8-2a68-411b-8918-60c40d903219'
    const confirmed = await confirmation.confirm(
      userId,
      'integration-import',
      changed,
      result.reviewToken,
      operationId,
    )
    assert.equal(confirmed.status, 'confirmed')
    assert.equal(confirmed.version, 2)
    const replay = await confirmation.confirm(
      userId,
      'integration-import',
      changed,
      result.reviewToken,
      operationId,
      new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
    )
    assert.deepEqual(replay, confirmed)
    const [{ retentionSeconds }] = await runner.query(
      `SELECT extract(epoch FROM (expires_at - created_at))::integer AS "retentionSeconds"
       FROM training_plan_import_operations WHERE owner_id = $1 AND operation_id = $2`,
      [userId, operationId],
    )
    assert.equal(retentionSeconds, 7 * 24 * 60 * 60)
    const afterConfirmation = await tableCounts()
    assert.equal(afterConfirmation.operations, 1)
    assert.equal(afterConfirmation.plans, before.plans)
    assert.equal(afterConfirmation.appearances, before.appearances)
    const [{ version }] = await runner.query('SELECT version FROM training_plans WHERE key = $1', [
      'review-plan',
    ])
    assert.equal(version, 2)

    const competingLeft = structuredClone(changed)
    const competingRight = structuredClone(changed)
    competingLeft.plan.days[0].blocks[0].exercises[0].targets.reps = 11
    competingRight.plan.days[0].blocks[0].exercises[0].targets.reps = 12
    const [leftReview, rightReview] = await Promise.all([
      review.review('integration-import', competingLeft, userId),
      review.review('integration-import', competingRight, userId),
    ])
    const competingResults = await Promise.allSettled([
      confirmation.confirm(
        userId,
        'integration-import',
        competingLeft,
        leftReview.reviewToken,
        '1d80cce8-2a68-411b-8918-60c40d903219',
      ),
      confirmation.confirm(
        userId,
        'integration-import',
        competingRight,
        rightReview.reviewToken,
        '2d80cce8-2a68-411b-8918-60c40d903219',
      ),
    ])
    assert.equal(competingResults.filter(({ status }) => status === 'fulfilled').length, 1)
    assert.equal(competingResults.filter(({ status }) => status === 'rejected').length, 1)
    const rejectedCompetingResult = competingResults.find(({ status }) => status === 'rejected')
    assert.equal(rejectedCompetingResult.reason.code, 'STALE_IMPORT_REVIEW')

    const rollbackDocument = structuredClone(document)
    rollbackDocument.plan.key = 'review-plan' // Globally owned by integration-import.
    rollbackDocument.exercises[0].key = 'rollback-exercise'
    rollbackDocument.exercises[0].name = 'Rollback exercise'
    rollbackDocument.plan.days[0].blocks[0].exercises[0].exerciseKey = 'rollback-exercise'
    const rollbackReview = await review.review('different-origin', rollbackDocument, userId)
    const beforeRollbackAttempt = await tableCounts()
    await assert.rejects(
      confirmation.confirm(
        userId,
        'different-origin',
        rollbackDocument,
        rollbackReview.reviewToken,
        '3d80cce8-2a68-411b-8918-60c40d903219',
      ),
      (error) => error.code === 'CONCURRENT_CATALOG_OR_PLAN_CHANGE',
    )
    assert.deepEqual(await tableCounts(), beforeRollbackAttempt)
    assert.equal(await catalog.findByKey('rollback-exercise'), null)

    const expiredOperationId = '6d80cce8-2a68-411b-8918-60c40d903219'
    await runner.query(
      `INSERT INTO training_plan_import_operations
       (owner_id, operation_id, content_hash, result, created_at, expires_at)
       VALUES ($1, $2, $3, '{}'::jsonb, now() - interval '8 days', now() - interval '1 day')`,
      [userId, expiredOperationId, 'c'.repeat(64)],
    )
    const currentPlan = await plans.findForImport('integration-import', 'review-plan')
    const cleanupDocument = structuredClone(document)
    cleanupDocument.plan = currentPlan.definition
    const cleanupReview = await review.review('integration-import', cleanupDocument, userId)
    await confirmation.confirm(
      userId,
      'integration-import',
      cleanupDocument,
      cleanupReview.reviewToken,
      '7d80cce8-2a68-411b-8918-60c40d903219',
    )
    const expiredRows = await runner.query(
      'SELECT id FROM training_plan_import_operations WHERE owner_id = $1 AND operation_id = $2',
      [userId, expiredOperationId],
    )
    assert.equal(expiredRows.length, 0)

    const mismatched = structuredClone(changed)
    mismatched.plan.days[0].blocks[0].exercises[0].targets.reps = 12
    await assert.rejects(
      confirmation.confirm(userId, 'integration-import', mismatched, result.reviewToken, operationId),
      (error) => error.code === 'OPERATION_ID_CONTENT_MISMATCH',
    )

    const staleReview = await review.review('integration-import', mismatched, userId)
    await assert.rejects(
      confirmation.confirm(
        userId,
        'integration-import',
        mismatched,
        staleReview.reviewToken,
        'ad80cce8-2a68-411b-8918-60c40d903219',
        new Date(Date.now() + 16 * 60 * 1000),
      ),
      (error) => error.code === 'INVALID_OR_EXPIRED_REVIEW_RECEIPT',
    )
    const protectedDocument = structuredClone(changed)
    protectedDocument.plan.days[0].blocks[0].exercises[0].targets.reps = 13
    const protectedReview = await review.review('integration-import', protectedDocument, userId)

    await runner.query(
      `INSERT INTO workout_executions (plan_key, session_key, status, started_at)
       VALUES ('review-plan', 'review-session', 'in_progress', now())`,
    )
    const afterExecution = await tableCounts()
    const blocked = await review.review('integration-import', protectedDocument, userId)
    assert.equal(blocked.confirmable, false)
    assert.ok(blocked.conflicts.some(({ code }) => code === 'SESSION_EXECUTION_PROTECTED'))
    assert.deepEqual(await tableCounts(), afterExecution)
    await assert.rejects(
      confirmation.confirm(
        userId,
        'integration-import',
        protectedDocument,
        protectedReview.reviewToken,
        '4d80cce8-2a68-411b-8918-60c40d903219',
      ),
      (error) => error.code === 'SESSION_EXECUTION_PROTECTED',
    )
    assert.deepEqual(await tableCounts(), afterExecution)

    await runner.query(`UPDATE workout_executions SET status = 'completed'`)
    const afterClose = await tableCounts()
    const closed = await review.review('integration-import', protectedDocument, userId)
    assert.equal(closed.confirmable, false)
    assert.ok(closed.conflicts.some(({ code }) => code === 'SESSION_EXECUTION_PROTECTED'))
    assert.deepEqual(await tableCounts(), afterClose)

    await reviewMigration.down(runner)
    await confirmationMigration.down(runner)
    await planMigration.down(runner)
    await exerciseMigration.down(runner)
    await runner.release()
  } finally {
    if (dataSource?.isInitialized) await dataSource.destroy()
    try {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    } finally {
      await admin.release()
      await root.destroy()
    }
  }
})
