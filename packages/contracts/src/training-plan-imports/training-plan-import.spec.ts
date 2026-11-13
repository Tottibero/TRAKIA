import { describe, expect, it } from 'vitest'
import {
  ImportValidationIssueCodeSchema,
  ImportValidationIssueSchema,
  TrainingPlanImportV1Schema,
  type ImportValidationIssue,
  type TrainingPlanImportV1,
} from '../index.js'

const exercises: TrainingPlanImportV1['exercises'] = [
  { key: 'barbell-squat', name: 'Barbell squat', category: 'strength', supportedMetrics: ['reps', 'weight'] },
  { key: 'goblet-squat', name: 'Goblet squat', category: 'strength', supportedMetrics: ['reps', 'weight'] },
  {
    key: 'interval-run',
    name: 'Interval run',
    category: 'cardio',
    supportedMetrics: ['duration', 'distance'],
  },
  { key: 'bike-recovery', name: 'Bike recovery', category: 'cardio', supportedMetrics: ['duration'] },
]

const validDocument: TrainingPlanImportV1 = {
  format: 'trakia.training-plan',
  version: 1,
  exercises,
  plan: {
    key: 'winter-strength',
    name: 'Winter strength',
    description: 'Strength and conditioning block',
    startDate: '2026-11-01',
    endDate: '2026-11-30',
    days: [
      {
        type: 'session',
        key: 'session-one',
        date: '2026-11-13',
        blocks: [
          {
            type: 'sets',
            key: 'strength-sets',
            restBetweenSetsSeconds: 90,
            exercises: [
              {
                key: 'squat-appearance',
                exerciseKey: 'barbell-squat',
                sets: 3,
                targets: { reps: 8, weight: 60 },
                alternatives: [
                  { key: 'goblet-option', exerciseKey: 'goblet-squat', targetOverrides: { weight: null } },
                ],
                overridesBySet: [{ index: 2, targetOverrides: { reps: 6, weight: 65 } }],
              },
            ],
          },
          {
            type: 'circuit',
            key: 'rounds-circuit',
            mode: 'rounds',
            rounds: 3,
            restBetweenRoundsSeconds: 60,
            exercises: [
              {
                key: 'circuit-squat',
                exerciseKey: 'barbell-squat',
                overridesByRound: [{ index: 1, targetOverrides: { reps: 5 } }],
              },
            ],
          },
          {
            type: 'intervals',
            key: 'run-intervals',
            cycles: 4,
            phases: [
              {
                type: 'work',
                key: 'fast-run',
                windowSeconds: 60,
                exercise: { key: 'run-phase', exerciseKey: 'interval-run', targets: { distance: 200 } },
              },
              {
                type: 'rest',
                key: 'active-recovery',
                windowSeconds: 90,
                exercise: { key: 'recovery-phase', exerciseKey: 'bike-recovery', targets: { duration: 90 } },
              },
              { type: 'rest', key: 'passive-recovery', windowSeconds: 30 },
            ],
          },
        ],
      },
      { type: 'rest', key: 'rest-day', date: '2026-11-14' },
    ],
  },
}

function cloneDocument(): TrainingPlanImportV1 {
  return structuredClone(validDocument)
}

function issueFor(
  result: ReturnType<typeof TrainingPlanImportV1Schema.safeParse>,
  code: string,
  path: Array<string | number>,
): boolean {
  return (
    !result.success &&
    result.error.issues.some(
      (issue) =>
        issue.code === 'custom' && issue.path.join('.') === path.join('.') && issue.message.includes(code),
    )
  )
}

describe('TrainingPlanImportV1Schema', () => {
  it('accepts a complete v1 document with sets, rounds, intervals and active recovery', () => {
    expect(TrainingPlanImportV1Schema.parse(validDocument)).toEqual(validDocument)
  })

  it('rejects an unknown format and unsupported version', () => {
    const wrongFormat = cloneDocument() as unknown as Record<string, unknown>
    wrongFormat.format = 'other.format'
    expect(TrainingPlanImportV1Schema.safeParse(wrongFormat).success).toBe(false)
    const wrongVersion = cloneDocument() as unknown as Record<string, unknown>
    wrongVersion.version = 2
    expect(TrainingPlanImportV1Schema.safeParse(wrongVersion).success).toBe(false)
  })

  it('requires plan and exercise definitions', () => {
    const noPlan = cloneDocument() as unknown as Record<string, unknown>
    delete noPlan.plan
    expect(TrainingPlanImportV1Schema.safeParse(noPlan).success).toBe(false)
    const noExercises = cloneDocument() as unknown as Record<string, unknown>
    delete noExercises.exercises
    expect(TrainingPlanImportV1Schema.safeParse(noExercises).success).toBe(false)
  })

  it('rejects duplicate exercise definitions and permits unused definitions', () => {
    const duplicate = cloneDocument()
    duplicate.exercises.push(structuredClone(duplicate.exercises[0]!))
    expect(TrainingPlanImportV1Schema.safeParse(duplicate).success).toBe(false)
    const unused = cloneDocument()
    unused.exercises.push({
      key: 'unused-mobility',
      name: 'Mobility',
      category: 'mobility',
      supportedMetrics: ['duration'],
    })
    expect(TrainingPlanImportV1Schema.safeParse(unused).success).toBe(true)
  })

  it('rejects missing primary, alternative, interval work and active recovery definitions at their fields', () => {
    const missingMain = cloneDocument()
    if (missingMain.plan.days[0]!.type === 'session') {
      ;(
        missingMain.plan.days[0]!.blocks[0] as { exercises: Array<{ exerciseKey: string }> }
      ).exercises[0]!.exerciseKey = 'unknown-main'
    }
    const mainResult = TrainingPlanImportV1Schema.safeParse(missingMain)
    expect(
      issueFor(mainResult, 'unknown-main', ['plan', 'days', 0, 'blocks', 0, 'exercises', 0, 'exerciseKey']),
    ).toBe(true)

    const missingAlternative = cloneDocument()
    const firstSet =
      missingAlternative.plan.days[0]!.type === 'session'
        ? (missingAlternative.plan.days[0]!.blocks[0] as {
            exercises: Array<{ alternatives: Array<{ exerciseKey: string }> }>
          })
        : undefined
    firstSet!.exercises[0]!.alternatives[0]!.exerciseKey = 'unknown-alternative'
    expect(
      issueFor(TrainingPlanImportV1Schema.safeParse(missingAlternative), 'unknown-alternative', [
        'plan',
        'days',
        0,
        'blocks',
        0,
        'exercises',
        0,
        'alternatives',
        0,
        'exerciseKey',
      ]),
    ).toBe(true)

    const missingWork = cloneDocument()
    const intervals =
      missingWork.plan.days[0]!.type === 'session'
        ? (missingWork.plan.days[0]!.blocks[2] as { phases: Array<{ exercise?: { exerciseKey: string } }> })
        : undefined
    intervals!.phases[0]!.exercise!.exerciseKey = 'unknown-work'
    expect(
      issueFor(TrainingPlanImportV1Schema.safeParse(missingWork), 'unknown-work', [
        'plan',
        'days',
        0,
        'blocks',
        2,
        'phases',
        0,
        'exercise',
        'exerciseKey',
      ]),
    ).toBe(true)

    const missingRecovery = cloneDocument()
    const recovery =
      missingRecovery.plan.days[0]!.type === 'session'
        ? (missingRecovery.plan.days[0]!.blocks[2] as {
            phases: Array<{ exercise?: { exerciseKey: string } }>
          })
        : undefined
    recovery!.phases[1]!.exercise!.exerciseKey = 'unknown-recovery'
    expect(
      issueFor(TrainingPlanImportV1Schema.safeParse(missingRecovery), 'unknown-recovery', [
        'plan',
        'days',
        0,
        'blocks',
        2,
        'phases',
        1,
        'exercise',
        'exerciseKey',
      ]),
    ).toBe(true)
  })

  it('accepts compatible targets and rejects an explicitly unsupported target', () => {
    expect(TrainingPlanImportV1Schema.safeParse(validDocument).success).toBe(true)
    const incompatible = cloneDocument()
    const set =
      incompatible.plan.days[0]!.type === 'session'
        ? (incompatible.plan.days[0]!.blocks[0] as { exercises: Array<{ targets: { duration?: number } }> })
        : undefined
    set!.exercises[0]!.targets.duration = 30
    expect(TrainingPlanImportV1Schema.safeParse(incompatible).success).toBe(false)
  })

  it('allows null to remove an alternative objective and accepts set and round adjustments', () => {
    const document = cloneDocument()
    const session = document.plan.days[0]!
    expect(
      session.type === 'session' &&
        session.blocks[0]!.type === 'sets' &&
        session.blocks[0]!.exercises[0]!.alternatives![0]!.targetOverrides!.weight,
    ).toBeNull()
    expect(TrainingPlanImportV1Schema.safeParse(document).success).toBe(true)
  })

  it('rejects an adjustment metric unsupported by one selectable exercise', () => {
    const incompatible = cloneDocument()
    const sets =
      incompatible.plan.days[0]!.type === 'session'
        ? (incompatible.plan.days[0]!.blocks[0] as {
            exercises: Array<{ overridesBySet: Array<{ targetOverrides: { duration?: number } }> }>
          })
        : undefined
    sets!.exercises[0]!.overridesBySet[0]!.targetOverrides.duration = 30
    expect(TrainingPlanImportV1Schema.safeParse(incompatible).success).toBe(false)
  })

  it('checks interval alternatives and explicit alternative objectives', () => {
    const missingAlternative = cloneDocument()
    const intervals =
      missingAlternative.plan.days[0]!.type === 'session'
        ? (missingAlternative.plan.days[0]!.blocks[2] as {
            phases: Array<{ exercise?: { alternatives?: Array<{ key: string; exerciseKey: string }> } }>
          })
        : undefined
    intervals!.phases[0]!.exercise!.alternatives = [{ key: 'unlisted-run', exerciseKey: 'unlisted-exercise' }]
    expect(
      issueFor(TrainingPlanImportV1Schema.safeParse(missingAlternative), 'unlisted-exercise', [
        'plan',
        'days',
        0,
        'blocks',
        2,
        'phases',
        0,
        'exercise',
        'alternatives',
        0,
        'exerciseKey',
      ]),
    ).toBe(true)

    const incompatibleTarget = cloneDocument()
    const sets =
      incompatibleTarget.plan.days[0]!.type === 'session'
        ? (incompatibleTarget.plan.days[0]!.blocks[0] as {
            exercises: Array<{ alternatives: Array<{ targetOverrides?: { duration?: number } }> }>
          })
        : undefined
    sets!.exercises[0]!.alternatives[0]!.targetOverrides = { duration: 30 }
    expect(TrainingPlanImportV1Schema.safeParse(incompatibleTarget).success).toBe(false)
  })

  it('rejects duplicate planning keys and invalid calendar dates or periods', () => {
    const duplicate = cloneDocument()
    duplicate.plan.days.push(structuredClone(duplicate.plan.days[0]!))
    expect(TrainingPlanImportV1Schema.safeParse(duplicate).success).toBe(false)
    const badDate = cloneDocument()
    badDate.plan.startDate = '2026-02-30'
    expect(TrainingPlanImportV1Schema.safeParse(badDate).success).toBe(false)
    const badPeriod = cloneDocument()
    badPeriod.plan.startDate = '2026-12-01'
    expect(TrainingPlanImportV1Schema.safeParse(badPeriod).success).toBe(false)
  })

  it('rejects unknown properties at root, exercise, external reference and session levels', () => {
    const root = cloneDocument() as unknown as Record<string, unknown>
    root.mode = 'replace'
    expect(TrainingPlanImportV1Schema.safeParse(root).success).toBe(false)
    const exercise = cloneDocument() as unknown as { exercises: Array<Record<string, unknown>> }
    exercise.exercises[0]!.unexpected = true
    expect(TrainingPlanImportV1Schema.safeParse(exercise).success).toBe(false)
    const externalReference = cloneDocument() as unknown as { exercises: Array<Record<string, unknown>> }
    externalReference.exercises[0]!.externalReferences = [{ provider: 'wger', externalId: 1, extra: true }]
    expect(TrainingPlanImportV1Schema.safeParse(externalReference).success).toBe(false)
    const session = cloneDocument() as unknown as { plan: { days: Array<Record<string, unknown>> } }
    session.plan.days[0]!.unexpected = true
    expect(TrainingPlanImportV1Schema.safeParse(session).success).toBe(false)

    const plan = cloneDocument() as unknown as { plan: Record<string, unknown> }
    plan.plan.unexpected = true
    expect(TrainingPlanImportV1Schema.safeParse(plan).success).toBe(false)

    const restDay = cloneDocument() as unknown as { plan: { days: Array<Record<string, unknown>> } }
    restDay.plan.days[1]!.unexpected = true
    expect(TrainingPlanImportV1Schema.safeParse(restDay).success).toBe(false)
  })

  it('rejects unknown properties in blocks, alternatives, targets, overrides and interval phases', () => {
    const block = cloneDocument() as unknown as {
      plan: { days: Array<{ blocks: Array<Record<string, unknown>> }> }
    }
    block.plan.days[0]!.blocks[0]!.unexpected = true
    expect(TrainingPlanImportV1Schema.safeParse(block).success).toBe(false)
    const alternative = cloneDocument() as unknown as {
      plan: {
        days: Array<{ blocks: Array<{ exercises: Array<{ alternatives: Array<Record<string, unknown>> }> }> }>
      }
    }
    alternative.plan.days[0]!.blocks[0]!.exercises[0]!.alternatives[0]!.unexpected = true
    expect(TrainingPlanImportV1Schema.safeParse(alternative).success).toBe(false)
    const targets = cloneDocument() as unknown as {
      plan: { days: Array<{ blocks: Array<{ exercises: Array<{ targets: Record<string, unknown> }> }> }> }
    }
    targets.plan.days[0]!.blocks[0]!.exercises[0]!.targets.unapproved = 2
    expect(TrainingPlanImportV1Schema.safeParse(targets).success).toBe(false)
    const overrides = cloneDocument() as unknown as {
      plan: {
        days: Array<{
          blocks: Array<{
            exercises: Array<{ overridesBySet: Array<{ targetOverrides: Record<string, unknown> }> }>
          }>
        }>
      }
    }
    overrides.plan.days[0]!.blocks[0]!.exercises[0]!.overridesBySet[0]!.targetOverrides.unapproved = 2
    expect(TrainingPlanImportV1Schema.safeParse(overrides).success).toBe(false)
    const phase = cloneDocument() as unknown as {
      plan: { days: Array<{ blocks: Array<{ phases: Array<Record<string, unknown>> }> }> }
    }
    phase.plan.days[0]!.blocks[2]!.phases[0]!.unexpected = true
    expect(TrainingPlanImportV1Schema.safeParse(phase).success).toBe(false)

    const plannedExercise = cloneDocument() as unknown as {
      plan: { days: Array<{ blocks: Array<{ exercises: Array<Record<string, unknown>> }> }> }
    }
    plannedExercise.plan.days[0]!.blocks[0]!.exercises[0]!.unexpected = true
    expect(TrainingPlanImportV1Schema.safeParse(plannedExercise).success).toBe(false)

    const alternativeTargetOverrides = cloneDocument() as unknown as {
      plan: {
        days: Array<{
          blocks: Array<{
            exercises: Array<{ alternatives: Array<{ targetOverrides: Record<string, unknown> }> }>
          }>
        }>
      }
    }
    alternativeTargetOverrides.plan.days[0]!.blocks[0]!.exercises[0]!.alternatives[0]!.targetOverrides.unapproved = 1
    expect(TrainingPlanImportV1Schema.safeParse(alternativeTargetOverrides).success).toBe(false)

    const indexedOverride = cloneDocument() as unknown as {
      plan: {
        days: Array<{
          blocks: Array<{ exercises: Array<{ overridesBySet: Array<Record<string, unknown>> }> }>
        }>
      }
    }
    indexedOverride.plan.days[0]!.blocks[0]!.exercises[0]!.overridesBySet[0]!.unexpected = true
    expect(TrainingPlanImportV1Schema.safeParse(indexedOverride).success).toBe(false)

    for (const blockIndex of [1, 2]) {
      const typedBlock = cloneDocument() as unknown as {
        plan: { days: Array<{ blocks: Array<Record<string, unknown>> }> }
      }
      typedBlock.plan.days[0]!.blocks[blockIndex]!.unexpected = true
      expect(TrainingPlanImportV1Schema.safeParse(typedBlock).success).toBe(false)
    }
  })
})

describe('ImportValidationIssueSchema', () => {
  it('accepts a normalized issue with numeric path segments and rejects unknown codes', () => {
    const issue: ImportValidationIssue = {
      code: 'EXERCISE_NOT_DEFINED',
      path: ['plan', 'days', 1, 'blocks', 0, 'exerciseKey'],
      message: 'Exercise is not defined',
    }
    expect(ImportValidationIssueSchema.parse(issue)).toEqual(issue)
    expect(ImportValidationIssueCodeSchema.safeParse('DATABASE_CONFLICT').success).toBe(false)
  })
})
