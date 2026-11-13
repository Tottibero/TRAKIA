import {
  ExerciseTargetsSchema,
  PlannedAlternativeSchema,
  PlannedBlockSchema,
  PlannedExerciseSchema,
  PlannedIntervalPhaseSchema,
  PlannedRestDaySchema,
  PlannedSessionSchema,
  TargetOverridesSchema,
  TrainingPlanDaySchema,
  TrainingPlanDefinitionSchema,
  resolveExerciseTargets,
  type PlannedBlock,
  type PlannedExercise,
} from '../index.js'

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function assertThrows(run: () => unknown, message: RegExp, label: string): void {
  try {
    run()
  } catch (error) {
    if (error instanceof Error && message.test(error.message)) return
    throw new Error(`${label}: unexpected error ${String(error)}`, { cause: error })
  }
  throw new Error(`${label}: expected an error`)
}

const strengthExercise = {
  key: 'squat-appearance',
  exerciseKey: 'barbell-squat',
  targets: { reps: 8, weight: 60 },
}

const setsBlock = {
  type: 'sets',
  key: 'main-sets',
  restBetweenSetsSeconds: 90,
  exercises: [
    {
      ...strengthExercise,
      sets: 3,
      overridesBySet: [{ index: 2, targetOverrides: { reps: 6, weight: null } }],
    },
  ],
} as const

const session = (key = 'session-a', date = '2026-11-13', blocks: unknown[] = [setsBlock]) => ({
  type: 'session',
  key,
  date,
  blocks,
})

const plan = (days: unknown[] = [session()]) => ({
  key: 'winter-plan',
  name: 'Winter strength',
  startDate: '2026-11-01',
  endDate: '2026-11-30',
  days,
})

function valid(value: unknown, label: string): void {
  const result = TrainingPlanDefinitionSchema.safeParse(value)
  if (!result.success) throw new Error(`${label}: ${result.error.message}`)
}

function invalid(value: unknown, label: string): void {
  if (TrainingPlanDefinitionSchema.safeParse(value).success) throw new Error(`${label}: expected rejection`)
}

function blockValid(value: unknown, label: string): void {
  const result = PlannedBlockSchema.safeParse(value)
  if (!result.success) throw new Error(`${label}: ${result.error.message}`)
}

function blockInvalid(value: unknown, label: string): void {
  if (PlannedBlockSchema.safeParse(value).success) throw new Error(`${label}: expected rejection`)
}

const cases: Array<[string, () => void]> = [
  [
    'accepts multiple sessions on one date',
    () => valid(plan([session('morning'), session('evening')]), 'multiple sessions'),
  ],
  [
    'accepts one stable rest day',
    () => valid(plan([{ type: 'rest', key: 'rest-friday', date: '2026-11-13' }]), 'rest day'),
  ],
  [
    'rejects session and rest on the same date in either order',
    () => {
      invalid(
        plan([session(), { type: 'rest', key: 'rest-friday', date: '2026-11-13' }]),
        'session before rest',
      )
      invalid(
        plan([{ type: 'rest', key: 'rest-friday', date: '2026-11-13' }, session()]),
        'rest before session',
      )
    },
  ],
  [
    'rejects two rest days on one date and duplicate rest keys',
    () => {
      invalid(
        plan([
          { type: 'rest', key: 'rest-a', date: '2026-11-13' },
          { type: 'rest', key: 'rest-b', date: '2026-11-13' },
        ]),
        'two rests',
      )
      invalid(
        plan([
          { type: 'rest', key: 'same-rest', date: '2026-11-12' },
          { type: 'rest', key: 'same-rest', date: '2026-11-13' },
        ]),
        'duplicate rest key',
      )
      invalid(
        plan([session('shared-day-key'), { type: 'rest', key: 'shared-day-key', date: '2026-11-14' }]),
        'session/rest key collision',
      )
    },
  ],
  [
    'rejects impossible dates and dates outside the plan period',
    () => {
      invalid(plan([session('bad-date', '2026-02-30')]), 'invalid date')
      invalid(plan([session('outside', '2026-12-01')]), 'outside date')
    },
  ],
  [
    'rejects a session without blocks',
    () => invalid(plan([session('empty', '2026-11-13', [])]), 'empty session'),
  ],
  [
    'rejects duplicate session and block keys',
    () => {
      invalid(plan([session('same'), session('same', '2026-11-14')]), 'duplicate session key')
      invalid(
        plan([session('blocks', '2026-11-13', [setsBlock, { ...setsBlock, key: 'main-sets' }])]),
        'duplicate block key',
      )
    },
  ],
  [
    'accepts common set targets with per-set numeric override and null removal',
    () => blockValid(setsBlock, 'sets overrides'),
  ],
  [
    'rejects set overrides for indexes that do not exist',
    () =>
      blockInvalid(
        {
          ...setsBlock,
          exercises: [
            { ...setsBlock.exercises[0], overridesBySet: [{ index: 4, targetOverrides: { reps: 5 } }] },
          ],
        },
        'set index',
      ),
  ],
  [
    'accepts fixed-round circuits for supersets and hypersets',
    () =>
      blockValid(
        {
          type: 'circuit',
          key: 'superset-block',
          mode: 'rounds',
          rounds: 4,
          restBetweenRoundsSeconds: 60,
          exercises: [
            {
              key: 'press',
              exerciseKey: 'bench-press',
              overridesByRound: [{ index: 2, targetOverrides: { reps: 8 } }],
            },
            { key: 'row', exerciseKey: 'barbell-row' },
          ],
        },
        'fixed circuit',
      ),
  ],
  [
    'accepts AMRAP and rejects numbered-round adjustments in AMRAP',
    () => {
      blockValid(
        {
          type: 'circuit',
          key: 'amrap',
          mode: 'amrap',
          maxDurationSeconds: 600,
          exercises: [{ key: 'burpee', exerciseKey: 'burpee' }],
        },
        'AMRAP',
      )
      blockInvalid(
        {
          type: 'circuit',
          key: 'amrap',
          mode: 'amrap',
          maxDurationSeconds: 600,
          exercises: [
            {
              key: 'burpee',
              exerciseKey: 'burpee',
              overridesByRound: [{ index: 1, targetOverrides: { reps: 10 } }],
            },
          ],
        },
        'AMRAP round override',
      )
    },
  ],
  [
    'rejects fixed-circuit round adjustments outside the configured rounds',
    () =>
      blockInvalid(
        {
          type: 'circuit',
          key: 'fixed-circuit',
          mode: 'rounds',
          rounds: 2,
          exercises: [
            {
              key: 'press',
              exerciseKey: 'bench-press',
              overridesByRound: [{ index: 3, targetOverrides: { reps: 8 } }],
            },
          ],
        },
        'round index',
      ),
  ],
  [
    'accepts HIIT, EMOM, timed-only work and active or passive recovery',
    () =>
      blockValid(
        {
          type: 'intervals',
          key: 'emom',
          cycles: 10,
          phases: [
            {
              type: 'work',
              key: 'minute-work',
              windowSeconds: 45,
              exercise: { key: 'bike', exerciseKey: 'air-bike' },
            },
            {
              type: 'rest',
              key: 'active-rest',
              windowSeconds: 15,
              exercise: { key: 'walk', exerciseKey: 'treadmill-walk', targets: { duration: 15 } },
            },
            { type: 'rest', key: 'passive-rest', windowSeconds: 30 },
          ],
        },
        'interval phases',
      ),
  ],
  [
    'rejects a rest phase with objectives but no exercise and duplicate phase keys',
    () => {
      blockInvalid(
        {
          type: 'intervals',
          key: 'intervals',
          cycles: 2,
          phases: [{ type: 'rest', key: 'rest', windowSeconds: 30, targets: { duration: 30 } }],
        },
        'rest objectives without exercise',
      )
      blockInvalid(
        {
          type: 'intervals',
          key: 'intervals',
          cycles: 2,
          phases: [
            {
              type: 'work',
              key: 'same-phase',
              windowSeconds: 30,
              exercise: { key: 'bike', exerciseKey: 'bike' },
            },
            { type: 'rest', key: 'same-phase', windowSeconds: 30 },
          ],
        },
        'duplicate phase',
      )
    },
  ],
  [
    'requires positive interval cycles and phase windows',
    () => {
      blockInvalid(
        {
          type: 'intervals',
          key: 'zero-cycles',
          cycles: 0,
          phases: [
            { type: 'work', key: 'work', windowSeconds: 30, exercise: { key: 'run', exerciseKey: 'run' } },
          ],
        },
        'zero cycles',
      )
      blockInvalid(
        {
          type: 'intervals',
          key: 'zero-window',
          cycles: 2,
          phases: [
            { type: 'work', key: 'work', windowSeconds: 0, exercise: { key: 'run', exerciseKey: 'run' } },
          ],
        },
        'zero window',
      )
    },
  ],
  [
    'accepts alternatives and rejects a fourth, duplicate, or main-exercise alternative',
    () => {
      const alternatives = [1, 2, 3].map((n) => ({ key: `alt-${n}`, exerciseKey: `exercise-${n}` }))
      blockValid(
        {
          type: 'sets',
          key: 'alt-block',
          restBetweenSetsSeconds: 60,
          exercises: [{ key: 'main', exerciseKey: 'squat', sets: 3, alternatives }],
        },
        'three alternatives',
      )
      blockInvalid(
        {
          type: 'sets',
          key: 'alt-block',
          restBetweenSetsSeconds: 60,
          exercises: [
            {
              key: 'main',
              exerciseKey: 'squat',
              sets: 3,
              alternatives: [...alternatives, { key: 'alt-4', exerciseKey: 'exercise-4' }],
            },
          ],
        },
        'four alternatives',
      )
      blockInvalid(
        {
          type: 'sets',
          key: 'alt-block',
          restBetweenSetsSeconds: 60,
          exercises: [
            {
              key: 'main',
              exerciseKey: 'squat',
              sets: 3,
              alternatives: [{ key: 'alt', exerciseKey: 'squat' }],
            },
          ],
        },
        'main duplicated',
      )
      blockInvalid(
        {
          type: 'sets',
          key: 'alt-block',
          restBetweenSetsSeconds: 60,
          exercises: [
            {
              key: 'main',
              exerciseKey: 'squat',
              sets: 3,
              alternatives: [
                { key: 'alt-a', exerciseKey: 'press' },
                { key: 'alt-b', exerciseKey: 'press' },
              ],
            },
          ],
        },
        'duplicate alternatives',
      )
    },
  ],
  [
    'rejects duplicate exercise appearance keys inside a block',
    () =>
      blockInvalid(
        {
          type: 'sets',
          key: 'sets',
          restBetweenSetsSeconds: 60,
          exercises: [
            { key: 'same', exerciseKey: 'squat', sets: 2 },
            { key: 'same', exerciseKey: 'press', sets: 2 },
          ],
        },
        'duplicate appearance',
      ),
  ],
  [
    'resolves supported inherited targets, alternative overrides and null removal',
    () => {
      const exercise: PlannedExercise = {
        ...strengthExercise,
        alternatives: [{ key: 'front-squat', exerciseKey: 'front-squat', targetOverrides: { weight: 40 } }],
      }
      assertEqual(
        resolveExerciseTargets(exercise, ['reps'], {
          alternativeKey: 'front-squat',
          targetOverrides: { reps: null, weight: null },
        }),
        {},
        'null removal',
      )
      assertEqual(
        resolveExerciseTargets(exercise, ['reps', 'weight'], { alternativeKey: 'front-squat' }),
        { reps: 8, weight: 40 },
        'alternative override',
      )
      assertEqual(
        resolveExerciseTargets(exercise, ['reps']),
        { reps: 8 },
        'filter incompatible inherited target',
      )
      assertThrows(
        () =>
          resolveExerciseTargets(exercise, ['reps'], {
            alternativeKey: 'front-squat',
            targetOverrides: { weight: 35 },
          }),
        /Unsupported effective exercise target/,
        'incompatible override',
      )
    },
  ],
  [
    'retains block discriminators and validates the plan public schema',
    () => {
      if (!PlannedBlockSchema.safeParse(setsBlock).success)
        throw new Error('Public block schema rejected valid data')
      valid(plan(), 'public training plan schema')
    },
  ],
  [
    'imports and validates planning contracts through the package entry point',
    () => {
      const exercise = { key: 'run', exerciseKey: 'run' }
      const block = {
        type: 'intervals',
        key: 'running',
        cycles: 1,
        phases: [{ type: 'work', key: 'work', windowSeconds: 60, exercise }],
      }
      if (!TrainingPlanDefinitionSchema.safeParse(plan()).success)
        throw new Error('Plan schema is not public')
      if (!PlannedBlockSchema.safeParse(block).success) throw new Error('Block schema is not public')
      if (!PlannedSessionSchema.safeParse(session()).success) throw new Error('Session schema is not public')
      if (!PlannedRestDaySchema.safeParse({ type: 'rest', key: 'rest', date: '2026-11-13' }).success) {
        throw new Error('Rest-day schema is not public')
      }
      if (!TrainingPlanDaySchema.safeParse(session()).success)
        throw new Error('Plan-day schema is not public')
      if (!PlannedExerciseSchema.safeParse(exercise).success)
        throw new Error('Planned-exercise schema is not public')
      if (!PlannedAlternativeSchema.safeParse({ key: 'alt', exerciseKey: 'bike' }).success) {
        throw new Error('Alternative schema is not public')
      }
      if (!PlannedIntervalPhaseSchema.safeParse(block.phases[0]).success) {
        throw new Error('Interval-phase schema is not public')
      }
      if (!ExerciseTargetsSchema.safeParse({ reps: 5 }).success)
        throw new Error('Targets schema is not public')
      if (!TargetOverridesSchema.safeParse({ reps: null }).success)
        throw new Error('Overrides schema is not public')

      const parsedBlock = PlannedBlockSchema.parse({
        type: 'circuit',
        key: 'fixed-circuit',
        mode: 'rounds',
        rounds: 2,
        exercises: [{ key: 'lift', exerciseKey: 'lift' }],
      })
      assertEqual(narrowCircuitCount(parsedBlock), 2, 'discriminated circuit type')
    },
  ],
]

function narrowCircuitCount(block: PlannedBlock): number | undefined {
  if (block.type !== 'circuit') return undefined
  if (block.mode === 'rounds') {
    const rounds: number = block.rounds
    return rounds
  }
  const duration: number = block.maxDurationSeconds
  return duration
}

for (const [label, run] of cases) {
  run()
  console.log(`✓ ${label}`)
}
