import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { randomUUID } from 'node:crypto'

const suffix = randomUUID().slice(0, 8)
const network = `trakia-proxy-${suffix}`
const webContainer = `trakia-proxy-web-${suffix}`
const firstApiContainer = `trakia-proxy-api-a-${suffix}`
const secondApiContainer = `trakia-proxy-api-b-${suffix}`
const webImage = process.env.TRAKIA_WEB_IMAGE ?? 'trakia-web:hc06-proxy'
const nodeImage = process.env.TRAKIA_PROXY_BACKEND_IMAGE ?? 'node:26.13.0-bookworm-slim'
const apiScript = [
  'const http = require("node:http")',
  'http.createServer((request, response) => {',
  '  response.writeHead(200, { "content-type": "application/json" })',
  '  response.end(JSON.stringify({',
  '    deployment: process.env.SMOKE_DEPLOYMENT,',
  '    path: request.url,',
  '    cookie: request.headers.cookie,',
  '    csrf: request.headers["x-trakia-csrf"],',
  '    origin: request.headers.origin,',
  '    realIp: request.headers["x-real-ip"],',
  '    forwardedFor: request.headers["x-forwarded-for"],',
  '    forwardedProto: request.headers["x-forwarded-proto"],',
  '  }))',
  '}).listen(3033, "0.0.0.0")',
].join('\n')

let networkCreated = false
const containers = []

function docker(...args) {
  const result = spawnSync('docker', args, { encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const details = (result.stderr || result.stdout || '').trim()
    throw new Error(`docker ${args[0]} failed${details ? `: ${details}` : ''}`)
  }
  return result.stdout.trim()
}

async function unusedPort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  return port
}

function startApi(name, deployment) {
  docker(
    'run',
    '--detach',
    '--name',
    name,
    '--network',
    network,
    '--network-alias',
    'api.railway.internal',
    '--env',
    `SMOKE_DEPLOYMENT=${deployment}`,
    nodeImage,
    'node',
    '-e',
    apiScript,
  )
  containers.push(name)
}

async function responseFrom(deployment, port, path) {
  const headers = {
    cookie: `__Host-trakia_session=smoke-${deployment}`,
    origin: 'https://trakia.up.railway.app',
    'x-trakia-csrf': '1',
    'x-real-ip': '203.0.113.7',
    'x-forwarded-proto': 'https',
  }
  const deadline = Date.now() + 30_000
  let lastError = 'No response'

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        headers,
        signal: AbortSignal.timeout(2_000),
      })
      if (response.ok) {
        const body = await response.json()
        if (body.deployment === deployment) return body
        lastError = `Expected ${deployment}, got ${body.deployment}`
      } else {
        lastError = `HTTP ${response.status}`
      }
    } catch (error) {
      lastError = error.message
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error(`Proxy did not reach ${deployment} within 30 seconds: ${lastError}`)
}

async function waitForWebHealth(port) {
  const deadline = Date.now() + 30_000
  let lastError = 'No response'

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`, {
        signal: AbortSignal.timeout(2_000),
      })
      if (response.status === 200 && (await response.text()) === 'ok\n') return
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error.message
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error(`Nginx healthcheck did not pass within 30 seconds: ${lastError}`)
}

try {
  docker('image', 'inspect', webImage)
  docker('image', 'inspect', nodeImage)
  docker('network', 'create', '--driver', 'bridge', network)
  networkCreated = true

  const port = await unusedPort()
  startApi(firstApiContainer, 'deployment-a')
  docker(
    'run',
    '--detach',
    '--name',
    webContainer,
    '--network',
    network,
    '--publish',
    `127.0.0.1:${port}:8080`,
    '--env',
    'PORT=8080',
    '--env',
    'API_UPSTREAM=http://api.railway.internal:3033',
    webImage,
  )
  containers.push(webContainer)

  await waitForWebHealth(port)

  const firstResponse = await responseFrom(
    'deployment-a',
    port,
    '/api/proxy-smoke?deployment=first&sequence=1',
  )
  assert.equal(firstResponse.path, '/api/proxy-smoke?deployment=first&sequence=1')
  assert.equal(firstResponse.cookie, '__Host-trakia_session=smoke-deployment-a')
  assert.equal(firstResponse.csrf, '1')
  assert.equal(firstResponse.origin, 'https://trakia.up.railway.app')
  assert.equal(firstResponse.realIp, '203.0.113.7')
  assert.equal(firstResponse.forwardedFor, '203.0.113.7')
  assert.equal(firstResponse.forwardedProto, 'https')

  docker('rm', '--force', firstApiContainer)
  containers.splice(containers.indexOf(firstApiContainer), 1)
  startApi(secondApiContainer, 'deployment-b')

  const secondResponse = await responseFrom(
    'deployment-b',
    port,
    '/api/proxy-smoke?deployment=second&sequence=2',
  )
  assert.equal(secondResponse.path, '/api/proxy-smoke?deployment=second&sequence=2')
  assert.equal(secondResponse.csrf, '1')
  assert.equal(secondResponse.forwardedFor, '203.0.113.7')
  assert.equal(secondResponse.forwardedProto, 'https')

  console.log('Dynamic proxy smoke passed: the running Nginx switched from deployment-a to deployment-b.')
} finally {
  for (const container of containers.reverse()) {
    spawnSync('docker', ['rm', '--force', container], { encoding: 'utf8' })
  }
  if (networkCreated) spawnSync('docker', ['network', 'rm', network], { encoding: 'utf8' })
}
