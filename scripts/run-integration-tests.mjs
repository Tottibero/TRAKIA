import { spawn } from 'node:child_process'
import { getIntegrationProcessEnvironment } from './integration-database.mjs'

let env
try {
  env = getIntegrationProcessEnvironment()
} catch (error) {
  console.error(error.message)
  process.exit(1)
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} failed (${signal ?? code}).`))
    })
  })
}

try {
  if (process.env.TRAKIA_SKIP_INTEGRATION_BUILD !== 'true') {
    await run('pnpm', ['--filter', '@trakia/contracts', 'build'])
    await run('pnpm', ['--filter', '@trakia/api', 'build'])
  }
  // Verify the effective TypeORM destination before the first schema-changing command.
  await run('pnpm', ['--filter', '@trakia/api', 'exec', 'node', 'test/verify-integration-database.mjs'])
  await run('pnpm', ['--filter', '@trakia/api', 'db:migration:run'])
  await run('pnpm', ['--filter', '@trakia/api', 'exec', 'node', '--test', 'test/users.integration.test.mjs'])
  await run('pnpm', ['--filter', '@trakia/api', 'exec', 'node', '--test', 'test/health.e2e.test.mjs'])
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
