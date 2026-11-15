import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import {
  TrainingPlanCalendarQuerySchema,
  TrainingPlanCalendarResponseSchema,
  TrainingPlanSessionDetailSchema,
  type TrainingPlanCalendarQuery,
  type TrainingPlanReadExercise,
} from '@trakia/contracts'
import { DataSource, type EntityManager } from 'typeorm'
import { ExerciseCatalogService, type ExerciseCatalogSummary } from '../exercises/exercises.module.js'

export class TrainingPlanSessionNotFoundError extends Error {
  constructor() {
    super('Training plan session not found.')
    this.name = 'TrainingPlanSessionNotFoundError'
  }
}

interface CalendarEntryRow {
  entryId: string
  planId: string
  origin: string
  planKey: string
  planName: string
  type: 'session' | 'rest'
  key: string
  date: string
}

interface SessionOwnerRow {
  planId: string
  origin: string
  planKey: string
  planName: string
  sessionId: string
  sessionKey: string
  date: string
}

interface BlockRow {
  id: string
  sessionId: string
  key: string
  position: number
  type: 'sets' | 'circuit' | 'intervals'
  mode: 'rounds' | 'amrap' | null
  count: number | null
  restSeconds: number | null
  settings: Record<string, unknown> | null
}

interface PhaseRow {
  id: string
  blockId: string
  key: string
  position: number
  type: 'work' | 'rest'
  windowSeconds: number
}

interface AppearanceRow {
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
}

interface LoadedSessions {
  blocks: BlockRow[]
  phases: PhaseRow[]
  appearances: AppearanceRow[]
  exercises: Map<string, ExerciseCatalogSummary>
  blocksBySession: Map<string, BlockRow[]>
  phasesByBlock: Map<string, PhaseRow[]>
  rootsByOwner: Map<string, AppearanceRow[]>
  alternativesByParent: Map<string, AppearanceRow[]>
}

@Injectable()
export class TrainingPlanReadService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly exercises: ExerciseCatalogService,
  ) {}

  async findCalendar(input: TrainingPlanCalendarQuery) {
    const query = TrainingPlanCalendarQuerySchema.parse(input)
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SET TRANSACTION READ ONLY')
      const hasImportedPlans = (await manager.query(
        'SELECT EXISTS (SELECT 1 FROM training_plans) AS "hasImportedPlans"',
      )) as Array<{ hasImportedPlans: boolean }>
      const entries = (await manager.query(
        `SELECT e.id AS "entryId", p.id AS "planId", p.origin, p.key AS "planKey", p.name AS "planName",
              e.type, e.key, to_char(e.date, 'YYYY-MM-DD') AS date
       FROM training_plan_entries e JOIN training_plans p ON p.id = e.plan_id
       WHERE e.date >= $1::date AND e.date <= $2::date
       ORDER BY e.date, p.origin COLLATE "C", p.key COLLATE "C", e.key COLLATE "C", e.id`,
        [query.from, query.to],
      )) as CalendarEntryRow[]

      const days = makeCalendarDays(query.from)
      const daysByDate = new Map(days.map((day) => [day.date, day]))
      const sessionIds = entries.filter((entry) => entry.type === 'session').map((entry) => entry.entryId)
      const loaded = await this.loadSessions(sessionIds, manager)

      for (const entry of entries) {
        const day = daysByDate.get(entry.date)
        if (!day) continue
        const plan = {
          planId: entry.planId,
          origin: entry.origin,
          planKey: entry.planKey,
          planName: entry.planName,
        }
        if (entry.type === 'rest') {
          day.entries.push({ type: 'rest', entryId: entry.entryId, key: entry.key, ...plan })
        } else {
          const sessionBlocks = (loaded.blocksBySession.get(entry.entryId) ?? []).map((block) =>
            mapCalendarBlock(block, loaded),
          )
          day.entries.push({
            type: 'session',
            sessionId: entry.entryId,
            sessionKey: entry.key,
            ...plan,
            blocks: sessionBlocks,
          })
        }
      }

      return TrainingPlanCalendarResponseSchema.parse({
        from: query.from,
        to: query.to,
        hasImportedPlans: hasImportedPlans[0]?.hasImportedPlans ?? false,
        days,
      })
    })
  }

  async findSession(planId: string, sessionId: string) {
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SET TRANSACTION READ ONLY')
      const owners = (await manager.query(
        `SELECT p.id AS "planId", p.origin, p.key AS "planKey", p.name AS "planName",
              e.id AS "sessionId", e.key AS "sessionKey", to_char(e.date, 'YYYY-MM-DD') AS date
       FROM training_plans p JOIN training_plan_entries e ON e.plan_id = p.id
       WHERE p.id = $1::uuid AND e.id = $2::uuid AND e.type = 'session'`,
        [planId, sessionId],
      )) as SessionOwnerRow[]
      const owner = owners[0]
      if (!owner) throw new TrainingPlanSessionNotFoundError()

      const loaded = await this.loadSessions([owner.sessionId], manager)
      const blocks = loaded.blocks.map((block) => mapReadBlock(block, loaded))
      return TrainingPlanSessionDetailSchema.parse({
        plan: {
          id: owner.planId,
          origin: owner.origin,
          key: owner.planKey,
          name: owner.planName,
        },
        session: { id: owner.sessionId, key: owner.sessionKey, date: owner.date, blocks },
      })
    })
  }

  private async loadSessions(sessionIds: string[], manager: EntityManager): Promise<LoadedSessions> {
    if (sessionIds.length === 0) return emptyLoadedSessions()

    const blocks = (await manager.query(
      `SELECT id, session_id AS "sessionId", key, position, type, mode, count,
              rest_seconds AS "restSeconds", settings
       FROM training_plan_blocks WHERE session_id = ANY($1::uuid[])
       ORDER BY session_id, position, id`,
      [sessionIds],
    )) as BlockRow[]
    const blockIds = blocks.map(({ id }) => id)
    if (blockIds.length === 0) return indexLoadedSessions(blocks, [], [], new Map())

    const [phases, appearances] = await Promise.all([
      manager.query(
        `SELECT id, block_id AS "blockId", key, position, type, window_seconds AS "windowSeconds"
         FROM training_plan_phases WHERE block_id = ANY($1::uuid[])
         ORDER BY block_id, position, id`,
        [blockIds],
      ) as Promise<PhaseRow[]>,
      manager.query(
        `SELECT id, block_id AS "blockId", phase_id AS "phaseId", key, position, role,
                parent_appearance_id AS "parentAppearanceId", exercise_id AS "exerciseId",
                exercise_key AS "exerciseKey", targets, target_overrides AS "targetOverrides", settings
         FROM training_plan_appearances WHERE block_id = ANY($1::uuid[])
         ORDER BY block_id, phase_id NULLS FIRST, position, id`,
        [blockIds],
      ) as Promise<AppearanceRow[]>,
    ])
    const exerciseIds = [...new Set((appearances as AppearanceRow[]).map(({ exerciseId }) => exerciseId))]
    const exerciseSummaries = await this.exercises.findSummariesByIds(exerciseIds, manager)
    return indexLoadedSessions(
      blocks,
      phases as PhaseRow[],
      appearances as AppearanceRow[],
      new Map(exerciseSummaries.map((exercise) => [exercise.id, exercise])),
    )
  }
}

function makeCalendarDays(from: string) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${from}T00:00:00.000Z`)
    date.setUTCDate(date.getUTCDate() + index)
    return { date: date.toISOString().slice(0, 10), entries: [] as unknown[] }
  })
}

function mapCalendarBlock(block: BlockRow, loaded: LoadedSessions): Record<string, unknown> {
  const roots = rootAppearances(loaded, block.id, null)
  if (block.type === 'sets') {
    return {
      type: 'sets',
      key: block.key,
      restBetweenSetsSeconds: block.restSeconds,
      ...(settingNumber(block.settings, 'restAfterSeconds') === undefined
        ? {}
        : { restAfterSeconds: settingNumber(block.settings, 'restAfterSeconds') }),
      exercises: roots.map((appearance) => ({
        key: appearance.key,
        exercise: readExercise(appearance, loaded.exercises),
        sets: settingNumber(appearance.settings, 'sets'),
      })),
    }
  }
  if (block.type === 'circuit') {
    const exercises = roots.map((appearance) => ({
      key: appearance.key,
      exercise: readExercise(appearance, loaded.exercises),
    }))
    if (block.mode === 'rounds')
      return {
        type: 'circuit',
        key: block.key,
        mode: 'rounds',
        rounds: block.count,
        ...(block.restSeconds === null ? {} : { restBetweenRoundsSeconds: block.restSeconds }),
        exercises,
      }
    return { type: 'circuit', key: block.key, mode: 'amrap', maxDurationSeconds: block.count, exercises }
  }

  return {
    type: 'intervals',
    key: block.key,
    cycles: block.count,
    phases: phasesForBlock(loaded, block.id).map((phase) => {
      const exercise = rootAppearances(loaded, block.id, phase.id)[0]
      return {
        type: phase.type,
        key: phase.key,
        windowSeconds: phase.windowSeconds,
        ...(exercise
          ? { exercise: { key: exercise.key, exercise: readExercise(exercise, loaded.exercises) } }
          : {}),
      }
    }),
  }
}

function mapReadBlock(block: BlockRow, loaded: LoadedSessions): Record<string, unknown> {
  const roots = rootAppearances(loaded, block.id, null)
  if (block.type === 'sets') {
    return {
      type: 'sets',
      key: block.key,
      exercises: roots.map((appearance) => ({
        ...mapReadPlannedExercise(appearance, loaded),
        sets: settingNumber(appearance.settings, 'sets'),
        ...settingArray(appearance.settings, 'overridesBySet'),
      })),
      restBetweenSetsSeconds: block.restSeconds,
      ...optionalSettingNumber(block.settings, 'restAfterSeconds'),
    }
  }
  if (block.type === 'circuit') {
    const exercises = roots.map((appearance) => ({
      ...mapReadPlannedExercise(appearance, loaded),
      ...(block.mode === 'rounds' ? settingArray(appearance.settings, 'overridesByRound') : {}),
    }))
    if (block.mode === 'rounds')
      return {
        type: 'circuit',
        key: block.key,
        mode: 'rounds',
        rounds: block.count,
        ...optionalBlockRest(block.restSeconds),
        exercises,
      }
    return { type: 'circuit', key: block.key, mode: 'amrap', maxDurationSeconds: block.count, exercises }
  }

  return {
    type: 'intervals',
    key: block.key,
    cycles: block.count,
    phases: phasesForBlock(loaded, block.id).map((phase) => {
      const exercise = rootAppearances(loaded, block.id, phase.id)[0]
      return {
        type: phase.type,
        key: phase.key,
        windowSeconds: phase.windowSeconds,
        ...(exercise ? { exercise: mapReadPlannedExercise(exercise, loaded) } : {}),
      }
    }),
  }
}

function rootAppearances(loaded: LoadedSessions, blockId: string, phaseId: string | null): AppearanceRow[] {
  return loaded.rootsByOwner.get(appearanceOwnerKey(blockId, phaseId)) ?? []
}

function mapReadPlannedExercise(appearance: AppearanceRow, loaded: LoadedSessions): Record<string, unknown> {
  const alternatives = loaded.alternativesByParent.get(appearance.id) ?? []
  const serializedAlternatives = alternatives.map((alternative) => ({
    key: alternative.key,
    exercise: readExercise(alternative, loaded.exercises),
    ...optionalJson(alternative.targetOverrides, 'targetOverrides'),
  }))

  return {
    key: appearance.key,
    exercise: readExercise(appearance, loaded.exercises),
    ...optionalJson(appearance.targets, 'targets'),
    ...(serializedAlternatives.length ? { alternatives: serializedAlternatives } : {}),
  }
}

function emptyLoadedSessions(): LoadedSessions {
  return indexLoadedSessions([], [], [], new Map())
}

function indexLoadedSessions(
  blocks: BlockRow[],
  phases: PhaseRow[],
  appearances: AppearanceRow[],
  exercises: Map<string, ExerciseCatalogSummary>,
): LoadedSessions {
  const blocksBySession = groupBy(blocks, ({ sessionId }) => sessionId)
  const phasesByBlock = groupBy(phases, ({ blockId }) => blockId)
  const rootsByOwner = new Map<string, AppearanceRow[]>()
  const alternativesByParent = new Map<string, AppearanceRow[]>()
  for (const appearance of appearances) {
    if (appearance.role === 'main') {
      appendGrouped(rootsByOwner, appearanceOwnerKey(appearance.blockId, appearance.phaseId), appearance)
    } else if (appearance.parentAppearanceId) {
      appendGrouped(alternativesByParent, appearance.parentAppearanceId, appearance)
    }
  }
  for (const grouped of [rootsByOwner, alternativesByParent]) {
    for (const values of grouped.values())
      values.sort((left, right) => left.position - right.position || compareOrdinal(left.id, right.id))
  }
  return {
    blocks,
    phases,
    appearances,
    exercises,
    blocksBySession,
    phasesByBlock,
    rootsByOwner,
    alternativesByParent,
  }
}

function groupBy<T>(values: T[], keyOf: (value: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>()
  for (const value of values) appendGrouped(grouped, keyOf(value), value)
  return grouped
}

function appendGrouped<T>(grouped: Map<string, T[]>, key: string, value: T): void {
  const values = grouped.get(key)
  if (values) values.push(value)
  else grouped.set(key, [value])
}

function phasesForBlock(loaded: LoadedSessions, blockId: string): PhaseRow[] {
  return loaded.phasesByBlock.get(blockId) ?? []
}

function appearanceOwnerKey(blockId: string, phaseId: string | null): string {
  return `${blockId}:${phaseId ?? 'block'}`
}

function readExercise(
  appearance: AppearanceRow,
  summaries: Map<string, ExerciseCatalogSummary>,
): TrainingPlanReadExercise {
  const summary = summaries.get(appearance.exerciseId)
  const catalogKeys = summary?.catalogKeys ?? []
  const storedCatalogKey = appearance.exerciseKey
  const catalogKeyResolution = storedCatalogKey
    ? 'stored'
    : catalogKeys.length === 0
      ? 'unavailable'
      : catalogKeys.length === 1
        ? 'unique'
        : 'ambiguous'

  return {
    id: appearance.exerciseId,
    name: summary?.name ?? null,
    supportedMetrics: summary?.supportedMetrics ?? null,
    catalogKeys,
    storedCatalogKey,
    catalogKeyResolution,
  }
}

function optionalJson(value: Record<string, unknown> | null, key: string): Record<string, unknown> {
  return value === null ? {} : { [key]: value }
}

function settingNumber(settings: Record<string, unknown> | null, key: string): number | undefined {
  const value = settings?.[key]
  return typeof value === 'number' ? value : undefined
}

function optionalSettingNumber(settings: Record<string, unknown> | null, key: string) {
  const value = settingNumber(settings, key)
  return value === undefined ? {} : { [key]: value }
}

function settingArray(settings: Record<string, unknown> | null, key: string) {
  const value = settings?.[key]
  return value === null || value === undefined ? {} : { [key]: value }
}

function optionalBlockRest(value: number | null) {
  return value === null ? {} : { restBetweenRoundsSeconds: value }
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
