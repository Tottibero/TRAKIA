import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import {
  PlannedSessionSchema,
  TrainingPlanDefinitionSchema,
  type PlannedBlock,
  type TrainingPlanDefinition,
  type PlannedSession,
} from '@trakia/contracts'
import { DataSource, EntityManager, QueryFailedError } from 'typeorm'
import { ExerciseCatalogService } from '../exercises/exercises.module.js'

export class TrainingPlanVersionConflictError extends Error {
  readonly code = 'TRAINING_PLAN_VERSION_CONFLICT'
  constructor() {
    super('The training plan has changed; reload it before applying this update.')
    this.name = 'TrainingPlanVersionConflictError'
  }
}

export class TrainingPlanKeyConflictError extends Error {
  readonly code = 'TRAINING_PLAN_KEY_CONFLICT'
  constructor(readonly key: string) {
    super(`Training plan key "${key}" is already assigned in the shared plan-key space.`)
    this.name = 'TrainingPlanKeyConflictError'
  }
}

export interface PersistedTrainingPlan {
  id: string
  origin: string
  key: string
  version: number
}

export interface TrainingPlanImportSnapshot {
  id: string
  version: number
  definition: TrainingPlanDefinition
  unresolvedExerciseReferences: string[]
}

export interface TrainingPlanExecutionSession {
  planKey: string
  sessionKey: string
  session: PlannedSession
}

@Injectable()
export class TrainingPlanService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly exercises: ExerciseCatalogService,
  ) {}

  async create(origin: string, input: TrainingPlanDefinition): Promise<PersistedTrainingPlan> {
    const plan = TrainingPlanDefinitionSchema.parse(input)
    validateOrigin(origin)
    try {
      return await this.dataSource.transaction((manager) => this.createForImport(origin, plan, manager))
    } catch (error) {
      if (isPlanKeyConflict(error)) throw new TrainingPlanKeyConflictError(plan.key)
      throw error
    }
  }

  /** Read-only projection used by import review; returns no persistence entities. */
  async findForImport(
    origin: string,
    key: string,
    manager?: EntityManager,
  ): Promise<TrainingPlanImportSnapshot | null> {
    const query = (sql: string, parameters: unknown[] = []) =>
      manager ? manager.query(sql, parameters) : this.dataSource.query(sql, parameters)
    const plans = await query(
      `SELECT id, version, name, description, to_char(start_date, 'YYYY-MM-DD') AS "startDate",
              to_char(end_date, 'YYYY-MM-DD') AS "endDate"
       FROM training_plans WHERE origin = $1 AND key = $2`,
      [origin, key],
    )
    const plan = plans[0] as
      | {
          id: string
          version: number
          name: string
          description: string | null
          startDate: string
          endDate: string
        }
      | undefined
    if (!plan) return null

    const entries = (await query(
      `SELECT id, type, key, to_char(date, 'YYYY-MM-DD') AS date
       FROM training_plan_entries WHERE plan_id = $1 ORDER BY date, key`,
      [plan.id],
    )) as Array<{ id: string; type: 'session' | 'rest'; key: string; date: string }>
    const days = new Map<string, Record<string, unknown>>()
    for (const entry of entries) {
      const day: Record<string, unknown> = { type: entry.type, key: entry.key, date: entry.date }
      if (entry.type === 'session') day.blocks = []
      days.set(entry.id, day)
    }
    const blocks = (await query(
      `SELECT b.id, b.session_id AS "sessionId", b.key, b.position, b.type, b.mode, b.count,
              b.rest_seconds AS "restSeconds", b.settings
       FROM training_plan_blocks b JOIN training_plan_entries e ON e.id = b.session_id
       WHERE e.plan_id = $1 ORDER BY e.date, b.position`,
      [plan.id],
    )) as Array<{
      id: string
      sessionId: string
      key: string
      position: number
      type: 'sets' | 'circuit' | 'intervals'
      mode: 'rounds' | 'amrap' | null
      count: number | null
      restSeconds: number | null
      settings: Record<string, unknown> | null
    }>
    const blockValues = new Map<string, Record<string, unknown>>()
    for (const block of blocks) {
      const value: Record<string, unknown> = { type: block.type, key: block.key }
      if (block.type === 'sets') {
        value.exercises = []
        value.restBetweenSetsSeconds = block.restSeconds
        if (block.settings?.restAfterSeconds !== undefined)
          value.restAfterSeconds = block.settings.restAfterSeconds
      } else if (block.type === 'circuit') {
        value.mode = block.mode
        value.exercises = []
        if (block.mode === 'rounds') {
          value.rounds = block.count
          if (block.restSeconds !== null) value.restBetweenRoundsSeconds = block.restSeconds
        } else value.maxDurationSeconds = block.count
      } else {
        value.cycles = block.count
        value.phases = []
      }
      blockValues.set(block.id, value)
      const owner = days.get(block.sessionId)
      if (owner) (owner.blocks as unknown[]).push(value)
    }
    const phases = (await query(
      `SELECT p.id, p.block_id AS "blockId", p.key, p.position, p.type, p.window_seconds AS "windowSeconds"
       FROM training_plan_phases p JOIN training_plan_blocks b ON b.id = p.block_id
       JOIN training_plan_entries e ON e.id = b.session_id WHERE e.plan_id = $1 ORDER BY p.position`,
      [plan.id],
    )) as Array<{
      id: string
      blockId: string
      key: string
      position: number
      type: 'work' | 'rest'
      windowSeconds: number
    }>
    const phaseValues = new Map<string, Record<string, unknown>>()
    for (const phase of phases) {
      const value: Record<string, unknown> = {
        type: phase.type,
        key: phase.key,
        windowSeconds: phase.windowSeconds,
      }
      phaseValues.set(phase.id, value)
      const owner = blockValues.get(phase.blockId)
      if (owner) (owner.phases as unknown[]).push(value)
    }
    const appearances = (await query(
      `SELECT a.id, a.block_id AS "blockId", a.phase_id AS "phaseId", a.key, a.position,
              a.role, a.parent_appearance_id AS "parentAppearanceId", a.exercise_id AS "exerciseId",
              a.exercise_key AS "exerciseKey", a.targets, a.target_overrides AS "targetOverrides", a.settings
       FROM training_plan_appearances a JOIN training_plan_blocks b ON b.id = a.block_id
       JOIN training_plan_entries e ON e.id = b.session_id WHERE e.plan_id = $1
       ORDER BY a.position, a.key`,
      [plan.id],
    )) as Array<{
      id: string
      blockId: string
      phaseId: string | null
      key: string
      position: number
      role: 'main' | 'alternative'
      parentAppearanceId: string | null
      exerciseId: string
      exerciseKey: string | null
      targets: Record<string, number> | null
      targetOverrides: Record<string, number | null> | null
      settings: Record<string, unknown> | null
    }>
    const exercises = await this.exercises.findSummariesByIds(
      [...new Set(appearances.map(({ exerciseId }) => exerciseId))],
      manager,
    )
    const exerciseKeys = new Map(exercises.map(({ id, catalogKeys }) => [id, catalogKeys]))
    const unresolvedExerciseReferences: string[] = []
    const appearanceValues = new Map<string, Record<string, unknown>>()
    for (const appearance of appearances) {
      const availableKeys = exerciseKeys.get(appearance.exerciseId) ?? []
      const exerciseKey = appearance.exerciseKey ?? (availableKeys.length === 1 ? availableKeys[0] : null)
      if (appearance.exerciseKey === null && availableKeys.length > 1)
        unresolvedExerciseReferences.push(appearance.key)
      const value: Record<string, unknown> = {
        key: appearance.key,
        exerciseKey: exerciseKey ?? `unresolved-${appearance.key}`,
      }
      if (appearance.targets) value.targets = appearance.targets
      if (appearance.targetOverrides) value.targetOverrides = appearance.targetOverrides
      if (appearance.settings)
        for (const [setting, settingValue] of Object.entries(appearance.settings))
          if (settingValue !== null && settingValue !== undefined) value[setting] = settingValue
      if (appearance.role === 'main') value.alternatives = []
      appearanceValues.set(appearance.id, value)
      if (appearance.role === 'alternative') {
        const parent = appearanceValues.get(appearance.parentAppearanceId ?? '')
        if (parent) (parent.alternatives as unknown[]).push(value)
      } else if (appearance.phaseId) {
        const phase = phaseValues.get(appearance.phaseId)
        if (phase) phase.exercise = value
      } else {
        const owner = blockValues.get(appearance.blockId)
        if (owner) (owner.exercises as unknown[]).push(value)
      }
    }
    const definition = TrainingPlanDefinitionSchema.parse({
      key,
      name: plan.name,
      ...(plan.description === null ? {} : { description: plan.description }),
      startDate: plan.startDate,
      endDate: plan.endDate,
      days: [...days.values()],
    })
    return { id: plan.id, version: plan.version, definition, unresolvedExerciseReferences }
  }

  /** Public planning capability used to start an execution from the authoritative persisted session. */
  async findExecutionSession(
    planId: string,
    sessionId: string,
    manager?: EntityManager,
  ): Promise<TrainingPlanExecutionSession | null> {
    const query = manager ? manager.query.bind(manager) : this.dataSource.query.bind(this.dataSource)
    const owners = (await query(
      `SELECT p.key AS "planKey", p.origin, e.key AS "sessionKey"
       FROM training_plans p JOIN training_plan_entries e ON e.plan_id = p.id
       WHERE p.id = $1::uuid AND e.id = $2::uuid AND e.type = 'session'`,
      [planId, sessionId],
    )) as Array<{ planKey: string; origin: string; sessionKey: string }>
    const owner = owners[0]
    if (!owner) return null

    const plan = await this.findForImport(owner.origin, owner.planKey, manager)
    const session = plan?.definition.days.find(
      (day) => day.type === 'session' && day.key === owner.sessionKey,
    )
    if (!session || session.type !== 'session') return null
    return {
      planKey: owner.planKey,
      sessionKey: owner.sessionKey,
      session: PlannedSessionSchema.parse(session),
    }
  }

  async update(
    origin: string,
    key: string,
    expectedVersion: number,
    input: TrainingPlanDefinition,
  ): Promise<PersistedTrainingPlan> {
    const plan = TrainingPlanDefinitionSchema.parse(input)
    validateOrigin(origin)
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
      throw new RangeError('expectedVersion must be a positive integer.')
    if (plan.key !== key) throw new Error('A plan key cannot change during an update.')
    return this.dataSource.transaction(async (manager) => {
      return this.updateForImport(origin, key, expectedVersion, plan, manager)
    })
  }

  /** Apply a newly reviewed plan using the caller's transaction. */
  async createForImport(
    origin: string,
    input: TrainingPlanDefinition,
    manager: EntityManager,
  ): Promise<PersistedTrainingPlan> {
    const plan = TrainingPlanDefinitionSchema.parse(input)
    validateOrigin(origin)
    const exerciseIds = await this.resolveExercises(plan, manager)
    try {
      const stored = firstRow(
        await manager.query(
          `INSERT INTO training_plans (origin, key, name, description, start_date, end_date, version)
           VALUES ($1, $2, $3, $4, $5::date, $6::date, 1) RETURNING id, origin, key, version`,
          [origin, plan.key, plan.name, plan.description ?? null, plan.startDate, plan.endDate],
        ),
      )
      await this.writeEntries(manager, String(stored.id), plan, exerciseIds)
      return stored as unknown as PersistedTrainingPlan
    } catch (error) {
      if (isPlanKeyConflict(error)) throw new TrainingPlanKeyConflictError(plan.key)
      throw error
    }
  }

  /** Apply a reviewed plan with optimistic version checking in the caller's transaction. */
  async updateForImport(
    origin: string,
    key: string,
    expectedVersion: number,
    input: TrainingPlanDefinition,
    manager: EntityManager,
  ): Promise<PersistedTrainingPlan> {
    const plan = TrainingPlanDefinitionSchema.parse(input)
    validateOrigin(origin)
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
      throw new RangeError('expectedVersion must be a positive integer.')
    if (plan.key !== key) throw new Error('A plan key cannot change during an update.')
    const exerciseIds = await this.resolveExercises(plan, manager)
    const result = await manager.query(
      `UPDATE training_plans SET name = $1, description = $2, start_date = $3::date,
         end_date = $4::date, version = version + 1
       WHERE origin = $5 AND key = $6 AND version = $7
       RETURNING id, origin, key, version`,
      [plan.name, plan.description ?? null, plan.startDate, plan.endDate, origin, key, expectedVersion],
    )
    const stored = Array.isArray(result[0]) ? result[0][0] : result[0]
    if (!stored) throw new TrainingPlanVersionConflictError()
    await this.writeEntries(manager, String(stored.id), plan, exerciseIds)
    await this.pruneObsolete(manager, String(stored.id), plan)
    return stored as PersistedTrainingPlan
  }

  private async resolveExercises(
    plan: TrainingPlanDefinition,
    manager?: EntityManager,
  ): Promise<Map<string, string>> {
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
    const ids = new Map<string, string>()
    await Promise.all(
      [...keys].map(async (key) => {
        const exercise = await this.exercises.findByKey(key, manager)
        if (!exercise) throw new Error(`Unknown exercise catalog key: ${key}`)
        ids.set(key, exercise.id)
      }),
    )
    return ids
  }

  private async writeEntries(
    manager: EntityManager,
    planId: string,
    plan: TrainingPlanDefinition,
    exerciseIds: Map<string, string>,
  ): Promise<void> {
    await manager.query(
      `UPDATE training_plan_entries SET date = DATE '5000000-01-01' + ranked.offset
       FROM (SELECT id, row_number() OVER (ORDER BY id)::integer AS offset FROM training_plan_entries
             WHERE plan_id = $1 AND type = 'rest') ranked WHERE training_plan_entries.id = ranked.id`,
      [planId],
    )
    await manager.query(
      `UPDATE training_plan_blocks SET position = position + 100000000
       WHERE session_id IN (SELECT id FROM training_plan_entries WHERE plan_id = $1)`,
      [planId],
    )
    await manager.query(
      `UPDATE training_plan_phases SET position = position + 100000000
       WHERE block_id IN (SELECT b.id FROM training_plan_blocks b JOIN training_plan_entries e ON e.id = b.session_id WHERE e.plan_id = $1)`,
      [planId],
    )
    await manager.query(
      `UPDATE training_plan_appearances SET position = position + 100000000
       WHERE block_id IN (SELECT b.id FROM training_plan_blocks b JOIN training_plan_entries e ON e.id = b.session_id WHERE e.plan_id = $1)`,
      [planId],
    )
    for (const day of plan.days) {
      const entry = firstRow(
        await manager.query(
          `INSERT INTO training_plan_entries (plan_id, type, key, date)
         VALUES ($1, $2, $3, $4::date)
         ON CONFLICT (plan_id, key) DO UPDATE SET type = EXCLUDED.type, date = EXCLUDED.date RETURNING id`,
          [planId, day.type, day.key, day.date],
        ),
      )
      if (day.type === 'session') {
        for (const [position, block] of day.blocks.entries()) {
          const type = block.type
          const mode = type === 'circuit' ? block.mode : null
          const count =
            type === 'sets'
              ? null
              : type === 'circuit'
                ? block.mode === 'rounds'
                  ? block.rounds
                  : block.maxDurationSeconds
                : block.cycles
          const restSeconds =
            type === 'sets'
              ? block.restBetweenSetsSeconds
              : type === 'circuit' && block.mode === 'rounds'
                ? (block.restBetweenRoundsSeconds ?? null)
                : null
          const settings =
            type === 'sets'
              ? block.restAfterSeconds === undefined
                ? null
                : { restAfterSeconds: block.restAfterSeconds }
              : type === 'circuit' && block.mode === 'amrap'
                ? null
                : null
          const savedBlock = firstRow(
            await manager.query(
              `INSERT INTO training_plan_blocks (session_id, key, position, type, mode, count, rest_seconds, settings)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
             ON CONFLICT (session_id, key) DO UPDATE SET position = EXCLUDED.position, type = EXCLUDED.type,
               mode = EXCLUDED.mode, count = EXCLUDED.count, rest_seconds = EXCLUDED.rest_seconds, settings = EXCLUDED.settings
             RETURNING id`,
              [entry.id, block.key, position, type, mode, count, restSeconds, json(settings)],
            ),
          )
          if (block.type === 'intervals') {
            for (const [phasePosition, phase] of block.phases.entries()) {
              const savedPhase = firstRow(
                await manager.query(
                  `INSERT INTO training_plan_phases (block_id, key, position, type, window_seconds)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (block_id, key) DO UPDATE SET position = EXCLUDED.position,
                   type = EXCLUDED.type, window_seconds = EXCLUDED.window_seconds RETURNING id`,
                  [savedBlock.id, phase.key, phasePosition, phase.type, phase.windowSeconds],
                ),
              )
              if (phase.exercise)
                await this.writePlannedExercise(
                  manager,
                  String(savedBlock.id),
                  String(savedPhase.id),
                  phase.exercise,
                  exerciseIds,
                  { position: 0 },
                )
            }
          } else {
            for (const [exercisePosition, exercise] of block.exercises.entries()) {
              const settings =
                block.type === 'sets'
                  ? {
                      sets: 'sets' in exercise ? exercise.sets : undefined,
                      overridesBySet: 'overridesBySet' in exercise ? (exercise.overridesBySet ?? null) : null,
                    }
                  : {
                      overridesByRound:
                        'overridesByRound' in exercise ? (exercise.overridesByRound ?? null) : null,
                    }
              await this.writePlannedExercise(manager, String(savedBlock.id), null, exercise, exerciseIds, {
                position: exercisePosition,
                settings,
              })
            }
          }
        }
      }
    }
  }

  private async writePlannedExercise(
    manager: EntityManager,
    blockId: string,
    phaseId: string | null,
    planned: {
      key: string
      exerciseKey: string
      targets?: Record<string, number>
      alternatives?: Array<{
        key: string
        exerciseKey: string
        targetOverrides?: Record<string, number | null>
      }>
    },
    exerciseIds: Map<string, string>,
    options: { position: number; settings?: Record<string, unknown> },
  ): Promise<void> {
    const main = firstRow(
      await manager.query(
        `INSERT INTO training_plan_appearances
       (block_id, phase_id, key, position, role, exercise_id, exercise_key, targets, settings)
       VALUES ($1, $2, $3, $4, 'main', $5, $6, $7::jsonb, $8::jsonb)
       ON CONFLICT (block_id, key) DO UPDATE SET phase_id = EXCLUDED.phase_id, position = EXCLUDED.position,
         role = 'main', parent_appearance_id = NULL, exercise_id = EXCLUDED.exercise_id,
         exercise_key = EXCLUDED.exercise_key, targets = EXCLUDED.targets, target_overrides = NULL,
         settings = EXCLUDED.settings RETURNING id`,
        [
          blockId,
          phaseId,
          planned.key,
          options.position * 4,
          exerciseIds.get(planned.exerciseKey),
          planned.exerciseKey,
          json(planned.targets),
          json(options.settings),
        ],
      ),
    )
    for (const [index, alternative] of (planned.alternatives ?? []).entries()) {
      await manager.query(
        `INSERT INTO training_plan_appearances
         (block_id, phase_id, key, position, role, parent_appearance_id, exercise_id, exercise_key, target_overrides)
         VALUES ($1, $2, $3, $4, 'alternative', $5, $6, $7, $8::jsonb)
         ON CONFLICT (block_id, key) DO UPDATE SET phase_id = EXCLUDED.phase_id, position = EXCLUDED.position,
           role = 'alternative', parent_appearance_id = EXCLUDED.parent_appearance_id,
         exercise_id = EXCLUDED.exercise_id, exercise_key = EXCLUDED.exercise_key,
         targets = NULL, target_overrides = EXCLUDED.target_overrides,
           settings = NULL`,
        [
          blockId,
          phaseId,
          alternative.key,
          options.position * 4 + index + 1,
          String(main.id),
          exerciseIds.get(alternative.exerciseKey),
          alternative.exerciseKey,
          json(alternative.targetOverrides),
        ],
      )
    }
  }

  private async pruneObsolete(
    manager: EntityManager,
    planId: string,
    plan: TrainingPlanDefinition,
  ): Promise<void> {
    const expectedEntries = new Map(plan.days.map((day) => [day.key, day]))
    const entries: Array<{ id: string; key: string; type: string }> = await manager.query(
      'SELECT id, key, type FROM training_plan_entries WHERE plan_id = $1',
      [planId],
    )
    for (const entry of entries) {
      const expectedDay = expectedEntries.get(entry.key)
      if (!expectedDay || expectedDay.type === 'rest') {
        await this.deleteEntryContents(manager, entry.id)
        if (!expectedDay) await manager.query('DELETE FROM training_plan_entries WHERE id = $1', [entry.id])
        continue
      }
      const expectedBlocks = new Map(expectedDay.blocks.map((block) => [block.key, block]))
      const blocks: Array<{ id: string; key: string }> = await manager.query(
        'SELECT id, key FROM training_plan_blocks WHERE session_id = $1',
        [entry.id],
      )
      for (const block of blocks) {
        const expectedBlock = expectedBlocks.get(block.key)
        if (!expectedBlock) {
          await this.deleteBlockContents(manager, block.id)
          await manager.query('DELETE FROM training_plan_blocks WHERE id = $1', [block.id])
          continue
        }
        const expectedAppearanceKeys = appearanceKeys(expectedBlock)
        const appearances: Array<{ id: string; key: string; role: string }> = await manager.query(
          'SELECT id, key, role FROM training_plan_appearances WHERE block_id = $1',
          [block.id],
        )
        const removedAppearances = appearances.filter(({ key }) => !expectedAppearanceKeys.has(key))
        for (const appearance of removedAppearances.filter(({ role }) => role === 'alternative'))
          await manager.query('DELETE FROM training_plan_appearances WHERE id = $1', [appearance.id])
        for (const appearance of removedAppearances.filter(({ role }) => role === 'main'))
          await manager.query('DELETE FROM training_plan_appearances WHERE id = $1', [appearance.id])
        const expectedPhases = new Set(
          expectedBlock.type === 'intervals' ? expectedBlock.phases.map(({ key }) => key) : [],
        )
        const phases: Array<{ id: string; key: string }> = await manager.query(
          'SELECT id, key FROM training_plan_phases WHERE block_id = $1',
          [block.id],
        )
        for (const phase of phases) {
          if (expectedPhases.has(phase.key)) continue
          await manager.query('DELETE FROM training_plan_appearances WHERE phase_id = $1 AND role = $2', [
            phase.id,
            'alternative',
          ])
          await manager.query('DELETE FROM training_plan_appearances WHERE phase_id = $1 AND role = $2', [
            phase.id,
            'main',
          ])
          await manager.query('DELETE FROM training_plan_phases WHERE id = $1', [phase.id])
        }
      }
    }
  }

  private async deleteEntryContents(manager: EntityManager, entryId: string): Promise<void> {
    const blocks: Array<{ id: string }> = await manager.query(
      'SELECT id FROM training_plan_blocks WHERE session_id = $1',
      [entryId],
    )
    for (const { id } of blocks) {
      await this.deleteBlockContents(manager, id)
      await manager.query('DELETE FROM training_plan_blocks WHERE id = $1', [id])
    }
  }

  private async deleteBlockContents(manager: EntityManager, blockId: string): Promise<void> {
    await manager.query('DELETE FROM training_plan_appearances WHERE block_id = $1 AND role = $2', [
      blockId,
      'alternative',
    ])
    await manager.query('DELETE FROM training_plan_appearances WHERE block_id = $1 AND role = $2', [
      blockId,
      'main',
    ])
    await manager.query('DELETE FROM training_plan_phases WHERE block_id = $1', [blockId])
  }
}

function json(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value)
}

function firstRow(result: unknown): Record<string, string | number> {
  let rows = result
  while (Array.isArray(rows) && Array.isArray(rows[0])) rows = rows[0]
  if (!Array.isArray(rows) || !rows[0]) throw new Error('Expected PostgreSQL to return a row.')
  return rows[0] as Record<string, string | number>
}

function appearanceKeys(block: PlannedBlock): Set<string> {
  const keys = new Set<string>()
  const add = (exercise: { key: string; alternatives?: Array<{ key: string }> }) => {
    keys.add(exercise.key)
    for (const alternative of exercise.alternatives ?? []) keys.add(alternative.key)
  }
  if (block.type === 'intervals') {
    for (const phase of block.phases) if (phase.exercise) add(phase.exercise)
  } else {
    for (const exercise of block.exercises) add(exercise)
  }
  return keys
}

function validateOrigin(origin: string): void {
  if (!origin.trim() || origin !== origin.trim())
    throw new TypeError('origin must be a non-empty, trimmed value.')
}

function isPlanKeyConflict(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false
  const driverError = error.driverError as { code?: string; constraint?: string }
  return (
    driverError.code === '23505' &&
    ['uq_training_plans_key', 'uq_training_plans_origin_key'].includes(driverError.constraint ?? '')
  )
}
