import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DataSource } from 'typeorm'
import { getDatabaseConfig } from '../dist/config/database-config.js'
import { CreateExerciseCatalog1794528000000 } from '../dist/database/migrations/1794528000000-CreateExerciseCatalog.js'
import { CreateTrainingPlans1794614400000 } from '../dist/database/migrations/1794614400000-CreateTrainingPlans.js'
import { PrepareTrainingPlanImportReview1794700800000 } from '../dist/database/migrations/1794700800000-PrepareTrainingPlanImportReview.js'
import { ExerciseCatalogService } from '../dist/modules/exercises/exercise-catalog.service.js'
import { ExerciseCatalogKey } from '../dist/modules/exercises/exercise-catalog-key.entity.js'
import { Exercise } from '../dist/modules/exercises/exercise.entity.js'
import { TrainingPlanImportReviewService } from '../dist/modules/training-plan-imports/training-plan-import-review.service.js'
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
    await exerciseMigration.up(runner)
    await planMigration.up(runner)
    await reviewMigration.up(runner)

    const catalog = new ExerciseCatalogService(
      dataSource.getRepository(Exercise),
      dataSource.getRepository(ExerciseCatalogKey),
      dataSource,
    )
    await catalog.createFromDefinition(document.exercises[0])
    const plans = new TrainingPlanService(dataSource, catalog)
    await plans.create('integration-import', document.plan)
    const workouts = new WorkoutExecutionProtectionService(dataSource)
    const review = new TrainingPlanImportReviewService(dataSource, catalog, plans, workouts)

    const tableCounts = async () => {
      const [counts] = await runner.query(`
        SELECT (SELECT count(*)::integer FROM exercises) AS exercises,
          (SELECT count(*)::integer FROM training_plans) AS plans,
          (SELECT count(*)::integer FROM training_plan_entries) AS entries,
          (SELECT count(*)::integer FROM training_plan_blocks) AS blocks,
          (SELECT count(*)::integer FROM training_plan_appearances) AS appearances,
          (SELECT count(*)::integer FROM workout_executions) AS executions`)
      return counts
    }
    const before = await tableCounts()
    const changed = structuredClone(document)
    changed.plan.days[0].blocks[0].exercises[0].targets.reps = 10
    const result = await review.review('integration-import', changed)
    assert.equal(result.valid, true)
    assert.equal(result.confirmable, true)
    assert.deepEqual(await tableCounts(), before)

    await runner.query(
      `INSERT INTO workout_executions (plan_key, session_key, status, started_at)
       VALUES ('review-plan', 'review-session', 'in_progress', now())`,
    )
    const afterExecution = await tableCounts()
    const blocked = await review.review('integration-import', changed)
    assert.equal(blocked.confirmable, false)
    assert.ok(blocked.conflicts.some(({ code }) => code === 'SESSION_EXECUTION_PROTECTED'))
    assert.deepEqual(await tableCounts(), afterExecution)

    await runner.query(`UPDATE workout_executions SET status = 'completed'`)
    const afterClose = await tableCounts()
    const closed = await review.review('integration-import', changed)
    assert.equal(closed.confirmable, false)
    assert.ok(closed.conflicts.some(({ code }) => code === 'SESSION_EXECUTION_PROTECTED'))
    assert.deepEqual(await tableCounts(), afterClose)

    await reviewMigration.down(runner)
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
