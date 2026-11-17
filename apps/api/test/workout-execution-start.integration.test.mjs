import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { DataSource } from 'typeorm'
import { getDatabaseConfig } from '../dist/config/database-config.js'
import { CreateExerciseCatalog1794528000000 } from '../dist/database/migrations/1794528000000-CreateExerciseCatalog.js'
import { CreateTrainingPlans1794614400000 } from '../dist/database/migrations/1794614400000-CreateTrainingPlans.js'
import { PrepareTrainingPlanImportReview1794700800000 } from '../dist/database/migrations/1794700800000-PrepareTrainingPlanImportReview.js'
import { AddWorkoutExecutionStart1795046400000 } from '../dist/database/migrations/1795046400000-AddWorkoutExecutionStart.js'
import { AddWorkoutExecutionResults1795132800000 } from '../dist/database/migrations/1795132800000-AddWorkoutExecutionResults.js'
import { AddWorkoutExecutionCloseOperation1795219200000 } from '../dist/database/migrations/1795219200000-AddWorkoutExecutionCloseOperation.js'
import { AddWorkoutExecutionCorrectionOperations1795305600000 } from '../dist/database/migrations/1795305600000-AddWorkoutExecutionCorrectionOperations.js'
import { AllowAccountOwnedWorkoutExecutions1795392000000 } from '../dist/database/migrations/1795392000000-AllowAccountOwnedWorkoutExecutions.js'
import { AddWorkoutExecutionFinalDetails1795478400000 } from '../dist/database/migrations/1795478400000-AddWorkoutExecutionFinalDetails.js'
import { AddWorkoutExecutionActiveTimer1795564800000 } from '../dist/database/migrations/1795564800000-AddWorkoutExecutionActiveTimer.js'
import { AddWorkoutExecutionPauses1795651200000 } from '../dist/database/migrations/1795651200000-AddWorkoutExecutionPauses.js'
import { AddWorkoutExecutionCircuitRounds1795737600000 } from '../dist/database/migrations/1795737600000-AddWorkoutExecutionCircuitRounds.js'
import { CreateUsers1794441600000 } from '../dist/database/migrations/1794441600000-CreateUsers.js'
import { ExerciseCatalogService } from '../dist/modules/exercises/exercise-catalog.service.js'
import { Exercise } from '../dist/modules/exercises/exercise.entity.js'
import { ExerciseCatalogKey } from '../dist/modules/exercises/exercise-catalog-key.entity.js'
import {
  WorkoutExecutionOpenExistsError,
  WorkoutExecutionRequestConflictError,
  WorkoutExecutionResultConflictError,
  WorkoutExecutionResultInvalidError,
  WorkoutExecutionSessionNotFoundError,
  WorkoutExecutionStartService,
} from '../dist/modules/workouts/workout-execution-start.service.js'
import { WorkoutExecutionRecord } from '../dist/modules/workouts/workout-execution.entity.js'
import { WorkoutExecutionProtectionService } from '../dist/modules/workouts/workout-execution-protection.service.js'
import { TrainingPlanService } from '../dist/modules/training-plans/training-plan.service.js'
import { getIntegrationDatabaseUrl } from '../../../scripts/integration-database.mjs'

test('account-owned online workout execution persists and recovers a strength set atomically in PostgreSQL', async () => {
  const integrationUrl = getIntegrationDatabaseUrl()
  const integrationEnvironment = {
    ...process.env,
    DATABASE_URL: integrationUrl.toString(),
    DATABASE_SSL: 'false',
  }
  const root = new DataSource(getDatabaseConfig(integrationEnvironment))
  await root.initialize()
  const admin = root.createQueryRunner()
  const schema = `workout_online_test_${process.pid}`
  let dataSource
  try {
    await admin.connect()
    const [{ database }] = await admin.query('SELECT current_database() AS database')
    const authorizedDatabase = decodeURIComponent(getIntegrationDatabaseUrl().pathname.slice(1))
    assert.equal(authorizedDatabase, 'trakia_test')
    assert.equal(database, 'trakia_test', 'integration tests must never touch trakia_dev')
    await admin.query(`CREATE SCHEMA "${schema}"`)
    dataSource = new DataSource({
      ...getDatabaseConfig(integrationEnvironment),
      schema,
      extra: { options: `-c search_path=${schema}` },
    })
    await dataSource.initialize()
    const runner = dataSource.createQueryRunner()
    await runner.connect()
    await new CreateUsers1794441600000().up(runner)
    await new CreateExerciseCatalog1794528000000().up(runner)
    await new CreateTrainingPlans1794614400000().up(runner)
    await new PrepareTrainingPlanImportReview1794700800000().up(runner)
    await new AddWorkoutExecutionStart1795046400000().up(runner)
    await new AddWorkoutExecutionResults1795132800000().up(runner)
    await new AddWorkoutExecutionCloseOperation1795219200000().up(runner)
    await new AddWorkoutExecutionCorrectionOperations1795305600000().up(runner)
    await new AllowAccountOwnedWorkoutExecutions1795392000000().up(runner)
    await new AddWorkoutExecutionFinalDetails1795478400000().up(runner)
    await new AddWorkoutExecutionActiveTimer1795564800000().up(runner)
    await new AddWorkoutExecutionPauses1795651200000().up(runner)
    await new AddWorkoutExecutionCircuitRounds1795737600000().up(runner)

    const [{ id: userId }] = await runner.query(
      `INSERT INTO users (email, password_hash) VALUES ($1, 'test-hash') RETURNING id`,
      [`online-${randomUUID()}@example.test`],
    )
    const [{ id: otherUserId }] = await runner.query(
      `INSERT INTO users (email, password_hash) VALUES ($1, 'test-hash') RETURNING id`,
      [`online-other-${randomUUID()}@example.test`],
    )
    const [{ id: concurrentUserId }] = await runner.query(
      `INSERT INTO users (email, password_hash) VALUES ($1, 'test-hash') RETURNING id`,
      [`online-race-${randomUUID()}@example.test`],
    )
    const exercises = new ExerciseCatalogService(
      dataSource.getRepository(Exercise),
      dataSource.getRepository(ExerciseCatalogKey),
      dataSource,
    )
    await exercises.createFromDefinition({
      key: 'bench-press',
      name: 'Press banca',
      category: 'strength',
      supportedMetrics: ['reps', 'weight', 'rpe'],
    })
    await exercises.createFromDefinition({
      key: 'plank',
      name: 'Plancha',
      category: 'strength',
      supportedMetrics: ['duration'],
    })
    const plans = new TrainingPlanService(dataSource, exercises)
    const savedPlan = await plans.create(`online-${randomUUID()}`, {
      key: 'bench-plan',
      name: 'Press banca',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      days: ['monday', 'tuesday'].map((key, index) => ({
        type: 'session',
        key,
        date: `2026-11-${String(16 + index).padStart(2, '0')}`,
        blocks: [
          {
            type: 'sets',
            key: 'bench',
            restBetweenSetsSeconds: 60,
            exercises: [{ key: 'bench-press', exerciseKey: 'bench-press', sets: 3 }],
          },
        ],
      })),
    })
    const sessions = await runner.query(
      `SELECT id, key FROM training_plan_entries WHERE plan_id = $1 ORDER BY key`,
      [savedPlan.id],
    )
    const sessionIds = Object.fromEntries(sessions.map(({ id, key }) => [key, id]))
    const protection = new WorkoutExecutionProtectionService(dataSource)
    const repository = dataSource.getRepository(WorkoutExecutionRecord)
    const service = new WorkoutExecutionStartService(repository, dataSource, protection, plans, exercises)
    const startRequest = {
      requestId: randomUUID(),
      planId: savedPlan.id,
      sessionId: sessionIds.monday,
    }

    const started = await service.start(userId, startRequest)
    assert.equal(started.execution.status, 'in_progress')
    assert.equal(started.execution.snapshot.session.key, 'monday')
    assert.deepEqual(await service.start(userId, startRequest), started)
    assert.equal(await repository.countBy({ userId }), 1)
    const storedStart = await repository.findOneByOrFail({ id: started.execution.id })
    assert.equal(storedStart.deviceId, null)
    assert.deepEqual(storedStart.snapshot, started.execution.snapshot)
    await assert.rejects(
      service.start(userId, { ...startRequest, sessionId: sessionIds.tuesday }),
      WorkoutExecutionRequestConflictError,
    )
    await assert.rejects(
      service.start(userId, { ...startRequest, requestId: randomUUID(), sessionId: sessionIds.tuesday }),
      WorkoutExecutionOpenExistsError,
    )
    const concurrentStarts = await Promise.allSettled(
      ['monday', 'tuesday'].map((key) =>
        service.start(concurrentUserId, {
          requestId: randomUUID(),
          planId: savedPlan.id,
          sessionId: sessionIds[key],
        }),
      ),
    )
    assert.equal(concurrentStarts.filter(({ status }) => status === 'fulfilled').length, 1)
    assert.equal(concurrentStarts.filter(({ status }) => status === 'rejected').length, 1)
    assert.equal(await repository.countBy({ userId: concurrentUserId }), 1)

    const result = {
      type: 'sets',
      id: randomUUID(),
      blockKey: 'bench',
      plannedExerciseKey: 'bench-press',
      unit: { kind: 'planned', setIndex: 1 },
      actualExerciseKey: 'bench-press',
      status: 'performed',
      actualMetrics: { weightKg: 40, reps: 10, rpe: 7 },
    }
    assert.deepEqual(await service.recordResult(userId, started.execution.id, { result }), {
      result,
      replayed: false,
    })
    assert.deepEqual(await service.recordResult(userId, started.execution.id, { result }), {
      result,
      replayed: true,
    })
    assert.equal(await repository.countBy({ id: started.execution.id }), 1)
    const [{ persisted }] = await dataSource.query(
      `SELECT results -> 0 AS persisted FROM workout_executions WHERE id = $1`,
      [started.execution.id],
    )
    assert.deepEqual(persisted, result)

    await assert.rejects(
      service.recordResult(userId, started.execution.id, {
        result: { ...result, actualMetrics: { weightKg: 40, reps: 11, rpe: 7 } },
      }),
      WorkoutExecutionResultConflictError,
    )
    await assert.rejects(
      service.recordResult(userId, started.execution.id, {
        result: {
          ...result,
          id: randomUUID(),
          actualExerciseKey: 'plank',
          unit: { kind: 'planned', setIndex: 2 },
        },
      }),
      WorkoutExecutionResultInvalidError,
    )
    const recovered = await service.findOpen(userId)
    assert.equal(recovered.state, 'open')
    assert.deepEqual(recovered.execution.execution.results, [result])
    assert.equal((await service.findOpen(otherUserId)).state, 'none')
    await assert.rejects(
      service.recordResult(otherUserId, started.execution.id, { result: { ...result, id: randomUUID() } }),
      WorkoutExecutionSessionNotFoundError,
    )

    const secondStart = concurrentStarts.find(({ status }) => status === 'fulfilled').value
    await dataSource.query(`CREATE FUNCTION reject_workout_result() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF jsonb_array_length(NEW.results) > jsonb_array_length(OLD.results) THEN
          RAISE EXCEPTION 'forced result write failure';
        END IF;
        RETURN NEW;
      END;
    $$`)
    await dataSource.query(
      `CREATE TRIGGER reject_workout_result BEFORE UPDATE ON workout_executions
       FOR EACH ROW EXECUTE FUNCTION reject_workout_result()`,
    )
    await assert.rejects(
      service.recordResult(concurrentUserId, secondStart.execution.id, {
        result: { ...result, id: randomUUID(), blockKey: 'bench' },
      }),
      /forced result write failure/,
    )
    assert.deepEqual((await service.findOpen(concurrentUserId)).execution.execution.results, [])
    await dataSource.query('DROP TRIGGER reject_workout_result ON workout_executions')
    await dataSource.query('DROP FUNCTION reject_workout_result()')
  } finally {
    if (dataSource?.isInitialized) await dataSource.destroy()
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await admin.release()
    await root.destroy()
  }
})
