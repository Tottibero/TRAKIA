import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeEmail } from '../dist/modules/users/user.entity.js'
import { PasswordService, validatePassword } from '../dist/modules/users/password.service.js'

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
