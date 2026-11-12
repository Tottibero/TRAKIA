import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import dataSource from '../dist/database/data-source.js'
import { getIntegrationDatabaseUrl } from '../../../scripts/integration-database.mjs'
import { User } from '../dist/modules/users/user.entity.js'
import { CreateUsers1794441600000 } from '../dist/database/migrations/1794441600000-CreateUsers.js'
import { PasswordService } from '../dist/modules/users/password.service.js'

test('users migration persists normalized emails and rejects case-insensitive duplicates', async () => {
  const expectedDatabase = decodeURIComponent(getIntegrationDatabaseUrl().pathname.slice(1))
  await dataSource.initialize()
  try {
    const [{ database }] = await dataSource.query('SELECT current_database() AS database')
    assert.equal(database, expectedDatabase)
    const email = `hc-01-05a-${randomUUID()}@example.test`
    const password = 'integration password phrase'
    const passwordHash = await new PasswordService().hash(password)
    const queryRunner = dataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()
    try {
      const user = queryRunner.manager.create(User, {
        email: `  ${email.toUpperCase()}  `,
        passwordHash,
      })
      await queryRunner.manager.save(user)
      assert.equal(user.email, email)
      assert.match(user.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
      assert.equal(user.sessionVersion, 0)
      assert.ok(user.createdAt instanceof Date)
      assert.ok(user.updatedAt instanceof Date)

      const persisted = await queryRunner.manager.findOneByOrFail(User, { email })
      assert.equal(persisted.email, email)
      assert.equal(persisted.sessionVersion, 0)
      assert.ok(persisted.createdAt instanceof Date)
      assert.ok(persisted.updatedAt instanceof Date)
      const [{ password_hash: storedHash }] = await queryRunner.query(
        'SELECT "password_hash" FROM "users" WHERE "id" = $1',
        [user.id],
      )
      assert.equal(storedHash, passwordHash)
      assert.notEqual(storedHash, password)
      await queryRunner.query('SAVEPOINT before_duplicate')
      await assert.rejects(
        queryRunner.query('INSERT INTO "users" ("email", "password_hash") VALUES ($1, $2)', [
          email.toUpperCase(),
          'another-hash',
        ]),
        /duplicate key value violates unique constraint/,
      )
      await queryRunner.query('ROLLBACK TO SAVEPOINT before_duplicate')
    } finally {
      await queryRunner.rollbackTransaction()
      await queryRunner.release()
    }
  } finally {
    await dataSource.destroy()
  }
})

test('users migration rolls back cleanly in a temporary isolated schema', async () => {
  const expectedDatabase = decodeURIComponent(getIntegrationDatabaseUrl().pathname.slice(1))
  const schema = `hc_01_05a_${randomUUID().replaceAll('-', '')}`
  await dataSource.initialize()
  const queryRunner = dataSource.createQueryRunner()
  try {
    const [{ database }] = await queryRunner.query('SELECT current_database() AS database')
    assert.equal(database, expectedDatabase)
    await queryRunner.query(`CREATE SCHEMA "${schema}"`)
    await queryRunner.query(`SET search_path TO "${schema}"`)
    const migration = new CreateUsers1794441600000()
    await migration.up(queryRunner)
    const [{ table }] = await queryRunner.query("SELECT to_regclass('users') AS table")
    assert.equal(table, 'users')
    await migration.down(queryRunner)
    const [{ rolledBackTable }] = await queryRunner.query(
      'SELECT to_regclass(\'users\') AS "rolledBackTable"',
    )
    assert.equal(rolledBackTable, null)
  } finally {
    await queryRunner.query('SET search_path TO public')
    await queryRunner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await queryRunner.release()
    await dataSource.destroy()
  }
})
