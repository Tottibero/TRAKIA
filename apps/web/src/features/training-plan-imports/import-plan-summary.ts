import type { ExerciseMetric, PlannedBlock, PlannedExercise, TrainingPlanDefinition } from '@trakia/contracts'
import { formatPlanDate } from './conflict-presentation.ts'

type TrainingPlanDay = TrainingPlanDefinition['days'][number]
type SetExercise = Extract<PlannedBlock, { type: 'sets' }>['exercises'][number]
type CircuitExercise = Extract<PlannedBlock, { type: 'circuit' }>['exercises'][number]
type TargetOverrides = Partial<Record<ExerciseMetric, number | null>>
type IndexedOverrides = Array<{ index: number; targetOverrides: TargetOverrides }>
type ExerciseSummaryInput = PlannedExercise | SetExercise | CircuitExercise

export interface ImportPlanSummaryItem {
  key: string
  label: string
  details: string
}

export interface ImportPlanSummaryBlock {
  key: string
  heading?: string
  details?: string
  items: ImportPlanSummaryItem[]
}

export interface ImportPlanSummarySession {
  key: string
  date: string
  counts: string[]
  blocks: ImportPlanSummaryBlock[]
}

export interface ImportPlanSummary {
  period: string
  sessionCount: number
  scheduledExerciseCount: number
  sessions: ImportPlanSummarySession[]
}

const metricOrder = ['reps', 'weight', 'duration', 'distance', 'rpe', 'calories'] as const
type Metric = (typeof metricOrder)[number]
type Targets = Partial<Record<Metric, number>>

function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(value)
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes === 0) return `${remainingSeconds} s`
  if (remainingSeconds === 0) return `${minutes} m`
  return `${minutes} m ${remainingSeconds} s`
}

function formatTargetValues(targets: Targets): string[] {
  return metricOrder.flatMap((metric) => {
    const value = targets[metric]
    if (value === undefined) return []
    if (metric === 'reps') return [`${formatNumber(value)} rep.`]
    if (metric === 'weight') return [`${formatNumber(value)} kg`]
    if (metric === 'duration') return [formatDuration(value)]
    if (metric === 'distance') return [`${formatNumber(value)} m`]
    if (metric === 'rpe') return [`RPE ${formatNumber(value)}`]
    return [`${formatNumber(value)} kcal`]
  })
}

function applyTargetOverrides(targets: Targets | undefined, overrides?: TargetOverrides): Targets {
  const resolved = { ...targets }
  for (const metric of metricOrder) {
    if (!overrides || !(metric in overrides)) continue
    const value = overrides[metric]
    if (value === null) delete resolved[metric]
    else if (value !== undefined) resolved[metric] = value
  }
  return resolved
}

function formatTargetsForUnit(targets: Targets, unitCount?: number, unitKind?: 'sets' | 'rounds'): string[] {
  const values = formatTargetValues(targets)
  if (!unitCount || unitKind !== 'sets') return values
  if (targets.reps !== undefined) values[0] = `${unitCount} × ${formatNumber(targets.reps)}`
  else values.unshift(`${unitCount} ${unitCount === 1 ? 'serie' : 'series'}`)
  return values
}

function exerciseName(key: string, names: ReadonlyMap<string, string>): string {
  const knownName = names.get(key)
  if (knownName) return knownName
  const readableKey = key.replaceAll('-', ' ')
  return readableKey.charAt(0).toLocaleUpperCase('es-ES') + readableKey.slice(1)
}

function exerciseLabel(exercise: PlannedExercise, names: ReadonlyMap<string, string>): string {
  const main = exerciseName(exercise.exerciseKey, names)
  const alternatives = (exercise.alternatives ?? []).map(({ exerciseKey }) =>
    exerciseName(exerciseKey, names),
  )
  return alternatives.length ? `${main} (alt. ${alternatives.join(', ')})` : main
}

function targetDescription(
  exercise: ExerciseSummaryInput,
  names: ReadonlyMap<string, string>,
  options: { unitCount?: number; unitKind?: 'sets' | 'rounds'; overrides?: IndexedOverrides } = {},
): string {
  const unitCount = options.unitCount
  const baseTargets = exercise.targets ?? {}
  const values = formatTargetsForUnit(baseTargets, unitCount, options.unitKind)

  const variations = (options.overrides ?? [])
    .slice()
    .sort((left, right) => left.index - right.index)
    .flatMap(({ index, targetOverrides }) => {
      const resolved = applyTargetOverrides(baseTargets, targetOverrides)
      if (metricOrder.every((metric) => resolved[metric] === baseTargets[metric])) return []
      const details = formatTargetValues(resolved)
      if (!details.length)
        return [`${options.unitKind === 'sets' ? 'Serie' : 'Ronda'} ${index}: sin objetivo`]
      return [`${options.unitKind === 'sets' ? 'Serie' : 'Ronda'} ${index}: ${details.join(' · ')}`]
    })

  const alternativeDetails = (exercise.alternatives ?? []).flatMap((alternative) => {
    const alternativeTargets = applyTargetOverrides(baseTargets, alternative.targetOverrides)
    const indexedTargets = (options.overrides ?? []).map(({ targetOverrides }) =>
      applyTargetOverrides(alternativeTargets, targetOverrides),
    )
    const hasSpecificTargets = metricOrder.some(
      (metric) => alternativeTargets[metric] !== baseTargets[metric],
    )
    const hasIndexedTargets = indexedTargets.some((targets) =>
      metricOrder.some((metric) => targets[metric] !== alternativeTargets[metric]),
    )
    if (!hasSpecificTargets && !hasIndexedTargets) return []

    const label = exerciseName(alternative.exerciseKey, names)
    const base = formatTargetsForUnit(alternativeTargets, unitCount, options.unitKind)
    const variants = indexedTargets.flatMap((targets, index) => {
      if (metricOrder.every((metric) => targets[metric] === alternativeTargets[metric])) return []
      const details = formatTargetValues(targets)
      return [
        `${options.unitKind === 'sets' ? 'Serie' : 'Ronda'} ${options.overrides?.[index]?.index}: ${details.join(' · ') || 'sin objetivo'}`,
      ]
    })
    return [`Alternativa ${label}: ${[...base, ...variants].join(' · ') || 'sin objetivos'}`]
  })

  return [...values, ...variations, ...alternativeDetails].join(' · ')
}

function createExerciseItem(
  exercise: ExerciseSummaryInput,
  names: ReadonlyMap<string, string>,
  options: { unitCount?: number; unitKind?: 'sets' | 'rounds'; overrides?: IndexedOverrides } = {},
): ImportPlanSummaryItem {
  return {
    key: exercise.key,
    label: exerciseLabel(exercise, names),
    details: targetDescription(exercise, names, options),
  }
}

function shortSessionDate(value: string): string {
  const parts = new Intl.DateTimeFormat('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).formatToParts(new Date(`${value}T00:00:00.000Z`))
  const weekday = parts.find(({ type }) => type === 'weekday')?.value.replaceAll('.', '') ?? ''
  const day = parts.find(({ type }) => type === 'day')?.value ?? ''
  const month = parts.find(({ type }) => type === 'month')?.value.replaceAll('.', '') ?? ''
  return `${weekday.charAt(0).toLocaleUpperCase('es-ES')}${weekday.slice(1)} ${day} ${month}.`
}

function scheduledExercises(day: Extract<TrainingPlanDay, { type: 'session' }>): number {
  return day.blocks.reduce((count, block) => {
    if (block.type === 'intervals')
      return count + block.phases.filter(({ exercise }) => Boolean(exercise)).length
    return count + block.exercises.length
  }, 0)
}

function blockSummaries(
  day: Extract<TrainingPlanDay, { type: 'session' }>,
  names: ReadonlyMap<string, string>,
): { blocks: ImportPlanSummaryBlock[]; supersetCount: number; circuitCount: number; intervalCount: number } {
  let supersetCount = 0
  let circuitCount = 0
  let intervalCount = 0

  const blocks = day.blocks.map((block): ImportPlanSummaryBlock => {
    if (block.type === 'sets') {
      if (block.exercises.length > 1) {
        supersetCount += 1
        const exercises = block.exercises
        const unitDetails = exercises.map((exercise) =>
          targetDescription(exercise, names, {
            unitCount: exercise.sets,
            unitKind: 'sets',
            overrides: exercise.overridesBySet,
          }),
        )
        const rest = [
          `descanso ${formatDuration(block.restBetweenSetsSeconds)}`,
          ...(block.restAfterSeconds ? [`descanso final ${formatDuration(block.restAfterSeconds)}`] : []),
        ]
        return {
          key: block.key,
          heading: `SS${supersetCount} · ${exercises.map((exercise) => exerciseLabel(exercise, names)).join(' + ')}`,
          details: [...unitDetails.filter(Boolean).map((detail) => detail), ...rest].join(' · '),
          items: [],
        }
      }

      const exercise = block.exercises[0]
      if (!exercise) return { key: block.key, items: [] }
      const rest = [
        `descanso ${formatDuration(block.restBetweenSetsSeconds)}`,
        ...(block.restAfterSeconds ? [`descanso final ${formatDuration(block.restAfterSeconds)}`] : []),
      ]
      return {
        key: block.key,
        items: [
          {
            ...createExerciseItem(exercise, names, {
              unitCount: exercise.sets,
              unitKind: 'sets',
              overrides: exercise.overridesBySet,
            }),
            details: [
              targetDescription(exercise, names, {
                unitCount: exercise.sets,
                unitKind: 'sets',
                overrides: exercise.overridesBySet,
              }),
              ...rest,
            ]
              .filter(Boolean)
              .join(' · '),
          },
        ],
      }
    }

    if (block.type === 'circuit') {
      circuitCount += 1
      if (block.mode === 'rounds') {
        return {
          key: block.key,
          heading: `Circuito ${circuitCount}`,
          details: [
            `${block.rounds} ${block.rounds === 1 ? 'ronda' : 'rondas'}`,
            ...(block.restBetweenRoundsSeconds
              ? [`descanso ${formatDuration(block.restBetweenRoundsSeconds)}`]
              : []),
          ].join(' · '),
          items: block.exercises.map((exercise) =>
            createExerciseItem(exercise, names, {
              unitCount: block.rounds,
              unitKind: 'rounds',
              overrides: exercise.overridesByRound,
            }),
          ),
        }
      }

      return {
        key: block.key,
        heading: 'AMRAP',
        details: `Hasta ${formatDuration(block.maxDurationSeconds)}`,
        items: block.exercises.map((exercise) => createExerciseItem(exercise, names)),
      }
    }

    intervalCount += 1
    return {
      key: block.key,
      heading: 'Intervalos',
      details: `${block.cycles} ${block.cycles === 1 ? 'ciclo' : 'ciclos'}`,
      items: block.phases.map((phase) => {
        const exercise = phase.exercise
        return {
          key: phase.key,
          label: exercise
            ? `${phase.type === 'work' ? 'Trabajo' : 'Recuperación activa'} · ${exerciseLabel(exercise, names)}`
            : 'Descanso',
          details: [
            formatDuration(phase.windowSeconds),
            ...(exercise ? [targetDescription(exercise, names)] : []),
          ].join(' · '),
        }
      }),
    }
  })

  return { blocks, supersetCount, circuitCount, intervalCount }
}

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

export function presentImportPlanSummary(
  plan: TrainingPlanDefinition,
  exerciseNames: ReadonlyMap<string, string>,
): ImportPlanSummary {
  const days = plan.days
    .filter((day): day is Extract<TrainingPlanDay, { type: 'session' }> => day.type === 'session')
    .sort((left, right) => left.date.localeCompare(right.date))
  const sessions = days.map((day) => {
    const { blocks, supersetCount, circuitCount, intervalCount } = blockSummaries(day, exerciseNames)
    const exercises = scheduledExercises(day)
    const activityCounts = [
      ...(supersetCount ? [countLabel(supersetCount, 'superserie')] : []),
      ...(circuitCount ? [countLabel(circuitCount, 'circuito')] : []),
      ...(intervalCount ? [countLabel(intervalCount, 'intervalo')] : []),
      countLabel(exercises, 'ejercicio'),
    ]
    return {
      key: day.key,
      date: shortSessionDate(day.date),
      counts: activityCounts,
      blocks,
    }
  })

  return {
    period: `${formatPlanDate(plan.startDate)} – ${formatPlanDate(plan.endDate)}`,
    sessionCount: sessions.length,
    scheduledExerciseCount: days.reduce((sum, day) => sum + scheduledExercises(day), 0),
    sessions,
  }
}
