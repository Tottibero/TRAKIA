import { Injectable } from '@nestjs/common'
import {
  WorkoutExecutionSnapshotSchema,
  type WorkoutExecution,
  type WorkoutExecutionSnapshot,
  type WorkoutExecutionStartRequest,
  type WorkoutExecutionStartResponse,
  type WorkoutExecutionOpenResponse,
  type PlannedBlock,
  type PlannedExercise,
  type PlannedSession,
} from '@trakia/contracts'
import { randomUUID } from 'node:crypto'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { DataSource, EntityManager, QueryFailedError, Repository } from 'typeorm'
import { ExerciseCatalogService } from '../exercises/exercises.module.js'
import { TrainingPlanService } from '../training-plans/training-plans.module.js'
import { WorkoutExecutionRecord } from './workout-execution.entity.js'
import { WorkoutExecutionProtectionService } from './workout-execution-protection.service.js'

export class WorkoutExecutionSessionNotFoundError extends Error {
  constructor() {
    super('The planned workout session could not be found.')
    this.name = 'WorkoutExecutionSessionNotFoundError'
  }
}

export class WorkoutExecutionSessionProtectedError extends Error {
  constructor() {
    super('The planned workout session already has a protected execution.')
    this.name = 'WorkoutExecutionSessionProtectedError'
  }
}

export class WorkoutExecutionSessionChangedError extends Error {
  constructor() {
    super('The planned session changed while the execution was being reserved.')
    this.name = 'WorkoutExecutionSessionChangedError'
  }
}

export class WorkoutExecutionSnapshotInvalidError extends Error {
  constructor() {
    super('The planned session references exercises that cannot be resolved from the catalog.')
    this.name = 'WorkoutExecutionSnapshotInvalidError'
  }
}

export class WorkoutExecutionOpenExistsError extends Error {
  constructor() {
    super('This account already has an open workout execution on this device.')
    this.name = 'WorkoutExecutionOpenExistsError'
  }
}

export class WorkoutExecutionDeviceMismatchError extends Error {
  constructor() {
    super('The open execution belongs to another device.')
    this.name = 'WorkoutExecutionDeviceMismatchError'
  }
}

export class WorkoutExecutionRequestConflictError extends Error {
  constructor() {
    super('The requestId was already used with different start details.')
    this.name = 'WorkoutExecutionRequestConflictError'
  }
}

@Injectable()
export class WorkoutExecutionStartService {
  constructor(
    @InjectRepository(WorkoutExecutionRecord) private readonly executions: Repository<WorkoutExecutionRecord>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly protection: WorkoutExecutionProtectionService,
    private readonly plans: TrainingPlanService,
    private readonly exercises: ExerciseCatalogService,
  ) {}

  async start(userId: string, input: WorkoutExecutionStartRequest): Promise<WorkoutExecutionStartResponse> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(WorkoutExecutionRecord)
        let existing = await repository.findOneBy({ userId, requestId: input.requestId })
        if (existing) return this.resolveReplay(existing, input)

        const initialSession = await this.plans.findExecutionSession(input.planId, input.sessionId, manager)
        if (!initialSession) throw new WorkoutExecutionSessionNotFoundError()

        // Lock order is account, then shared plan/session. Imports acquire only the latter.
        // The account lock serializes starts across devices; the partial unique index is the final guard.
        await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
          `trakia:workouts:account:${userId}`,
        ])
        await this.protection.acquireSessionLocks(manager, initialSession.planKey, [
          initialSession.sessionKey,
        ])

        existing = await repository.findOneBy({ userId, requestId: input.requestId })
        if (existing) return this.resolveReplay(existing, input)

        const session = await this.plans.findExecutionSession(input.planId, input.sessionId, manager)
        if (!session) throw new WorkoutExecutionSessionNotFoundError()
        if (session.planKey !== initialSession.planKey || session.sessionKey !== initialSession.sessionKey)
          throw new WorkoutExecutionSessionChangedError()
        const protectedKeys = await this.protection.findProtectedSessionKeys(
          session.planKey,
          [session.sessionKey],
          manager,
        )
        if (protectedKeys.has(session.sessionKey)) throw new WorkoutExecutionSessionProtectedError()

        const open = await findOpenRecord(repository, userId)
        if (open) {
          if (open.deviceId !== input.deviceId) throw new WorkoutExecutionDeviceMismatchError()
          throw new WorkoutExecutionOpenExistsError()
        }

        const snapshot = await this.createSnapshot(session.session, manager)
        const record = repository.create({
          id: randomUUID(),
          userId,
          deviceId: input.deviceId,
          requestId: input.requestId,
          planId: input.planId,
          sessionId: input.sessionId,
          planKey: session.planKey,
          sessionKey: session.sessionKey,
          snapshot,
          status: 'in_progress',
          startedAt: new Date(),
          finishedAt: null,
        })
        return toStartResponse(await repository.save(record))
      })
    } catch (error) {
      if (isUniqueViolation(error, 'uq_workout_executions_user_request')) {
        const existing = await this.executions.findOneBy({ userId, requestId: input.requestId })
        if (existing) return this.resolveReplay(existing, input)
      }
      if (isUniqueViolation(error, 'uq_workout_executions_open_user')) {
        const open = await findOpenRecord(this.executions, userId)
        if (open?.deviceId && open.deviceId !== input.deviceId)
          throw new WorkoutExecutionDeviceMismatchError()
        throw new WorkoutExecutionOpenExistsError()
      }
      throw error
    }
  }

  async findOpen(userId: string, deviceId: string): Promise<WorkoutExecutionOpenResponse> {
    const record = await findOpenRecord(this.executions, userId)
    if (!record) return { state: 'none', execution: null }
    if (record.deviceId !== deviceId) return { state: 'other_device', execution: null }
    return { state: 'current_device', execution: toStartResponse(record) }
  }

  async findByRequest(
    userId: string,
    deviceId: string,
    requestId: string,
  ): Promise<WorkoutExecutionStartResponse> {
    const record = await this.executions.findOneBy({ userId, requestId })
    if (!record) throw new WorkoutExecutionSessionNotFoundError()
    assertOwnerDevice(record, deviceId)
    return toStartResponse(record)
  }

  private resolveReplay(
    record: WorkoutExecutionRecord,
    input: WorkoutExecutionStartRequest,
  ): WorkoutExecutionStartResponse {
    if (
      record.deviceId !== input.deviceId ||
      record.planId !== input.planId ||
      record.sessionId !== input.sessionId
    )
      throw new WorkoutExecutionRequestConflictError()
    return toStartResponse(record)
  }

  private async createSnapshot(
    session: PlannedSession,
    manager: EntityManager,
  ): Promise<WorkoutExecutionSnapshot> {
    const keys = collectExerciseKeys(session)
    const resolved = await Promise.all(keys.map((key) => this.exercises.findByKey(key, manager)))
    if (resolved.some((exercise) => exercise === null)) throw new WorkoutExecutionSnapshotInvalidError()
    const availableExercises = resolved.filter((exercise) => exercise !== null)
    const snapshot = WorkoutExecutionSnapshotSchema.parse({
      session,
      exercises: availableExercises.map((exercise) => ({
        key: exercise.key,
        name: exercise.name,
        category: exercise.category,
        supportedMetrics: exercise.supportedMetrics,
      })),
    })
    return snapshot
  }
}

function collectExerciseKeys(session: PlannedSession): string[] {
  const keys = new Set<string>()
  for (const block of session.blocks) {
    for (const exercise of exercisesForBlock(block)) {
      keys.add(exercise.exerciseKey)
      for (const alternative of exercise.alternatives ?? []) keys.add(alternative.exerciseKey)
    }
  }
  return [...keys].sort()
}

function exercisesForBlock(block: PlannedBlock): PlannedExercise[] {
  return block.type === 'intervals'
    ? block.phases.flatMap((phase) => (phase.exercise ? [phase.exercise] : []))
    : block.exercises
}

function toExecution(record: WorkoutExecutionRecord): WorkoutExecution {
  if (!record.snapshot) throw new Error('Stored workout execution is missing its snapshot.')
  return {
    id: record.id,
    planKey: record.planKey,
    sessionKey: record.sessionKey,
    snapshot: record.snapshot,
    status: record.status,
    startedAt: record.startedAt.toISOString(),
    ...(record.finishedAt ? { finishedAt: record.finishedAt.toISOString() } : {}),
    pauses: [],
    results: [],
    corrections: [],
  }
}

function toStartResponse(record: WorkoutExecutionRecord): WorkoutExecutionStartResponse {
  if (!record.requestId || !record.deviceId) throw new Error('Stored start identity is incomplete.')
  return { requestId: record.requestId, deviceId: record.deviceId, execution: toExecution(record) }
}

function assertOwnerDevice(record: WorkoutExecutionRecord, deviceId: string): void {
  if (record.deviceId !== deviceId) throw new WorkoutExecutionDeviceMismatchError()
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (!(error instanceof QueryFailedError)) return false
  const driverError = error.driverError as { code?: string; constraint?: string }
  return driverError.code === '23505' && driverError.constraint === constraint
}

function findOpenRecord(repository: Repository<WorkoutExecutionRecord>, userId: string) {
  return repository.findOne({
    where: [
      { userId, status: 'in_progress' },
      { userId, status: 'paused' },
    ],
  })
}
