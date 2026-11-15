import assert from 'node:assert/strict'
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
    await new AddWorkoutExecutionCloseOperation1795219200000().up(runner)
    await new AddWorkoutExecutionCorrectionOperations1795305600000().up(runner)

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

    const expandedRecord = await repository.findOneBy({ id: started.execution.id })
    expandedRecord.snapshot.session.blocks.push(
      {
        type: 'circuit',
        key: 'rounds',
        mode: 'rounds',
        rounds: 1,
        restBetweenRoundsSeconds: 45,
        exercises: [{ key: 'sled', exerciseKey: 'back-squat', alternatives: [] }],
      },
      {
        type: 'intervals',
        key: 'hiit',
        cycles: 1,
        phases: [
          {
            type: 'work',
            key: 'work',
            windowSeconds: 30,
            exercise: { key: 'burpees', exerciseKey: 'back-squat', alternatives: [] },
          },
          { type: 'rest', key: 'recovery', windowSeconds: 15 },
        ],
      },
    )
    await repository.save(expandedRecord)
    const circuitResult = {
      type: 'circuit',
      id: 'b51e6b4f-c824-42e7-8d40-39c7ad75d338',
      blockKey: 'rounds',
      plannedExerciseKey: 'sled',
      round: { kind: 'planned', roundIndex: 1 },
      actualExerciseKey: 'back-squat',
      status: 'performed',
      actualMetrics: { reps: 8 },
    }
    const intervalResult = {
      type: 'intervals',
      id: '6aec8e0a-9b96-4c97-9fc1-42a7badc67ca',
      blockKey: 'hiit',
      cycleIndex: 1,
      phaseKey: 'work',
      status: 'performed',
      actualExerciseKey: 'back-squat',
      activeSeconds: 20,
      windowProgressSeconds: 20,
    }
    const skippedPhase = {
      type: 'intervals',
      id: 'fdb3a678-f956-487d-8a8c-4906d6a6df82',
      blockKey: 'hiit',
      cycleIndex: 1,
      phaseKey: 'recovery',
      status: 'skipped',
    }
    for (const result of [circuitResult, intervalResult, skippedPhase]) {
      assert.equal(
        (await startService.recordResult(userId, started.execution.id, { deviceId, result })).replayed,
        false,
      )
    }
    assert.deepEqual((await startService.findOpen(userId, deviceId)).execution.execution.results.slice(1), [
      circuitResult,
      intervalResult,
      skippedPhase,
    ])

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

    const confirmedResult = {
      type: 'sets',
      id: '118a8a3f-2f58-49e4-9ccd-f6c46ea621d5',
      blockKey: 'main',
      plannedExerciseKey: 'squat',
      unit: { kind: 'planned', setIndex: 1 },
      actualExerciseKey: 'back-squat',
      status: 'performed',
      actualMetrics: { reps: 5, weightKg: 80 },
    }
    const pendingResult = {
      ...confirmedResult,
      id: 'c6fa5f96-8a06-4d42-a607-24e1e19e5cb1',
      unit: { kind: 'planned', setIndex: 2 },
      actualMetrics: { reps: 5, weightKg: 82 },
    }
    await startService.recordResult(userId, winningExecution.id, {
      deviceId: winningStart.deviceId,
      result: confirmedResult,
    })
    const closeExecution = {
      ...winningExecution,
      status: 'completed',
      finishedAt: new Date(Date.parse(winningExecution.startedAt) + 60_000).toISOString(),
      pauses: [],
      completionType: 'early',
      closureReason: 'Tiempo limitado.',
      results: [confirmedResult, pendingResult],
    }
    const closeOperation = {
      operationType: 'close_execution',
      operationId: '65c6ff1d-cbbb-4f8a-b07d-22c22a4a77b4',
      executionId: winningExecution.id,
      deviceId: winningStart.deviceId,
      sequence: 1,
      payload: { execution: closeExecution },
    }
    assert.equal(
      (await startService.closeExecution(userId, winningExecution.id, closeOperation)).result,
      'applied',
    )
    assert.equal(
      (await startService.closeExecution(userId, winningExecution.id, closeOperation)).result,
      'already_applied',
    )
    const closedRecord = await repository.findOneBy({ id: winningExecution.id })
    assert.equal(closedRecord.status, 'completed')
    assert.equal(closedRecord.finishedAt.toISOString(), closeExecution.finishedAt)
    assert.deepEqual(closedRecord.results, [confirmedResult, pendingResult])
    assert.deepEqual(closedRecord.closeOperation, closeOperation)
    const contradictoryClose = {
      ...closeOperation,
      payload: { execution: { ...closeExecution, feeling: 'mal' } },
    }
    assert.equal(
      (await startService.closeExecution(userId, winningExecution.id, contradictoryClose)).result,
      'conflict',
    )
    assert.deepEqual((await repository.findOneBy({ id: winningExecution.id })).results, [
      confirmedResult,
      pendingResult,
    ])

    const correction = {
      id: 'bc883d87-e26f-45d6-b2dd-1c0a946508c0',
      resultId: confirmedResult.id,
      correctedAt: '2026-11-15T12:00:00.000Z',
      changes: [{ field: 'reps', before: 5, after: 6 }],
    }
    const correctionOperation = {
      operationType: 'correct_result',
      operationId: '282e240a-4fd8-4407-8922-8fd19a914431',
      executionId: winningExecution.id,
      deviceId: winningStart.deviceId,
      sequence: 2,
      payload: { correction },
    }
    assert.equal(
      (await startService.correctResult(userId, winningExecution.id, correctionOperation)).result,
      'applied',
    )
    assert.equal(
      (await startService.correctResult(userId, winningExecution.id, correctionOperation)).result,
      'already_applied',
    )
    const correctedRecord = await repository.findOneBy({ id: winningExecution.id })
    assert.equal(correctedRecord.status, 'completed')
    assert.equal(correctedRecord.results[0].actualMetrics.reps, 6)
    assert.deepEqual(correctedRecord.correctionOperations, [correctionOperation])
    assert.deepEqual(correctedRecord.closeOperation, closeOperation)
    assert.equal(correctedRecord.finishedAt.toISOString(), closeExecution.finishedAt)
    assert.deepEqual(
      (await startService.findByRequest(userId, winningStart.deviceId, winningStart.requestId)).execution
        .corrections,
      [correction],
    )

    const staleCorrection = {
      ...correctionOperation,
      operationId: 'b0ca05a1-5c60-47b1-8e06-5cab9743ae72',
      sequence: 3,
      payload: {
        correction: {
          ...correction,
          id: 'eeb519b3-c8ed-48d4-ae3a-57e174313153',
          changes: [{ field: 'reps', before: 5, after: 7 }],
        },
      },
    }
    assert.equal(
      (await startService.correctResult(userId, winningExecution.id, staleCorrection)).result,
      'rejected',
    )
    await runner.query(`
      CREATE FUNCTION reject_workout_correction_update() RETURNS trigger AS $$
      BEGIN
        IF NEW.correction_operations <> OLD.correction_operations THEN
          RAISE EXCEPTION 'forced correction persistence failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `)
    await runner.query(`
      CREATE TRIGGER reject_workout_correction_update
      BEFORE UPDATE ON workout_executions
      FOR EACH ROW EXECUTE FUNCTION reject_workout_correction_update()
    `)
    const rollbackCorrection = {
      ...staleCorrection,
      payload: {
        correction: {
          ...staleCorrection.payload.correction,
          changes: [{ field: 'reps', before: 6, after: 7 }],
        },
      },
    }
    await assert.rejects(
      startService.correctResult(userId, winningExecution.id, rollbackCorrection),
      /forced correction persistence failure/,
    )
    const rolledBackCorrection = await repository.findOneBy({ id: winningExecution.id })
    assert.equal(rolledBackCorrection.results[0].actualMetrics.reps, 6)
    assert.deepEqual(rolledBackCorrection.correctionOperations, [correctionOperation])
    await runner.query('DROP TRIGGER reject_workout_correction_update ON workout_executions')
    await runner.query('DROP FUNCTION reject_workout_correction_update()')

    const unusedSessionKey = winningExecution.sessionKey === 'tuesday' ? 'wednesday' : 'tuesday'
    const afterCloseStart = await startService.start(userId, {
      requestId: crypto.randomUUID(),
      deviceId: winningStart.deviceId,
      planId: savedPlan.id,
      sessionId: sessionIds[unusedSessionKey],
    })
    assert.equal(afterCloseStart.execution.status, 'in_progress')

    const racedResult = {
      ...confirmedResult,
      id: 'a8ea9519-06e5-4d31-b2ac-5a47a0220a0b',
      unit: { kind: 'planned', setIndex: 1 },
    }
    const racedExecution = {
      ...afterCloseStart.execution,
      status: 'completed',
      finishedAt: new Date(Date.parse(afterCloseStart.execution.startedAt) + 60_000).toISOString(),
      pauses: [],
      completionType: 'planned',
      results: [racedResult],
    }
    const racedOperation = {
      operationType: 'close_execution',
      operationId: 'ada7d1f8-d6e6-4f6e-b6c8-e5de0603b8d1',
      executionId: afterCloseStart.execution.id,
      deviceId: afterCloseStart.deviceId,
      sequence: 1,
      payload: { execution: racedExecution },
    }
    await runner.query(`
      CREATE FUNCTION reject_workout_close_update() RETURNS trigger AS $$
      BEGIN
        IF NEW.close_operation IS NOT NULL THEN
          RAISE EXCEPTION 'forced close persistence failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `)
    await runner.query(`
      CREATE TRIGGER reject_workout_close_update
      BEFORE UPDATE ON workout_executions
      FOR EACH ROW EXECUTE FUNCTION reject_workout_close_update()
    `)
    await assert.rejects(
      startService.closeExecution(userId, afterCloseStart.execution.id, racedOperation),
      /forced close persistence failure/,
    )
    const rolledBackClose = await repository.findOneBy({ id: afterCloseStart.execution.id })
    assert.equal(rolledBackClose.status, 'in_progress')
    assert.deepEqual(rolledBackClose.results, [])
    assert.equal(rolledBackClose.closeOperation, null)
    await runner.query('DROP TRIGGER reject_workout_close_update ON workout_executions')
    await runner.query('DROP FUNCTION reject_workout_close_update()')

    const race = await Promise.allSettled([
      startService.recordResult(userId, afterCloseStart.execution.id, {
        deviceId: afterCloseStart.deviceId,
        result: racedResult,
      }),
      startService.closeExecution(userId, afterCloseStart.execution.id, racedOperation),
    ])
    assert.equal(race[1].status, 'fulfilled')
    assert.equal(race[1].value.result, 'applied')
    assert.ok(race[0].status === 'fulfilled' || race[0].reason?.name === 'WorkoutExecutionClosedError')
    const racedRecord = await repository.findOneBy({ id: afterCloseStart.execution.id })
    assert.equal(racedRecord.status, 'completed')
    assert.deepEqual(racedRecord.results, [racedResult])
    assert.deepEqual(racedRecord.closeOperation, racedOperation)
    await assert.rejects(
      startService.recordResult(userId, afterCloseStart.execution.id, {
        deviceId: afterCloseStart.deviceId,
        result: { ...racedResult, id: '1d102a29-c220-4dfa-8a49-e885228d2502' },
      }),
      /open workout execution/,
    )

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
