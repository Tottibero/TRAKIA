import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { subscribeNetworkStatus } from '../src/app/network-status.mjs'

test('network status reports offline and online transitions and removes listeners', () => {
  const listeners = new Map()
  const target = {
    navigator: { onLine: true },
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name) => listeners.delete(name),
  }
  const states = []
  const unsubscribe = subscribeNetworkStatus((online) => states.push(online), target)

  target.navigator.onLine = false
  listeners.get('offline')()
  target.navigator.onLine = true
  listeners.get('online')()
  assert.deepEqual(states, [true, false, true])

  unsubscribe()
  assert.equal(listeners.size, 0)
})

test('app shell shows the approved offline message as a status', async () => {
  const app = await readFile(new URL('../src/App.vue', import.meta.url), 'utf8')
  assert.match(app, /v-if="!isOnline"/)
  assert.match(app, /role="status"/)
  assert.match(app, /Sin conexión/)
  assert.match(app, /Necesitas conexión para guardar los resultados/)
})
