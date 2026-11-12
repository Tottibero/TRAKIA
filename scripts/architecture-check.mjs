import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { verifyArchitectureRuleFixtures } from './architecture-rule-tests.mjs'

await verifyArchitectureRuleFixtures()

const args = [
  resolve('node_modules/dependency-cruiser/bin/dependency-cruiser.mjs'),
  '--config',
  '.dependency-cruiser.cjs',
  '--output-type',
  'json',
  'apps/api/src',
  'apps/web/src',
  'packages/contracts/src',
]

const result = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'inherit'] })
  let output = ''
  child.stdout.setEncoding('utf8').on('data', (chunk) => (output += chunk))
  child.once('error', reject)
  child.once('exit', (code, signal) => resolve({ code, signal, output }))
})

if (result.code !== 0) {
  console.error(`dependency-cruiser failed (${result.signal ?? result.code}).`)
  process.exit(1)
}

const graph = JSON.parse(result.output)
const violations = []

for (const violation of graph.summary.violations) {
  violations.push(`${violation.rule.name}: ${violation.from}${violation.to ? ` -> ${violation.to}` : ''}`)
}

for (const module of graph.modules) {
  const apiSource = module.source.match(/^apps\/api\/src\/modules\/([^/]+)\//)
  const featureSource = module.source.match(/^apps\/web\/src\/features\/([^/]+)\//)

  for (const dependency of module.dependencies) {
    if (!dependency.resolved) continue

    const apiTarget = dependency.resolved.match(/^apps\/api\/src\/modules\/([^/]+)\//)
    if (
      apiSource &&
      apiTarget &&
      apiSource[1] !== apiTarget[1] &&
      !dependency.resolved.endsWith(`/${apiTarget[1]}/${apiTarget[1]}.module.ts`)
    ) {
      violations.push(`${module.source} imports private API module file ${dependency.resolved}`)
    }

    const featureTarget = dependency.resolved.match(/^apps\/web\/src\/features\/([^/]+)\//)
    if (
      featureSource &&
      featureTarget &&
      featureSource[1] !== featureTarget[1] &&
      !dependency.resolved.endsWith(`/features/${featureTarget[1]}/index.ts`)
    ) {
      violations.push(`${module.source} imports private web feature file ${dependency.resolved}`)
    }
  }
}

if (violations.length) {
  console.error(violations.map((violation) => `✖ ${violation}`).join('\n'))
  process.exit(1)
}

console.log(`✔ dependency-cruiser rules checked (${graph.modules.length} source modules; no violations).`)
console.log(`✔ module encapsulation checked (${graph.modules.length} source modules).`)
