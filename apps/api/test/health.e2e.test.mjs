import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { after, before, test } from 'node:test'
import { getIntegrationProcessEnvironment } from '../../../scripts/integration-database.mjs'

let apiProcess
let apiUrl
let processOutput = ''

async function getAvailablePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Could not determine a free port.')
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  return address.port
}

before(async () => {
  const integrationEnv = getIntegrationProcessEnvironment()
  const port = await getAvailablePort()
  apiUrl = `http://127.0.0.1:${port}/api/health`
  apiProcess = spawn(
    process.execPath,
    [resolve(process.cwd(), process.env.TRAKIA_DB_DIST ?? 'dist', 'main.js')],
    {
      cwd: process.cwd(),
      env: { ...integrationEnv, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  apiProcess.stdout.on('data', (chunk) => {
    processOutput += chunk
  })
  apiProcess.stderr.on('data', (chunk) => {
    processOutput += chunk
  })

  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (apiProcess.exitCode !== null) {
      throw new Error(`API exited before becoming ready.\n${processOutput}`)
    }

    try {
      const response = await fetch(apiUrl)
      if (response.ok) return
    } catch {
      // The server may still be starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error(`API did not become ready.\n${processOutput}`)
})

after(async () => {
  if (!apiProcess || apiProcess.exitCode !== null) return
  apiProcess.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => apiProcess.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ])
  if (apiProcess.exitCode === null) apiProcess.kill('SIGKILL')
})

test('GET /api/health returns HTTP 200 and the shared health response shape', async () => {
  const response = await fetch(apiUrl)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'ok' })
})
