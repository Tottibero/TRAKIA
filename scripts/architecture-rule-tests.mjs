import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { ESLint } from 'eslint'
import { cruise } from 'dependency-cruiser'
import extractDepcruiseOptions from 'dependency-cruiser/config-utl/extract-depcruise-options'
import { join, relative, resolve } from 'node:path'

const root = process.cwd()
const eslint = new ESLint({ cwd: root })
const fixtureModule = `__architecture_fixture_${process.pid}`
const fixturePath = `apps/api/src/modules/${fixtureModule}`

async function lintFixture(filePath, code, expectError) {
  const [result] = await eslint.lintText(code, { filePath: resolve(root, filePath) })
  const restrictedImports = result.messages.filter((message) => message.ruleId === 'no-restricted-imports')
  const restrictedGlobals = result.messages.filter((message) => message.ruleId === 'no-restricted-globals')
  const violations = [...restrictedImports, ...restrictedGlobals]

  assert.equal(
    violations.length > 0,
    expectError,
    `${filePath}: expected ${expectError ? 'a restriction error' : 'no restriction error'}, got ${result.messages.map((message) => message.message).join('; ')}`,
  )
}

async function cruiseFixture(fixtureRoot) {
  const options = await extractDepcruiseOptions(resolve(root, '.dependency-cruiser.cjs'))
  const result = await cruise([relative(root, fixtureRoot)], { ...options, outputType: 'json' })
  return { status: result.exitCode, report: result.output }
}

function dependencyCruiserViolationNames(result) {
  assert.equal(result.status, 0, 'dependency-cruiser could not analyze the architecture fixture')
  const report = typeof result.report === 'string' ? JSON.parse(result.report) : result.report
  return report.summary.violations.map(({ rule }) => rule.name)
}

async function verifyEslintRestrictions() {
  await lintFixture(
    `${fixturePath}/domain/http.ts`,
    "import { createServer } from 'node:http'\nvoid createServer",
    true,
  )
  await lintFixture(
    `${fixturePath}/domain/express.ts`,
    "import express from 'express/subpath'\nvoid express",
    true,
  )
  for (const specifier of ['node:https', 'node:http2', 'http', 'https', 'axios/subpath', 'undici']) {
    await lintFixture(
      `${fixturePath}/domain/${specifier.replace(/[^a-z0-9]+/gi, '-')}.ts`,
      `import '${specifier}'`,
      true,
    )
  }
  await lintFixture(`${fixturePath}/domain/fetch.ts`, 'void fetch', true)
  await lintFixture(
    `${fixturePath}/domain/allowed.ts`,
    "import { basename } from 'node:path'\nvoid basename",
    false,
  )
  await lintFixture(
    `${fixturePath}/presentation/private.ts`,
    "import { Repository } from '../infrastructure/example.repository.js'\nvoid Repository",
    true,
  )
  await lintFixture(
    `${fixturePath}/presentation/orm.ts`,
    "import type { Repository } from 'typeorm'\nvoid (null as Repository<unknown> | null)",
    true,
  )
  await lintFixture(
    `${fixturePath}/presentation/entity.ts`,
    "import type { ExampleEntity } from '../example.entity.js'\nvoid (null as ExampleEntity | null)",
    true,
  )
  await lintFixture(
    `${fixturePath}/presentation/repository.ts`,
    "import type { ExampleRepository } from '../example.repository.js'\nvoid (null as ExampleRepository | null)",
    true,
  )
  await lintFixture(
    `${fixturePath}/example.controller.ts`,
    "import { ExampleRepository } from './infrastructure/example.repository.js'\nvoid ExampleRepository",
    true,
  )
  await lintFixture(
    `${fixturePath}/presentation/allowed.ts`,
    "import { execute } from '../application/use-case.js'\nimport type { HealthResponse } from '@trakia/contracts'\nvoid [execute, null as HealthResponse | null]",
    false,
  )
}

async function verifyDependencyCruiserRestrictions() {
  const fixtureRoot = mkdtempSync(resolve(root, 'apps/api/src/modules/__architecture-fixture-'))
  const domainDirectory = join(fixtureRoot, 'domain')
  const applicationDirectory = join(fixtureRoot, 'application')
  const infrastructureDirectory = join(fixtureRoot, 'infrastructure')
  const presentationDirectory = join(fixtureRoot, 'presentation')
  for (const directory of [
    domainDirectory,
    applicationDirectory,
    infrastructureDirectory,
    presentationDirectory,
  ]) {
    mkdirSync(directory, { recursive: true })
  }

  try {
    writeFileSync(join(domainDirectory, 'http.ts'), "import 'node:http'\n")
    let result = await cruiseFixture(fixtureRoot)
    assert.ok(
      dependencyCruiserViolationNames(result).includes('domain-no-http'),
      'dependency-cruiser must reject HTTP imports from domain',
    )

    rmSync(join(domainDirectory, 'http.ts'))
    writeFileSync(join(domainDirectory, 'allowed.ts'), "import 'node:path'\n")
    writeFileSync(join(applicationDirectory, 'use-case.ts'), 'export const execute = () => undefined\n')
    writeFileSync(
      join(infrastructureDirectory, 'example.repository.ts'),
      'export class ExampleRepository {}\n',
    )
    writeFileSync(
      join(presentationDirectory, 'private.ts'),
      "import { ExampleRepository } from '../infrastructure/example.repository.js'\nvoid ExampleRepository\n",
    )
    writeFileSync(
      join(fixtureRoot, 'private.controller.ts'),
      "import { ExampleRepository } from './infrastructure/example.repository.js'\nvoid ExampleRepository\n",
    )
    result = await cruiseFixture(fixtureRoot)
    const violations = dependencyCruiserViolationNames(result)
    assert.ok(
      violations.includes('presentation-no-persistence'),
      'dependency-cruiser must reject presentation imports from infrastructure',
    )
    assert.ok(
      violations.includes('controller-no-infrastructure'),
      'dependency-cruiser must reject controller imports from infrastructure',
    )

    rmSync(join(presentationDirectory, 'private.ts'))
    rmSync(join(fixtureRoot, 'private.controller.ts'))
    writeFileSync(
      join(presentationDirectory, 'allowed.ts'),
      "import { execute } from '../application/use-case.js'\nimport type { HealthResponse } from '@trakia/contracts'\nvoid [execute, null as HealthResponse | null]\n",
    )
    result = await cruiseFixture(fixtureRoot)
    assert.deepEqual(dependencyCruiserViolationNames(result), [])
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
}

async function verifyWebCircularDependencyRestriction() {
  const fixtureRoot = mkdtempSync(resolve(root, 'apps/web/src/__architecture-fixture-'))
  try {
    writeFileSync(
      join(fixtureRoot, 'first.ts'),
      "import { second } from './second.js'\nexport const first = second\n",
    )
    writeFileSync(
      join(fixtureRoot, 'second.ts'),
      "import { first } from './first.js'\nexport const second = first\n",
    )
    const result = await cruiseFixture(fixtureRoot)
    assert.ok(
      dependencyCruiserViolationNames(result).includes('no-circular'),
      'dependency-cruiser must reject circular imports in the web fixture',
    )
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
}

export async function verifyArchitectureRuleFixtures() {
  await verifyEslintRestrictions()
  await verifyDependencyCruiserRestrictions()
  await verifyWebCircularDependencyRestriction()
  console.log('✔ architecture restriction fixtures passed (including web circular imports).')
}
