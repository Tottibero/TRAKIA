import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import {
  TrainingPlanImportV1Schema,
  validateTrainingPlanImportDocument,
  type ImportValidationIssue,
  type ExerciseDefinition,
  type TrainingPlanDefinition,
} from '@trakia/contracts'
import { ExerciseCatalogService } from '../exercises/exercises.module.js'
import { TrainingPlanService } from '../training-plans/training-plans.module.js'
import { WorkoutExecutionProtectionService } from '../workouts/workouts.module.js'
import { mergeTrainingPlan, type MergeChange, type MergeConflict } from './merge-training-plan.js'
import { canonicalJson, ImportReviewReceiptService, sha256 } from './import-review-receipt.js'
import { DataSource, EntityManager } from 'typeorm'

export interface ImportReviewConflict {
  code: string
  resource: 'exercise' | 'plan' | 'session' | 'aggregate'
  key: string
  path: Array<string | number>
  message: string
}

export interface ImportReviewChange {
  kind: MergeChange['kind'] | 'exercise'
  key: string
  path: Array<string | number>
  status: 'created' | 'modified' | 'unchanged' | 'preserved' | 'conflict'
}

export interface TrainingPlanImportReview {
  valid: boolean
  confirmable: boolean
  issues: ImportValidationIssue[]
  plan?: { id: string | null; version: number | null; definition: TrainingPlanDefinition }
  changes: ImportReviewChange[]
  conflicts: ImportReviewConflict[]
  reviewToken?: string
  reviewExpiresAt?: string
}

@Injectable()
export class TrainingPlanImportReviewService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly exercises: ExerciseCatalogService,
    private readonly plans: TrainingPlanService,
    private readonly workouts: WorkoutExecutionProtectionService,
    private readonly receipts: ImportReviewReceiptService,
  ) {}

  async review(
    origin: string,
    input: unknown,
    userId: string,
    now: Date = new Date(),
  ): Promise<TrainingPlanImportReview> {
    if (!origin.trim() || origin !== origin.trim())
      throw new TypeError('origin must be non-empty and trimmed.')
    const validation = validateTrainingPlanImportDocument(input)
    if (!validation.success)
      return { valid: false, confirmable: false, issues: validation.issues, changes: [], conflicts: [] }

    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SET TRANSACTION READ ONLY')
      const result = await this.reviewValid(origin, validation.document, now, manager)
      if (result.confirmable && result.plan) {
        const expiresAt = new Date(now.getTime() + 15 * 60 * 1000)
        result.reviewToken = this.receipts.issue(
          {
            userId,
            origin,
            planKey: validation.document.plan.key,
            documentHash: sha256(canonicalJson(validation.document)),
            proposalHash: proposalHash(result),
            planVersion: result.plan.version,
          },
          now.getTime(),
        )
        result.reviewExpiresAt = expiresAt.toISOString()
      }
      return result
    })
  }

  async reviewInTransaction(
    origin: string,
    input: unknown,
    manager: EntityManager,
    now = new Date(),
  ): Promise<TrainingPlanImportReview> {
    if (!origin.trim() || origin !== origin.trim())
      throw new TypeError('origin must be non-empty and trimmed.')
    const validation = validateTrainingPlanImportDocument(input)
    if (!validation.success)
      return { valid: false, confirmable: false, issues: validation.issues, changes: [], conflicts: [] }
    return this.reviewValid(origin, validation.document, now, manager)
  }

  private async reviewValid(
    origin: string,
    document: import('@trakia/contracts').TrainingPlanImportV1,
    now: Date,
    manager: EntityManager,
  ): Promise<TrainingPlanImportReview> {
    const conflicts: ImportReviewConflict[] = []
    const changes: ImportReviewChange[] = []
    for (const definition of document.exercises) {
      const comparison = await this.exercises.compareDefinition(definition, manager)
      const status =
        comparison.status === 'missing' ? 'created' : comparison.status === 'same' ? 'unchanged' : 'conflict'
      changes.push({ kind: 'exercise', key: definition.key, path: ['exercises', definition.key], status })
      if (comparison.status === 'conflict')
        conflicts.push({
          code: 'EXERCISE_DEFINITION_CONFLICT',
          resource: 'exercise',
          key: definition.key,
          path: ['exercises', definition.key],
          message: `The persisted definition for exercise "${definition.key}" differs from the imported definition.`,
        })
    }

    const existing = await this.plans.findForImport(origin, document.plan.key, manager)
    if (existing?.unresolvedExerciseReferences.length)
      for (const key of existing.unresolvedExerciseReferences)
        conflicts.push({
          code: 'UNRESOLVED_PERSISTED_EXERCISE_KEY',
          resource: 'plan',
          key,
          path: ['plan', 'appearances', key, 'exerciseKey'],
          message: `The persisted plan uses an exercise with multiple catalog keys and its original key cannot be determined safely.`,
        })

    const merged = mergeTrainingPlan(existing?.definition ?? null, document.plan)
    changes.push(...merged.changes)
    for (const conflict of merged.conflicts) conflicts.push(this.mapMergeConflict(conflict))

    const exerciseDefinitions = new Map<string, ExerciseDefinition>(
      document.exercises.map((definition) => [definition.key, definition]),
    )
    for (const key of plannedExerciseKeys(merged.plan)) {
      if (exerciseDefinitions.has(key)) continue
      const persisted = await this.exercises.findByKey(key, manager)
      if (!persisted) {
        conflicts.push({
          code: 'EXERCISE_NOT_FOUND',
          resource: 'plan',
          key,
          path: ['plan', 'exerciseKey', key],
          message: `The combined plan references exercise "${key}" which is absent from the import and persisted catalog.`,
        })
        continue
      }
      exerciseDefinitions.set(key, toDefinition(key, persisted))
    }
    const aggregate = TrainingPlanImportV1Schema.safeParse({
      format: 'trakia.training-plan',
      version: 1,
      exercises: [...exerciseDefinitions.values()],
      plan: merged.plan,
    })
    if (!aggregate.success)
      for (const issue of aggregate.error.issues)
        conflicts.push({
          code: 'INVALID_COMBINED_PLAN',
          resource: 'aggregate',
          key: document.plan.key,
          path: issue.path as Array<string | number>,
          message: issue.message,
        })

    const today = madridDate(now)
    const periodChanged =
      !!existing &&
      (existing.definition.startDate !== merged.plan.startDate ||
        existing.definition.endDate !== merged.plan.endDate)
    const changedSessions: string[] = []
    const sessionKeys = new Set(
      document.plan.days.filter((day) => day.type === 'session').map(({ key }) => key),
    )
    if (periodChanged)
      for (const day of existing?.definition.days ?? []) if (day.type === 'session') sessionKeys.add(day.key)
    for (const key of sessionKeys) {
      const incomingDay = document.plan.days.find(({ key: incomingKey }) => incomingKey === key)
      const previousDay = existing?.definition.days.find(({ key: previousKey }) => previousKey === key)
      const nextDay = merged.plan.days.find(({ key: nextKey }) => nextKey === key)
      if (!previousDay && incomingDay?.type === 'session' && incomingDay.date < today) {
        conflicts.push({
          code: 'PAST_SESSION_PROTECTED',
          resource: 'session',
          key,
          path: ['plan', 'days', key, 'date'],
          message: 'Sessions dated before today in Europe/Madrid cannot be added or modified.',
        })
        continue
      }
      if (previousDay?.type !== 'session' || nextDay?.type !== 'session') continue
      const changed = periodChanged || !sameCanonical(previousDay, nextDay)
      if (!changed) continue
      changedSessions.push(key)
      if (previousDay.date < today || nextDay.date < today)
        conflicts.push({
          code: 'PAST_SESSION_PROTECTED',
          resource: 'session',
          key,
          path: ['plan', 'days', key],
          message: 'A past session cannot be modified or moved.',
        })
    }
    if (existing && changedSessions.length) {
      const protectedKeys = await this.workouts.findProtectedSessionKeys(
        existing.definition.key,
        changedSessions,
        manager,
      )
      for (const key of protectedKeys)
        conflicts.push({
          code: 'SESSION_EXECUTION_PROTECTED',
          resource: 'session',
          key,
          path: ['plan', 'days', key],
          message: 'A session with an initiated or completed execution cannot be modified.',
        })
    }

    markConflictedChanges(changes, conflicts)

    return {
      valid: true,
      confirmable: conflicts.length === 0,
      issues: [],
      plan: { id: existing?.id ?? null, version: existing?.version ?? null, definition: merged.plan },
      changes,
      conflicts,
    }
  }

  private mapMergeConflict(conflict: MergeConflict): ImportReviewConflict {
    return {
      code: conflict.code,
      resource: 'plan',
      key: conflict.key,
      path: conflict.path,
      message: conflict.message,
    }
  }
}

export function proposalHash(review: TrainingPlanImportReview): string {
  return sha256(canonicalJson({ plan: review.plan, changes: review.changes, conflicts: review.conflicts }))
}

function plannedExerciseKeys(plan: TrainingPlanDefinition): Set<string> {
  const keys = new Set<string>()
  for (const day of plan.days) {
    if (day.type !== 'session') continue
    for (const block of day.blocks) {
      const planned =
        block.type === 'intervals'
          ? block.phases.flatMap((phase) => (phase.exercise ? [phase.exercise] : []))
          : block.exercises
      for (const exercise of planned) {
        keys.add(exercise.exerciseKey)
        for (const alternative of exercise.alternatives ?? []) keys.add(alternative.exerciseKey)
      }
    }
  }
  return keys
}

function toDefinition(
  key: string,
  exercise: NonNullable<Awaited<ReturnType<ExerciseCatalogService['findByKey']>>>,
): ExerciseDefinition {
  return {
    key,
    name: exercise.name,
    ...(exercise.description === undefined ? {} : { description: exercise.description }),
    category: exercise.category,
    supportedMetrics: exercise.supportedMetrics,
    ...(exercise.externalReferences === undefined ? {} : { externalReferences: exercise.externalReferences }),
  }
}

function madridDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return JSON.stringify(sortValue(left)) === JSON.stringify(sortValue(right))
}

function markConflictedChanges(changes: ImportReviewChange[], conflicts: ImportReviewConflict[]): void {
  for (const conflict of conflicts) {
    const candidates = changes
      .filter((change) => isPathPrefix(change.path, conflict.path))
      .sort((left, right) => right.path.length - left.path.length)
    const affected =
      candidates[0] ?? changes.find((change) => change.kind === 'plan' && change.key === conflict.key)
    if (affected) affected.status = 'conflict'
  }
}

function isPathPrefix(prefix: Array<string | number>, path: Array<string | number>): boolean {
  return prefix.length <= path.length && prefix.every((segment, index) => segment === path[index])
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (typeof value === 'object' && value !== null)
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortValue(item)]),
    )
  return value
}
