import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DataSource } from 'typeorm'
import { getDatabaseConfig } from '../dist/config/database-config.js'
import { CreateExerciseCatalog1794528000000 } from '../dist/database/migrations/1794528000000-CreateExerciseCatalog.js'

test('exercise catalog migration enforces keys and references and can be reverted in an isolated schema', async () => {
  const dataSource = new DataSource(getDatabaseConfig())
  await dataSource.initialize()
  const runner = dataSource.createQueryRunner()
  const schema = `exercise_catalog_test_${process.pid}`

  try {
    await runner.connect()
    await runner.query(`CREATE SCHEMA "${schema}"`)
    await runner.query(`SET search_path TO "${schema}"`)

    const migration = new CreateExerciseCatalog1794528000000()
    await migration.up(runner)

    const [{ id }] = await runner.query(
      `INSERT INTO "exercises" ("name", "category", "supported_metrics") VALUES ($1, $2, $3) RETURNING "id"`,
      ['Bench press', 'strength', ['reps', 'weight']],
    )
    await runner.query('INSERT INTO "exercise_catalog_keys" ("key", "exercise_id") VALUES ($1, $2)', [
      'bench-press',
      id,
    ])
    await runner.query('INSERT INTO "exercise_catalog_keys" ("key", "exercise_id") VALUES ($1, $2)', [
      'barbell-bench',
      id,
    ])
    const [{ id: sameNameId }] = await runner.query(
      `INSERT INTO "exercises" ("name", "category", "supported_metrics") VALUES ($1, $2, $3) RETURNING "id"`,
      ['Bench press', 'strength', ['reps', 'weight']],
    )
    await runner.query('INSERT INTO "exercise_catalog_keys" ("key", "exercise_id") VALUES ($1, $2)', [
      'incline-bench',
      sameNameId,
    ])
    assert.notEqual(sameNameId, id)

    await assert.rejects(
      runner.query('INSERT INTO "exercise_catalog_keys" ("key", "exercise_id") VALUES ($1, $2)', [
        'bench-press',
        id,
      ]),
    )
    await assert.rejects(
      runner.query('INSERT INTO "exercise_catalog_keys" ("key", "exercise_id") VALUES ($1, $2)', [
        'invalid-key',
        '00000000-0000-4000-8000-000000000000',
      ]),
    )
    await assert.rejects(
      runner.query('INSERT INTO "exercise_catalog_keys" ("key", "exercise_id") VALUES ($1, $2)', [
        'Bad Key',
        id,
      ]),
    )
    await assert.rejects(
      runner.query('INSERT INTO "exercises" ("name", "category", "supported_metrics") VALUES ($1, $2, $3)', [
        'Invalid metric',
        'strength',
        ['unknown'],
      ]),
    )
    await assert.rejects(
      runner.query('INSERT INTO "exercises" ("name", "category", "supported_metrics") VALUES ($1, $2, $3)', [
        '   ',
        'strength',
        ['reps'],
      ]),
    )

    const [keyCount] = await runner.query('SELECT count(*)::integer AS count FROM "exercise_catalog_keys"')
    assert.equal(keyCount.count, 3)

    await migration.down(runner)
    const remaining = await runner.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name IN ('exercises', 'exercise_catalog_keys')`,
      [schema],
    )
    assert.deepEqual(remaining, [])
  } finally {
    try {
      await runner.query('SET search_path TO public')
      await runner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    } finally {
      await runner.release()
      await dataSource.destroy()
    }
  }
})
