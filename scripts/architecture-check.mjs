import { cruise } from 'dependency-cruiser'
import extractDepcruiseOptions from 'dependency-cruiser/config-utl/extract-depcruise-options'
import { resolve } from 'node:path'
import { verifyArchitectureRuleFixtures } from './architecture-rule-tests.mjs'

await verifyArchitectureRuleFixtures()

const options = await extractDepcruiseOptions(resolve('.dependency-cruiser.cjs'))
const result = await cruise(['apps/api/src', 'apps/web/src', 'packages/contracts/src'], {
  ...options,
  outputType: 'json',
})

if (result.exitCode !== 0) {
  console.error(`dependency-cruiser failed (${result.exitCode}).`)
  process.exit(1)
}

const graph = typeof result.output === 'string' ? JSON.parse(result.output) : result.output
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
