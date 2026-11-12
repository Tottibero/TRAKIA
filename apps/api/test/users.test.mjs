import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeEmail } from '../dist/modules/users/user.entity.js'
import { PasswordService, validatePassword } from '../dist/modules/users/password.service.js'
import { UsersService } from '../dist/modules/users/users.service.js'

test('normalizes email by trimming whitespace and lowercasing', () => {
  assert.equal(normalizeEmail('  Person@Example.COM '), 'person@example.com')
})

test('password policy uses a 12 character minimum without composition rules', () => {
  assert.throws(() => validatePassword('short'), /at least 12 characters/)
  assert.doesNotThrow(() => validatePassword('correct horse'))
})

test('hashes and verifies passwords with Argon2id', async () => {
  const passwords = new PasswordService()
  const hash = await passwords.hash('correct horse battery staple')
  assert.notEqual(hash, 'correct horse battery staple')
  assert.match(hash, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
  assert.equal(await passwords.verify(hash, 'correct horse battery staple'), true)
  assert.equal(await passwords.verify(hash, 'another password'), false)
})

test('bootstraps the first user under a PostgreSQL transaction lock', async () => {
  const calls = []
  let active = false
  const saved = []
  const repository = {
    count: async () => {
      calls.push('count')
      return 0
    },
    create: (user) => user,
    save: async (user) => {
      calls.push('save')
      saved.push(user)
      return user
    },
  }
  const runner = {
    get isTransactionActive() {
      return active
    },
    connect: async () => calls.push('connect'),
    startTransaction: async () => {
      active = true
      calls.push('begin')
    },
    query: async (sql, parameters) => calls.push(['lock', sql, parameters]),
    manager: { getRepository: () => repository },
    commitTransaction: async () => {
      active = false
      calls.push('commit')
    },
    rollbackTransaction: async () => {
      active = false
      calls.push('rollback')
    },
    release: async () => calls.push('release'),
  }
  const service = new UsersService({}, { createQueryRunner: () => runner })

  assert.equal(await service.bootstrapFirstUser(' Person@Example.COM ', 'argon-hash'), true)
  assert.deepEqual(saved, [{ email: 'person@example.com', passwordHash: 'argon-hash' }])
  assert.deepEqual(
    calls.map((call) => (Array.isArray(call) ? call[0] : call)),
    ['connect', 'begin', 'lock', 'count', 'save', 'commit', 'release'],
  )
  assert.deepEqual(calls[2][2], [71421, 1])
})

test('rejects an existing bootstrap user and rolls back before releasing the lock', async () => {
  const calls = []
  let active = false
  const runner = {
    get isTransactionActive() {
      return active
    },
    connect: async () => calls.push('connect'),
    startTransaction: async () => {
      active = true
      calls.push('begin')
    },
    query: async () => calls.push('lock'),
    manager: { getRepository: () => ({ count: async () => 1, save: async () => calls.push('save') }) },
    commitTransaction: async () => calls.push('commit'),
    rollbackTransaction: async () => {
      active = false
      calls.push('rollback')
    },
    release: async () => calls.push('release'),
  }
  const service = new UsersService({}, { createQueryRunner: () => runner })

  assert.equal(await service.bootstrapFirstUser('another@example.test', 'argon-hash'), false)
  assert.deepEqual(calls, ['connect', 'begin', 'lock', 'rollback', 'release'])
})

test('resets password through the users repository and increments session version atomically', async () => {
  const update = {}
  const builder = {
    update: (entity) => {
      update.entity = entity
      return builder
    },
    set: (values) => {
      update.values = values
      return builder
    },
    where: (expression, parameters) => {
      update.where = { expression, parameters }
      return builder
    },
    execute: async () => ({ affected: 1 }),
  }
  const service = new UsersService({ createQueryBuilder: () => builder }, {})

  assert.equal(await service.resetPassword(' Person@Example.COM ', 'new-hash'), true)
  assert.equal(update.values.passwordHash, 'new-hash')
  assert.equal(update.values.sessionVersion(), 'session_version + 1')
  assert.deepEqual(update.where, {
    expression: 'email = :email',
    parameters: { email: 'person@example.com' },
  })
})
