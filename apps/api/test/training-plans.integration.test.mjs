import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DataSource } from 'typeorm'
import { getDatabaseConfig } from '../dist/config/database-config.js'
import { CreateExerciseCatalog1794528000000 } from '../dist/database/migrations/1794528000000-CreateExerciseCatalog.js'
import { CreateTrainingPlans1794614400000 } from '../dist/database/migrations/1794614400000-CreateTrainingPlans.js'
import {
  TrainingPlanKeyConflictError,
  TrainingPlanService,
  TrainingPlanVersionConflictError,
} from '../dist/modules/training-plans/training-plan.service.js'

const plan = () => ({
  key: 'base-cycle',
  name: 'Base cycle',
  startDate: '2026-11-01',
  endDate: '2026-11-30',
  days: [
    {
      type: 'session',
      key: 'monday-session',
      date: '2026-11-02',
      blocks: [
        {
          type: 'sets',
          key: 'strength-block',
          exercises: [
            {
              key: 'squat-main',
              exerciseKey: 'squat',
              sets: 3,
              targets: { reps: 8 },
              alternatives: [{ key: 'squat-alt', exerciseKey: 'squat-alt' }],
            },
          ],
          restBetweenSetsSeconds: 90,
          restAfterSeconds: 120,
        },
        {
          type: 'circuit',
          key: 'rounds-block',
          mode: 'rounds',
          rounds: 2,
          restBetweenRoundsSeconds: 60,
          exercises: [{ key: 'lunge-main', exerciseKey: 'squat' }],
        },
      ],
    },
    {
      type: 'session',
      key: 'second-session',
      date: '2026-11-02',
      blocks: [
        {
          type: 'intervals',
          key: 'interval-workout',
          cycles: 2,
          phases: [
            {
              type: 'work',
              key: 'work-phase',
              windowSeconds: 30,
              exercise: { key: 'run-main', exerciseKey: 'squat', targets: { duration: 30 } },
            },
            { type: 'rest', key: 'rest-phase', windowSeconds: 10 },
          ],
        },
      ],
    },
    { type: 'rest', key: 'rest-day', date: '2026-11-03' },
  ],
})

test('training plans migration and optimistic aggregate writes work in an isolated PostgreSQL schema', async () => {
  const root = new DataSource(getDatabaseConfig())
  await root.initialize()
  const admin = root.createQueryRunner()
  const schema = `training_plans_test_${process.pid}`
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
    const exercises = new CreateExerciseCatalog1794528000000()
    const plans = new CreateTrainingPlans1794614400000()
    await exercises.up(runner)
    await plans.up(runner)

    const [{ id: exerciseId }] = await runner.query(
      `INSERT INTO exercises (name, category, supported_metrics) VALUES ('Squat', 'strength', ARRAY['reps','duration']) RETURNING id`,
    )
    const exerciseCatalog = {
      async findByKey(key) {
        return key === 'squat' || key === 'squat-alt' ? { id: exerciseId } : null
      },
    }
    const service = new TrainingPlanService(dataSource, exerciseCatalog)
    const saved = await service.create('local-import', plan())
    assert.equal(saved.version, 1)
    assert.match(saved.id, /^[0-9a-f-]{36}$/)
    await assert.rejects(service.create('another-origin', plan()), TrainingPlanKeyConflictError)

    const [{ dateType, sessionCount, restCount }] = await runner.query(`
      SELECT pg_typeof(date)::text AS "dateType",
        count(*) FILTER (WHERE type = 'session')::integer AS "sessionCount",
        count(*) FILTER (WHERE type = 'rest')::integer AS "restCount"
      FROM training_plan_entries GROUP BY date`)
    assert.equal(dateType, 'date')
    assert.equal(sessionCount, 2)
    assert.equal(restCount, 0)

    const [{ version }] = await runner.query('SELECT version FROM training_plans WHERE id = $1', [saved.id])
    const tableIdentities = async (table) => {
      const rows = await runner.query(`SELECT key, id FROM ${table} ORDER BY key, id`)
      return rows.map(({ key, id }) => [key, id])
    }
    const identitiesBefore = {}
    for (const table of [
      'training_plan_entries',
      'training_plan_blocks',
      'training_plan_phases',
      'training_plan_appearances',
    ]) {
      identitiesBefore[table] = await tableIdentities(table)
    }
    const beforeReorder = await runner.query(
      'SELECT key, id, position FROM training_plan_blocks WHERE session_id = (SELECT id FROM training_plan_entries WHERE plan_id = $1 AND key = $2) ORDER BY position',
      [saved.id, 'monday-session'],
    )
    const next = structuredClone(plan())
    next.name = 'Updated cycle'
    next.days[0].blocks.reverse()
    next.days[0].date = '2026-11-04'
    const competing = structuredClone(plan())
    competing.name = 'Competing cycle'
    competing.days[2].date = '2026-11-04'
    const updates = await Promise.allSettled([
      service.update('local-import', 'base-cycle', version, next),
      service.update('local-import', 'base-cycle', version, competing),
    ])
    assert.equal(
      updates.filter(({ status }) => status === 'fulfilled').length,
      1,
      updates.map(({ status, reason }) => `${status}: ${reason?.message ?? ''}`).join('; '),
    )
    const rejected = updates.find(({ status }) => status === 'rejected')
    assert.ok(rejected.reason instanceof TrainingPlanVersionConflictError)
    const [{ version: updatedVersion }] = await runner.query(
      'SELECT version FROM training_plans WHERE id = $1',
      [saved.id],
    )
    assert.equal(updatedVersion, 2)
    const afterReorder = await runner.query(
      'SELECT key, id, position FROM training_plan_blocks WHERE session_id = (SELECT id FROM training_plan_entries WHERE plan_id = $1 AND key = $2) ORDER BY position',
      [saved.id, 'monday-session'],
    )
    const firstUpdateWon = updates[0].status === 'fulfilled'
    assert.deepEqual(
      afterReorder.map(({ key, id }) => [key, id]),
      (firstUpdateWon ? [...beforeReorder].reverse() : beforeReorder).map(({ key, id }) => [key, id]),
    )
    for (const table of Object.keys(identitiesBefore))
      assert.deepEqual(await tableIdentities(table), identitiesBefore[table], `${table} identities changed`)
    const scheduledDates = await runner.query(
      'SELECT type, date::text AS date FROM training_plan_entries WHERE plan_id = $1',
      [saved.id],
    )
    const sessionDates = scheduledDates.filter(({ type }) => type === 'session').map(({ date }) => date)
    const restDates = scheduledDates.filter(({ type }) => type === 'rest').map(({ date }) => date)
    assert.ok(restDates.every((date) => !sessionDates.includes(date)))

    const [{ blockCount, phaseCount, appearanceCount }] = await runner.query(`
      SELECT (SELECT count(*)::integer FROM training_plan_blocks) AS "blockCount",
        (SELECT count(*)::integer FROM training_plan_phases) AS "phaseCount",
        (SELECT count(*)::integer FROM training_plan_appearances) AS "appearanceCount"`)
    assert.equal(blockCount, 3)
    assert.equal(phaseCount, 2)
    assert.equal(appearanceCount, 4)

    await assert.rejects(
      service.update('local-import', 'base-cycle', 1, next),
      TrainingPlanVersionConflictError,
    )
    await assert.rejects(
      runner.query(
        `INSERT INTO training_plan_entries (plan_id,type,key,date) VALUES ($1,'rest','another-rest','2026-11-03')`,
        [saved.id],
      ),
      /violates.*constraint/i,
    )

    await plans.down(runner)
    await exercises.down(runner)
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
