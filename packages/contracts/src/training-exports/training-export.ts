import { z } from 'zod'
import {
  WorkoutExerciseSnapshotSchema,
  WorkoutExecutionSchema,
  WorkoutExecutionSnapshotSchema,
} from '../workout-executions/workout-execution.js'
import { WorkoutResultSchema } from '../workout-executions/workout-results.js'
import { PlanDateSchema, TrainingPlanDaySchema } from '../training-plans/training-plan.js'

const StableKeySchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const TimestampSchema = z.iso.datetime({ offset: true })

export const TrainingExportPeriodSchema = z
  .object({ from: PlanDateSchema, through: PlanDateSchema })
  .strict()
  .superRefine((period, context) => {
    if (period.from > period.through) {
      context.addIssue({
        code: 'custom',
        path: ['through'],
        message: 'Period end must not precede its start',
      })
    }
  })
export type TrainingExportPeriod = z.infer<typeof TrainingExportPeriodSchema>

export const TrainingExportExerciseSchema = WorkoutExerciseSnapshotSchema
export type TrainingExportExercise = z.infer<typeof TrainingExportExerciseSchema>

export const TrainingExportPlanSchema = z
  .object({
    planKey: StableKeySchema,
    name: z.string().trim().min(1),
    exercises: z.array(TrainingExportExerciseSchema),
    days: z.array(TrainingPlanDaySchema),
  })
  .strict()
export type TrainingExportPlan = z.infer<typeof TrainingExportPlanSchema>

export const TrainingExportExecutionSchema = z
  .object({
    executionId: z.uuid(),
    planKey: StableKeySchema,
    sessionKey: StableKeySchema,
    sessionDate: PlanDateSchema,
    startedAt: TimestampSchema,
    finishedAt: TimestampSchema,
    snapshot: WorkoutExecutionSnapshotSchema,
    results: z.array(WorkoutResultSchema),
  })
  .strict()
  .superRefine((execution, context) => {
    if (execution.snapshot.session.key !== execution.sessionKey) {
      context.addIssue({
        code: 'custom',
        path: ['sessionKey'],
        message: 'Session key must match the execution snapshot',
      })
    }
    if (execution.snapshot.session.date !== execution.sessionDate) {
      context.addIssue({
        code: 'custom',
        path: ['sessionDate'],
        message: 'Session date must match the execution snapshot',
      })
    }

    // Reuse the full execution validator to retain its result-to-snapshot and timing invariants.
    const parsed = WorkoutExecutionSchema.safeParse({
      id: execution.executionId,
      planKey: execution.planKey,
      sessionKey: execution.sessionKey,
      snapshot: execution.snapshot,
      status: 'completed',
      startedAt: execution.startedAt,
      finishedAt: execution.finishedAt,
      pauses: [],
      results: execution.results,
      corrections: [],
    })
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        context.addIssue({ code: 'custom', path: issue.path, message: issue.message })
      }
    }
  })
export type TrainingExportExecution = z.infer<typeof TrainingExportExecutionSchema>

export const TrainingExportV1Schema = z
  .object({
    format: z.literal('trakia.training-data'),
    version: z.literal(1),
    exportedAt: TimestampSchema,
    period: TrainingExportPeriodSchema,
    plans: z.array(TrainingExportPlanSchema),
    executions: z.array(TrainingExportExecutionSchema),
  })
  .strict()
  .superRefine((document, context) => {
    const plans = new Map<string, TrainingExportPlan>()
    document.plans.forEach((plan, planIndex) => {
      if (plans.has(plan.planKey)) {
        context.addIssue({
          code: 'custom',
          path: ['plans', planIndex, 'planKey'],
          message: 'Plan keys must be unique',
        })
      }
      plans.set(plan.planKey, plan)

      const exerciseKeys = new Set<string>()
      plan.exercises.forEach((exercise, exerciseIndex) => {
        if (exerciseKeys.has(exercise.key)) {
          context.addIssue({
            code: 'custom',
            path: ['plans', planIndex, 'exercises', exerciseIndex, 'key'],
            message: 'Exercise keys must be unique within a plan',
          })
        }
        exerciseKeys.add(exercise.key)
      })

      const dayKeys = new Set<string>()
      const restDates = new Set<string>()
      const sessionDates = new Set<string>()
      const plannedExerciseKeys = new Set<string>()
      plan.days.forEach((day, dayIndex) => {
        if (dayKeys.has(day.key)) {
          context.addIssue({
            code: 'custom',
            path: ['plans', planIndex, 'days', dayIndex, 'key'],
            message: 'Day keys must be unique within a plan',
          })
        }
        dayKeys.add(day.key)
        checkPeriod(day.date, document.period, context, ['plans', planIndex, 'days', dayIndex, 'date'])
        if (day.type === 'session') {
          if (restDates.has(day.date)) {
            context.addIssue({
              code: 'custom',
              path: ['plans', planIndex, 'days', dayIndex, 'date'],
              message: 'A rest day cannot share a date with sessions',
            })
          }
          sessionDates.add(day.date)
          for (const key of keysUsedBySession(day)) plannedExerciseKeys.add(key)
        } else {
          if (restDates.has(day.date)) {
            context.addIssue({
              code: 'custom',
              path: ['plans', planIndex, 'days', dayIndex, 'date'],
              message: 'Only one rest day is allowed per date',
            })
          }
          if (sessionDates.has(day.date)) {
            context.addIssue({
              code: 'custom',
              path: ['plans', planIndex, 'days', dayIndex, 'date'],
              message: 'A rest day cannot share a date with sessions',
            })
          }
          restDates.add(day.date)
        }
      })
      for (const key of plannedExerciseKeys) {
        if (!exerciseKeys.has(key)) {
          context.addIssue({
            code: 'custom',
            path: ['plans', planIndex, 'exercises'],
            message: `Missing exercise definition for ${key}`,
          })
        }
      }
    })

    const executionIds = new Set<string>()
    document.executions.forEach((execution, executionIndex) => {
      if (executionIds.has(execution.executionId)) {
        context.addIssue({
          code: 'custom',
          path: ['executions', executionIndex, 'executionId'],
          message: 'Execution IDs must be unique',
        })
      }
      executionIds.add(execution.executionId)
      checkPeriod(execution.sessionDate, document.period, context, [
        'executions',
        executionIndex,
        'sessionDate',
      ])

      const plan = plans.get(execution.planKey)
      if (!plan) {
        context.addIssue({
          code: 'custom',
          path: ['executions', executionIndex, 'planKey'],
          message: 'Execution references a plan outside this export',
        })
        return
      }
      const session = plan.days.find((day) => day.type === 'session' && day.key === execution.sessionKey)
      if (!session) {
        context.addIssue({
          code: 'custom',
          path: ['executions', executionIndex, 'sessionKey'],
          message: 'Execution references a session outside this export',
        })
      } else if (session.date !== execution.sessionDate) {
        context.addIssue({
          code: 'custom',
          path: ['executions', executionIndex, 'sessionDate'],
          message: 'Execution date must match its planned session',
        })
      }
      const exerciseKeys = new Set(plan.exercises.map(({ key }) => key))
      for (const exercise of execution.snapshot.exercises) {
        if (!exerciseKeys.has(exercise.key)) {
          context.addIssue({
            code: 'custom',
            path: ['executions', executionIndex, 'snapshot', 'exercises'],
            message: `Exercise ${exercise.key} is missing from its plan catalog`,
          })
        }
      }
    })
  })

export type TrainingExportV1 = z.infer<typeof TrainingExportV1Schema>

function checkPeriod(
  date: string,
  period: TrainingExportPeriod,
  context: z.RefinementCtx,
  path: Array<string | number>,
): void {
  if (date < period.from || date > period.through) {
    context.addIssue({ code: 'custom', path, message: 'Date must fall within the inclusive export period' })
  }
}

function keysUsedBySession(
  session: Extract<z.infer<typeof TrainingPlanDaySchema>, { type: 'session' }>,
): string[] {
  const keys: string[] = []
  for (const block of session.blocks) {
    const plannedExercises =
      block.type === 'intervals'
        ? block.phases.flatMap((phase) => (phase.exercise ? [phase.exercise] : []))
        : block.exercises
    for (const planned of plannedExercises) {
      keys.push(
        planned.exerciseKey,
        ...(planned.alternatives ?? []).map((alternative) => alternative.exerciseKey),
      )
    }
  }
  return keys
}
