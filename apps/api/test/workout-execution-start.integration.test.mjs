import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DataSource } from 'typeorm'
import { getDatabaseConfig } from '../dist/config/database-config.js'
import { CreateExerciseCatalog1794528000000 } from '../dist/database/migrations/1794528000000-CreateExerciseCatalog.js'
import { CreateTrainingPlans1794614400000 } from '../dist/database/migrations/1794614400000-CreateTrainingPlans.js'
import { PrepareTrainingPlanImportReview1794700800000 } from '../dist/database/migrations/1794700800000-PrepareTrainingPlanImportReview.js'
import { AddWorkoutExecutionStart1795046400000 } from '../dist/database/migrations/1795046400000-AddWorkoutExecutionStart.js'
import { AddWorkoutExecutionResults1795132800000 } from '../dist/database/migrations/1795132800000-AddWorkoutExecutionResults.js'
import { CreateUsers1794441600000 } from '../dist/database/migrations/1794441600000-CreateUsers.js'
import { ExerciseCatalogService } from '../dist/modules/exercises/exercise-catalog.service.js'
import { Exercise } from '../dist/modules/exercises/exercise.entity.js'
import { ExerciseCatalogKey } from '../dist/modules/exercises/exercise-catalog-key.entity.js'
import { TrainingPlanService } from '../dist/modules/training-plans/training-plan.service.js'
import { WorkoutExecutionRecord } from '../dist/modules/workouts/workout-execution.entity.js'
import { WorkoutExecutionProtectionService } from '../dist/modules/workouts/workout-execution-protection.service.js'
import {
  WorkoutExecutionOpenExistsError,
  WorkoutExecutionDeviceMismatchError,
  WorkoutExecutionRequestConflictError,
  WorkoutExecutionSessionProtectedError,
  WorkoutExecutionStartService,
} from '../dist/modules/workouts/workout-execution-start.service.js'

test('workout starts are atomic, idempotent, protected and recoverable in an isolated PostgreSQL schema', async () => {
  const root = new DataSource(getDatabaseConfig())
  await root.initialize()
  const admin = root.createQueryRunner()
  const schema = `workout_execution_start_test_${process.pid}`
  let dataSource
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
    await new CreateUsers1794441600000().up(runner)
    await new CreateExerciseCatalog1794528000000().up(runner)
    await new CreateTrainingPlans1794614400000().up(runner)
    await new PrepareTrainingPlanImportReview1794700800000().up(runner)
    await new AddWorkoutExecutionStart1795046400000().up(runner)
    await new AddWorkoutExecutionResults1795132800000().up(runner)

    const [{ id: userId }] = await runner.query(
      `INSERT INTO users (email, password_hash) VALUES ('workout-start@example.test', 'test-hash') RETURNING id`,
    )
    const exercises = new ExerciseCatalogService(
      dataSource.getRepository(Exercise),
      dataSource.getRepository(ExerciseCatalogKey),
      dataSource,
    )
    await exercises.createFromDefinition({
      key: 'back-squat',
      name: 'Back squat',
      category: 'strength',
      supportedMetrics: ['reps', 'weight'],
    })

    const plans = new TrainingPlanService(dataSource, exercises)
    const savedPlan = await plans.create('integration-workout', {
      key: 'strength-plan',
      name: 'Strength plan',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      days: ['monday', 'tuesday', 'wednesday'].map((key, index) => ({
        type: 'session',
        key,
        date: `2026-11-${String(16 + index).padStart(2, '0')}`,
        blocks: [
          {
            type: 'sets',
            key: 'main',
            exercises: [{ key: 'squat', exerciseKey: 'back-squat', sets: 3 }],
            restBetweenSetsSeconds: 90,
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
    const startService = new WorkoutExecutionStartService(
      repository,
      dataSource,
      protection,
      plans,
      exercises,
    )
    const deviceId = 'e6374ec9-342a-4fce-88f1-a1e175bc95b5'
    const otherDeviceId = '223b6405-2f90-4c5c-aee0-60517c9ef94a'
    const firstRequest = {
      requestId: 'be61ac38-b0ea-42d7-bf7c-c0d35c7ee882',
      deviceId,
      planId: savedPlan.id,
      sessionId: sessionIds.monday,
    }

    // Mirror import confirmation's lock-and-update section: import owns the shared
    // session lock, while start waits, then reads and snapshots the committed plan.
    const importRunner = dataSource.createQueryRunner()
    await importRunner.connect()
    await importRunner.startTransaction()
    await protection.acquireSessionLocks(importRunner.manager, 'strength-plan', ['monday'])
    const importSnapshot = await plans.findForImport(
      'integration-workout',
      'strength-plan',
      importRunner.manager,
    )
    const monday = importSnapshot.definition.days.find(
      (day) => day.type === 'session' && day.key === 'monday',
    )
    monday.blocks[0].exercises[0].sets = 4
    const waitingStart = startService.start(userId, firstRequest)
    let startFinished = false
    void waitingStart.then(
      () => {
        startFinished = true
      },
      () => {
        startFinished = true
      },
    )
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(startFinished, false, 'start must wait for the import transaction session lock')
    await plans.updateForImport(
      'integration-workout',
      'strength-plan',
      importSnapshot.version,
      importSnapshot.definition,
      importRunner.manager,
    )
    await importRunner.commitTransaction()
    await importRunner.release()
    const started = await waitingStart
    assert.equal(started.execution.status, 'in_progress')
    assert.equal(started.execution.snapshot.session.blocks[0].exercises[0].sets, 4)
    assert.deepEqual(started.execution.snapshot.session, {
      type: 'session',
      key: 'monday',
      date: '2026-11-16',
      blocks: [
        {
          type: 'sets',
          key: 'main',
          exercises: [{ key: 'squat', exerciseKey: 'back-squat', sets: 4, alternatives: [] }],
          restBetweenSetsSeconds: 90,
        },
      ],
    })
    assert.deepEqual(await startService.start(userId, firstRequest), started)
    await assert.rejects(
      startService.start(userId, { ...firstRequest, sessionId: sessionIds.tuesday }),
      WorkoutExecutionRequestConflictError,
    )
    assert.equal(
      (await startService.findByRequest(userId, deviceId, firstRequest.requestId)).execution.id,
      started.execution.id,
    )
    await assert.rejects(
      startService.findByRequest(userId, otherDeviceId, firstRequest.requestId),
      WorkoutExecutionDeviceMismatchError,
    )
    assert.equal((await startService.findOpen(userId, deviceId)).execution.execution.id, started.execution.id)
    assert.deepEqual(await startService.findOpen(userId, otherDeviceId), {
      state: 'other_device',
      execution: null,
    })

    const resultInput = {
      deviceId,
      result: {
        type: 'sets',
        id: '118a8a3f-5c2e-49e4-9ccd-f6c46ea621d5',
        blockKey: 'main',
        plannedExerciseKey: 'squat',
        unit: { kind: 'planned', setIndex: 1 },
        actualExerciseKey: 'back-squat',
        status: 'performed',
        actualMetrics: { reps: 5, weightKg: 80 },
      },
    }
    assert.deepEqual(await startService.recordResult(userId, started.execution.id, resultInput), {
      result: resultInput.result,
      replayed: false,
    })
    assert.deepEqual(await startService.recordResult(userId, started.execution.id, resultInput), {
      result: resultInput.result,
      replayed: true,
    })
    assert.deepEqual((await startService.findOpen(userId, deviceId)).execution.execution.results, [
      resultInput.result,
    ])
    await assert.rejects(
      startService.recordResult(userId, started.execution.id, {
        ...resultInput,
        result: { ...resultInput.result, actualMetrics: { reps: 5, weightKg: 82 } },
      }),
      /different content/,
    )
    await assert.rejects(
      startService.recordResult(userId, started.execution.id, {
        deviceId: otherDeviceId,
        result: resultInput.result,
      }),
      /another device/,
    )
    await assert.rejects(
      startService.recordResult(userId, started.execution.id, {
        ...resultInput,
        result: {
          ...resultInput.result,
          id: crypto.randomUUID(),
          unit: { kind: 'planned', setIndex: 2 },
          actualMetrics: { calories: 80 },
        },
      }),
      /not valid/,
    )

    const competingStarts = await Promise.allSettled(
      ['tuesday', 'wednesday'].map((key) =>
        startService.start(userId, {
          requestId: crypto.randomUUID(),
          deviceId,
          planId: savedPlan.id,
          sessionId: sessionIds[key],
        }),
      ),
    )
    assert.equal(competingStarts.filter(({ status }) => status === 'fulfilled').length, 0)
    assert.ok(competingStarts.every(({ reason }) => reason instanceof WorkoutExecutionOpenExistsError))

    await runner.query('UPDATE workout_executions SET status = $1 WHERE id = $2', [
      'completed',
      started.execution.id,
    ])
    await assert.rejects(
      startService.start(userId, {
        ...firstRequest,
        requestId: 'd955ac79-4d96-45e3-90fc-e936c74b0e9a',
      }),
      WorkoutExecutionSessionProtectedError,
    )

    const beforeRollback = await repository.count()
    const brokenCatalog = {
      findByKey: async () => {
        throw new Error('catalog failure')
      },
    }
    const brokenStart = new WorkoutExecutionStartService(
      repository,
      dataSource,
      protection,
      plans,
      brokenCatalog,
    )
    await assert.rejects(
      brokenStart.start(userId, {
        requestId: '31f1d058-42b8-426e-82d6-47db48234f84',
        deviceId,
        planId: savedPlan.id,
        sessionId: sessionIds.tuesday,
      }),
      /catalog failure/,
    )
    assert.equal(await repository.count(), beforeRollback)

    const competingDevices = await Promise.allSettled(
      [
        { key: 'tuesday', deviceId },
        { key: 'wednesday', deviceId: otherDeviceId },
      ].map(({ key, deviceId: ownerDeviceId }) =>
        startService.start(userId, {
          requestId: crypto.randomUUID(),
          deviceId: ownerDeviceId,
          planId: savedPlan.id,
          sessionId: sessionIds[key],
        }),
      ),
    )
    assert.equal(competingDevices.filter(({ status }) => status === 'fulfilled').length, 1)
    const rejectedDeviceStart = competingDevices.find(({ status }) => status === 'rejected')
    assert.ok(rejectedDeviceStart.reason instanceof WorkoutExecutionDeviceMismatchError)
    assert.equal(await repository.count(), beforeRollback + 1)

    const winningStart = competingDevices.find(({ status }) => status === 'fulfilled').value
    const winningExecution = winningStart.execution
    const countBeforeConstraintCheck = await repository.count()
    await assert.rejects(
      repository.save(
        repository.create({
          id: crypto.randomUUID(),
          userId,
          deviceId: winningStart.deviceId === deviceId ? otherDeviceId : deviceId,
          requestId: crypto.randomUUID(),
          planId: savedPlan.id,
          sessionId: sessionIds.wednesday,
          planKey: 'strength-plan',
          sessionKey: 'wednesday',
          snapshot: winningExecution.snapshot,
          status: 'in_progress',
          startedAt: new Date(),
          finishedAt: null,
        }),
      ),
      (error) =>
        error.driverError?.code === '23505' &&
        error.driverError?.constraint === 'uq_workout_executions_open_user',
    )
    assert.equal(await repository.count(), countBeforeConstraintCheck)

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
