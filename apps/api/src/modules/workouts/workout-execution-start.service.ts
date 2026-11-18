import { Injectable } from '@nestjs/common'
import {
  WorkoutExecutionSnapshotSchema,
  WorkoutExecutionSchema,
  WorkoutResultSchema,
  type CloseExecutionOperation,
  type CorrectResultOperation,
  type WorkoutExecution,
  type WorkoutExecutionSnapshot,
  type WorkoutExecutionActiveTimer,
  type WorkoutExecutionStartRequest,
  type WorkoutExecutionStartResponse,
  type WorkoutExecutionClosedSessionsResponse,
  type WorkoutExecutionOpenResponse,
  type WorkoutExecutionResultRequest,
  type WorkoutExecutionResultResponse,
  type WorkoutExecutionCircuitRoundRequest,
  type WorkoutExecutionCircuitRoundResponse,
  type WorkoutExecutionIntervalRequest,
  type WorkoutExecutionIntervalResponse,
  type WorkoutCircuitRound,
  type WorkoutExecutionWorkTimerStartRequest,
  type WorkoutExecutionWorkTimerStartResponse,
  type WorkoutExecutionResultMetricsRequest,
  type WorkoutExecutionPauseResponse,
  type WorkoutExecutionResumeRequest,
  type WorkoutExecutionCloseRequest,
  type WorkoutExecutionCloseResponse,
  type WorkoutSyncResponse,
  type WorkoutResult,
  type WorkoutCorrection,
  type PlannedBlock,
  type PlannedExercise,
  type PlannedSession,
} from '@trakia/contracts'
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { DataSource, EntityManager, In, QueryFailedError, Repository } from 'typeorm'
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
    super('This account already has an open workout execution.')
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

export class WorkoutExecutionResultConflictError extends Error {
  constructor() {
    super('The result identity or workout unit was already confirmed with different content.')
    this.name = 'WorkoutExecutionResultConflictError'
  }
}

export class WorkoutExecutionClosedError extends Error {
  constructor() {
    super('Results can only be added to an open workout execution.')
    this.name = 'WorkoutExecutionClosedError'
  }
}

export class WorkoutExecutionCloseConflictError extends Error {
  constructor() {
    super('The workout execution is already closed with different final details.')
    this.name = 'WorkoutExecutionCloseConflictError'
  }
}

export class WorkoutExecutionResultInvalidError extends Error {
  constructor() {
    super('The workout result is not valid for the execution snapshot.')
    this.name = 'WorkoutExecutionResultInvalidError'
  }
}

export class WorkoutExecutionRestNotFinishedError extends Error {
  constructor() {
    super('The planned rest period has not finished yet.')
    this.name = 'WorkoutExecutionRestNotFinishedError'
  }
}

export class WorkoutExecutionCircuitRoundConflictError extends Error {
  constructor() {
    super('The circuit round transition conflicts with the current execution state.')
    this.name = 'WorkoutExecutionCircuitRoundConflictError'
  }
}

export class WorkoutExecutionResultMetricsConflictError extends Error {
  constructor() {
    super('The result already has different confirmed metrics.')
    this.name = 'WorkoutExecutionResultMetricsConflictError'
  }
}

export class WorkoutExecutionPauseConflictError extends Error {
  constructor() {
    super('The workout execution pause state has changed.')
    this.name = 'WorkoutExecutionPauseConflictError'
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
        if (open) throw new WorkoutExecutionOpenExistsError()

        const snapshot = await this.createSnapshot(session.session, manager)
        const record = repository.create({
          id: randomUUID(),
          userId,
          deviceId: null,
          requestId: input.requestId,
          planId: input.planId,
          sessionId: input.sessionId,
          planKey: session.planKey,
          sessionKey: session.sessionKey,
          snapshot,
          correctionOperations: [],
          activeTimer: null,
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
        throw new WorkoutExecutionOpenExistsError()
      }
      throw error
    }
  }

  async findOpen(userId: string): Promise<WorkoutExecutionOpenResponse> {
    const record = await findOpenRecord(this.executions, userId)
    if (!record) return { state: 'none', execution: null }
    return { state: 'open', execution: toStartResponse(record) }
  }

  async findForSessions(userId: string, sessionIds: string[]): Promise<Map<string, WorkoutExecution>> {
    if (sessionIds.length === 0) return new Map()
    const records = await this.executions.find({
      where: { userId, sessionId: In(sessionIds) },
      order: { startedAt: 'DESC', id: 'DESC' },
    })
    const bySession = new Map<string, WorkoutExecution>()
    for (const record of records) {
      if (!record.sessionId || !record.snapshot || bySession.has(record.sessionId)) continue
      bySession.set(record.sessionId, toExecution(record))
    }
    return bySession
  }

  async findClosedSessions(
    userId: string,
    sessionIds: string[],
  ): Promise<WorkoutExecutionClosedSessionsResponse> {
    const records = await this.executions.find({
      where: { userId, sessionId: In(sessionIds), status: 'completed' },
      order: { finishedAt: 'DESC' },
    })
    const seenSessions = new Set<string>()
    return records.flatMap((record) => {
      if (!record.sessionId || seenSessions.has(record.sessionId)) return []
      seenSessions.add(record.sessionId)
      return [{ sessionId: record.sessionId, execution: toExecution(record) }]
    })
  }

  async pauseExecution(userId: string, executionId: string): Promise<WorkoutExecutionPauseResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(WorkoutExecutionRecord)
      const record = await repository.findOne({
        where: { id: executionId, userId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!record) throw new WorkoutExecutionSessionNotFoundError()
      if (record.status === 'paused') return { execution: toExecution(record), replayed: true }
      if (record.status !== 'in_progress') throw new WorkoutExecutionClosedError()

      const [{ pausedAt }] = await manager.query('SELECT clock_timestamp() AS "pausedAt"')
      record.pauses = [...(record.pauses ?? []), { startedAt: new Date(pausedAt).toISOString() }]
      record.status = 'paused'
      await repository.save(record)
      return { execution: toExecution(record), replayed: false }
    })
  }

  async resumeExecution(
    userId: string,
    executionId: string,
    input: WorkoutExecutionResumeRequest,
  ): Promise<WorkoutExecutionPauseResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(WorkoutExecutionRecord)
      const record = await repository.findOne({
        where: { id: executionId, userId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!record) throw new WorkoutExecutionSessionNotFoundError()
      const pauses = record.pauses ?? []
      const current = pauses.at(-1)
      if (
        record.status === 'in_progress' &&
        current?.startedAt === input.pauseStartedAt &&
        current.finishedAt
      )
        return { execution: toExecution(record), replayed: true }
      if (
        record.status !== 'paused' ||
        !current ||
        current.finishedAt ||
        current.startedAt !== input.pauseStartedAt
      )
        throw new WorkoutExecutionPauseConflictError()

      const [{ resumedAt }] = await manager.query('SELECT clock_timestamp() AS "resumedAt"')
      record.pauses = pauses.map((pause, index) =>
        index === pauses.length - 1 ? { ...pause, finishedAt: new Date(resumedAt).toISOString() } : pause,
      )
      record.status = 'in_progress'
      await repository.save(record)
      return { execution: toExecution(record), replayed: false }
    })
  }

  async startWorkTimer(
    userId: string,
    executionId: string,
    input: WorkoutExecutionWorkTimerStartRequest,
  ): Promise<WorkoutExecutionWorkTimerStartResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(WorkoutExecutionRecord)
      const record = await repository.findOne({
        where: { id: executionId, userId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!record) throw new WorkoutExecutionSessionNotFoundError()
      if (record.status !== 'in_progress') throw new WorkoutExecutionClosedError()
      if (!isNextOnlineStrengthUnit(record.snapshot, record.results ?? [], input))
        throw new WorkoutExecutionResultInvalidError()

      if (record.activeTimer?.kind === 'work') {
        if (sameWorkTimerIdentity(record.activeTimer, input))
          return { activeTimer: record.activeTimer, replayed: true }
        throw new WorkoutExecutionResultConflictError()
      }

      let startedAt: Date
      const currentTimer = record.activeTimer
      if (currentTimer?.kind === 'rest') {
        const previous = (record.results ?? []).find(({ id }) => id === currentTimer.resultId)
        if (!previous?.actualMetrics) throw new WorkoutExecutionResultInvalidError()
        const restSeconds = plannedRestSeconds(record.snapshot, currentTimer)
        if (restSeconds === null) throw new WorkoutExecutionResultInvalidError()
        const [{ confirmedAt }] = await manager.query('SELECT clock_timestamp() AS "confirmedAt"')
        if (effectiveElapsedSeconds(currentTimer.startedAt, record.pauses ?? [], confirmedAt) < restSeconds)
          throw new WorkoutExecutionRestNotFinishedError()
        startedAt = confirmedAt
      } else {
        const [{ confirmedAt }] = await manager.query('SELECT clock_timestamp() AS "confirmedAt"')
        startedAt = confirmedAt
      }

      const results = record.results ?? []
      if (
        results.some(({ id }) => id === input.resultId) ||
        results.some(
          (result) =>
            result.type === 'sets' &&
            result.blockKey === input.blockKey &&
            result.plannedExerciseKey === input.plannedExerciseKey &&
            result.unit.kind === 'planned' &&
            result.unit.setIndex === input.unit.setIndex,
        )
      )
        throw new WorkoutExecutionResultConflictError()

      const activeTimer: WorkoutExecutionActiveTimer = {
        kind: 'work',
        ...input,
        startedAt: new Date(startedAt).toISOString(),
      }
      record.activeTimer = activeTimer
      await repository.save(record)
      return { activeTimer, replayed: false }
    })
  }

  async startCircuitRound(
    userId: string,
    executionId: string,
    input: WorkoutExecutionCircuitRoundRequest,
  ): Promise<WorkoutExecutionCircuitRoundResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(WorkoutExecutionRecord)
      const record = await repository.findOne({
        where: { id: executionId, userId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!record) throw new WorkoutExecutionSessionNotFoundError()
      if (record.status !== 'in_progress') throw new WorkoutExecutionClosedError()
      const block = plannedFixedCircuit(record.snapshot, input.blockKey)
      if (!block || input.roundIndex > block.rounds) throw new WorkoutExecutionResultInvalidError()
      const rounds = record.circuitRounds ?? []
      const existingTimer = record.activeTimer
      if (existingTimer?.kind === 'circuitRound') {
        if (sameCircuitRoundIdentity(existingTimer, input))
          return { execution: toExecution(record), replayed: true }
        throw new WorkoutExecutionCircuitRoundConflictError()
      }
      if (rounds.some((round) => sameCircuitRoundIdentity(round, input)))
        throw new WorkoutExecutionCircuitRoundConflictError()

      const expectedRound =
        rounds
          .filter((round) => round.blockKey === input.blockKey)
          .reduce((highest, round) => Math.max(highest, round.roundIndex), 0) + 1
      if (input.roundIndex !== expectedRound) throw new WorkoutExecutionCircuitRoundConflictError()

      if (input.roundIndex > 1) {
        if (
          !hasCompleteCircuitRoundResults(
            record.snapshot,
            record.results ?? [],
            input.blockKey,
            input.roundIndex - 1,
          )
        )
          throw new WorkoutExecutionCircuitRoundConflictError()
        if ((block.restBetweenRoundsSeconds ?? 0) > 0) {
          if (
            existingTimer?.kind !== 'circuitRest' ||
            !sameCircuitRoundIdentity(existingTimer, {
              blockKey: input.blockKey,
              roundIndex: input.roundIndex - 1,
            })
          )
            throw new WorkoutExecutionCircuitRoundConflictError()
          const [{ confirmedAt }] = await manager.query('SELECT clock_timestamp() AS "confirmedAt"')
          if (
            effectiveElapsedSeconds(existingTimer.startedAt, record.pauses ?? [], confirmedAt) <
            block.restBetweenRoundsSeconds!
          )
            throw new WorkoutExecutionRestNotFinishedError()
        } else if (existingTimer) {
          throw new WorkoutExecutionCircuitRoundConflictError()
        }
      } else if (existingTimer) {
        throw new WorkoutExecutionCircuitRoundConflictError()
      }

      const [{ startedAt }] = await manager.query('SELECT clock_timestamp() AS "startedAt"')
      record.activeTimer = {
        kind: 'circuitRound',
        blockKey: input.blockKey,
        roundIndex: input.roundIndex,
        startedAt: new Date(startedAt).toISOString(),
      }
      await repository.save(record)
      return { execution: toExecution(record), replayed: false }
    })
  }

  async finishCircuitRound(
    userId: string,
    executionId: string,
    input: WorkoutExecutionCircuitRoundRequest,
  ): Promise<WorkoutExecutionCircuitRoundResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(WorkoutExecutionRecord)
      const record = await repository.findOne({
        where: { id: executionId, userId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!record) throw new WorkoutExecutionSessionNotFoundError()
      if (record.status !== 'in_progress') throw new WorkoutExecutionClosedError()
      const block = plannedFixedCircuit(record.snapshot, input.blockKey)
      if (!block || input.roundIndex > block.rounds) throw new WorkoutExecutionResultInvalidError()
      const rounds = record.circuitRounds ?? []
      const completed = rounds.find((round) => sameCircuitRoundIdentity(round, input))
      if (completed) return { execution: toExecution(record), replayed: true }
      const timer = record.activeTimer
      if (timer?.kind !== 'circuitRound' || !sameCircuitRoundIdentity(timer, input))
        throw new WorkoutExecutionCircuitRoundConflictError()
      const [{ finishedAt }] = await manager.query('SELECT clock_timestamp() AS "finishedAt"')
      const activeSeconds = effectiveElapsedSeconds(timer.startedAt, record.pauses ?? [], finishedAt)
      if (!Number.isFinite(activeSeconds) || activeSeconds <= 0)
        throw new WorkoutExecutionResultInvalidError()
      const round: WorkoutCircuitRound = {
        blockKey: input.blockKey,
        roundIndex: input.roundIndex,
        startedAt: timer.startedAt,
        finishedAt: new Date(finishedAt).toISOString(),
        activeSeconds,
      }
      record.circuitRounds = [...rounds, round]
      record.activeTimer =
        input.roundIndex < block.rounds && (block.restBetweenRoundsSeconds ?? 0) > 0
          ? {
              kind: 'circuitRest',
              blockKey: input.blockKey,
              roundIndex: input.roundIndex,
              startedAt: round.finishedAt,
            }
          : null
      await repository.save(record)
      return { execution: toExecution(record), replayed: false }
    })
  }

  async transitionInterval(
    userId: string,
    executionId: string,
    input: WorkoutExecutionIntervalRequest,
  ): Promise<WorkoutExecutionIntervalResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(WorkoutExecutionRecord)
      const record = await repository.findOne({
        where: { id: executionId, userId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!record) throw new WorkoutExecutionSessionNotFoundError()
      if (record.status !== 'in_progress') throw new WorkoutExecutionClosedError()
      const block = record.snapshot?.session.blocks.find(
        (candidate) => candidate.type === 'intervals' && candidate.key === input.blockKey,
      )
      if (!record.snapshot || block?.type !== 'intervals' || input.cycleIndex > block.cycles)
        throw new WorkoutExecutionResultInvalidError()
      const phaseIndex = block.phases.findIndex(({ key }) => key === input.phaseKey)
      const phase = block.phases[phaseIndex]
      if (!phase || phaseIndex < 0) throw new WorkoutExecutionResultInvalidError()
      const identityExists = (record.results ?? []).some(
        (result) =>
          result.type === 'intervals' &&
          result.blockKey === input.blockKey &&
          result.cycleIndex === input.cycleIndex &&
          result.phaseKey === input.phaseKey,
      )
      if (identityExists) return { execution: toExecution(record), replayed: true }
      if (
        input.action === 'advance' &&
        intervalIdentityAlreadyPassed(
          block,
          input.cycleIndex,
          phaseIndex,
          record.activeTimer,
          record.results ?? [],
        )
      )
        return { execution: toExecution(record), replayed: true }

      const [{ confirmedAt }] = await manager.query('SELECT clock_timestamp() AS "confirmedAt"')
      const now = new Date(confirmedAt)
      if (input.action === 'start') {
        const firstWork = block.phases.find((candidate) => candidate.type === 'work')
        const existingTimer = record.activeTimer
        if (
          existingTimer?.kind === 'intervalWork' &&
          existingTimer.blockKey === block.key &&
          existingTimer.cycleIndex === input.cycleIndex &&
          existingTimer.phaseKey === input.phaseKey
        )
          return { execution: toExecution(record), replayed: true }
        if (
          existingTimer ||
          !intervalBlockIsStartable(record.snapshot, block.key, record.results ?? []) ||
          input.cycleIndex !== 1 ||
          phase.type !== 'work' ||
          phase.key !== firstWork?.key
        )
          throw new WorkoutExecutionResultConflictError()
        record.activeTimer = {
          kind: 'intervalWork',
          blockKey: block.key,
          cycleIndex: 1,
          phaseKey: phase.key,
          startedAt: now.toISOString(),
        }
      } else if (input.action === 'finish' || input.action === 'skip') {
        const timer = record.activeTimer
        const matchingTimer =
          (timer?.kind === 'intervalWork' || timer?.kind === 'intervalRest') &&
          timer.blockKey === input.blockKey &&
          timer.cycleIndex === input.cycleIndex &&
          timer.phaseKey === input.phaseKey
        if (!matchingTimer || (input.action === 'finish' && timer?.kind !== 'intervalWork'))
          throw new WorkoutExecutionResultConflictError()
        if (input.action === 'skip' && phase.type !== 'work') throw new WorkoutExecutionResultInvalidError()
        const elapsed =
          timer?.kind === 'intervalWork'
            ? effectiveElapsedSeconds(timer.startedAt, record.pauses ?? [], now)
            : 0
        if (input.action === 'finish' && elapsed <= 0) throw new WorkoutExecutionResultInvalidError()
        record.results = [
          ...(record.results ?? []),
          {
            type: 'intervals',
            id: randomUUID(),
            blockKey: block.key,
            cycleIndex: input.cycleIndex,
            phaseKey: phase.key,
            status: input.action === 'skip' ? 'skipped' : 'interrupted',
            ...(input.action === 'finish' && phase.type === 'work'
              ? { actualExerciseKey: phase.exercise.exerciseKey }
              : {}),
            ...(input.action === 'finish' ? { activeSeconds: elapsed } : {}),
          },
        ]
        record.activeTimer = nextIntervalTimer(block, input.cycleIndex, phaseIndex, now.toISOString())
      } else {
        const timer = record.activeTimer
        if (
          (timer?.kind !== 'intervalWork' && timer?.kind !== 'intervalRest') ||
          timer.blockKey !== input.blockKey ||
          timer.cycleIndex !== input.cycleIndex ||
          timer.phaseKey !== input.phaseKey
        )
          throw new WorkoutExecutionResultConflictError()

        let current: IntervalExecutionTimer | null = timer
        let transitions = 0
        let transitioned = false
        while (transitions++ < block.cycles * block.phases.length + 1) {
          if (!current) break
          const phaseTimer = current
          const currentIndex = block.phases.findIndex(({ key }) => key === phaseTimer.phaseKey)
          const currentPhase = block.phases[currentIndex]
          if (
            !currentPhase ||
            effectiveElapsedSeconds(phaseTimer.startedAt, record.pauses ?? [], now) <
              currentPhase.windowSeconds
          )
            break
          const boundary = addEffectiveSeconds(
            phaseTimer.startedAt,
            currentPhase.windowSeconds,
            record.pauses ?? [],
          )
          if (currentPhase.type === 'work') {
            record.results = [
              ...(record.results ?? []),
              {
                type: 'intervals',
                id: randomUUID(),
                blockKey: block.key,
                cycleIndex: phaseTimer.cycleIndex,
                phaseKey: phaseTimer.phaseKey,
                status: 'completed',
                ...(currentPhase.type === 'work'
                  ? { actualExerciseKey: currentPhase.exercise.exerciseKey }
                  : {}),
                activeSeconds: currentPhase.windowSeconds,
              },
            ]
          }
          current = nextIntervalTimer(block, phaseTimer.cycleIndex, currentIndex, boundary)
          record.activeTimer = current
          transitioned = true
        }
        if (!transitioned) return { execution: toExecution(record), replayed: true }
      }

      try {
        WorkoutExecutionSchema.parse(toExecution(record))
      } catch {
        throw new WorkoutExecutionResultInvalidError()
      }
      await repository.save(record)
      return { execution: toExecution(record), replayed: false }
    })
  }

  async findByRequest(
    userId: string,
    deviceId: string | undefined,
    requestId: string,
  ): Promise<WorkoutExecutionStartResponse> {
    const record = await this.executions.findOneBy({ userId, requestId })
    if (!record) throw new WorkoutExecutionSessionNotFoundError()
    if (record.deviceId !== null) assertOwnerDevice(record, deviceId ?? '')
    return toStartResponse(record)
  }

  async recordResult(
    userId: string,
    executionId: string,
    input: WorkoutExecutionResultRequest,
  ): Promise<WorkoutExecutionResultResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(WorkoutExecutionRecord)
      const record = await repository.findOne({
        where: { id: executionId, userId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!record) throw new WorkoutExecutionSessionNotFoundError()
      if (record.status !== 'in_progress') throw new WorkoutExecutionClosedError()

      const result = input.result
      if (result.activeSeconds !== undefined) throw new WorkoutExecutionResultInvalidError()
      const isStrengthSet = isOnlineStrengthSet(record.snapshot, result)
      const isCircuitResult = isOnlineCircuitResult(
        record.snapshot,
        record.circuitRounds ?? [],
        record.activeTimer,
        result,
      )
      if (!isStrengthSet && !isCircuitResult) throw new WorkoutExecutionResultInvalidError()
      const results = record.results ?? []
      const existing = results.find((candidate) => candidate.id === result.id)
      if (existing) {
        const comparableExisting =
          existing.activeSeconds !== undefined ? withoutTimedResultFields(existing) : existing
        if (!isDeepStrictEqual(comparableExisting, result)) throw new WorkoutExecutionResultConflictError()
        return {
          result: existing,
          replayed: true,
          ...(record.activeTimer ? { activeTimer: record.activeTimer } : {}),
        }
      }
      if (record.activeTimer?.kind === 'rest') throw new WorkoutExecutionResultConflictError()
      if (record.activeTimer?.kind === 'circuitRound') throw new WorkoutExecutionResultConflictError()
      if (results.some((candidate) => sameWorkoutUnit(candidate, result)))
        throw new WorkoutExecutionResultConflictError()

      let confirmedResult: WorkoutResult = result
      let finishedAt: Date | null = null
      const completedWithWorkTimer = isStrengthSet && record.activeTimer?.kind === 'work'
      if (record.activeTimer?.kind === 'work') {
        if (!sameWorkTimerResult(record.activeTimer, result)) throw new WorkoutExecutionResultConflictError()
        if (result.actualMetrics !== undefined) throw new WorkoutExecutionResultInvalidError()
        const [{ timestamp }] = await manager.query('SELECT clock_timestamp() AS "timestamp"')
        finishedAt = timestamp
        if (!finishedAt) throw new WorkoutExecutionResultInvalidError()
        const activeSeconds = effectiveElapsedSeconds(
          record.activeTimer.startedAt,
          record.pauses ?? [],
          finishedAt,
        )
        if (!Number.isFinite(activeSeconds) || activeSeconds <= 0)
          throw new WorkoutExecutionResultInvalidError()
        confirmedResult = { ...result, activeSeconds }
      }

      try {
        WorkoutExecutionSchema.parse({
          ...toExecution(record),
          activeTimer: undefined,
          results: [...results, confirmedResult],
        })
      } catch {
        throw new WorkoutExecutionResultInvalidError()
      }

      record.results = [...results, confirmedResult]
      const restSource =
        completedWithWorkTimer && confirmedResult.type === 'sets' && confirmedResult.unit.kind === 'planned'
          ? confirmedResult
          : null
      const restSeconds = restSource ? plannedRestSeconds(record.snapshot, restSource) : null
      record.activeTimer = isCircuitResult
        ? record.activeTimer
        : restSource && restSeconds
          ? {
              kind: 'rest',
              resultId: restSource.id,
              blockKey: restSource.blockKey,
              plannedExerciseKey: restSource.plannedExerciseKey,
              unit: { kind: 'planned', setIndex: restSource.unit.setIndex },
              startedAt: new Date(finishedAt!).toISOString(),
            }
          : null
      await repository.save(record)
      return {
        result: confirmedResult,
        replayed: false,
        ...(record.activeTimer ? { activeTimer: record.activeTimer } : {}),
      }
    })
  }

  async recordResultMetrics(
    userId: string,
    executionId: string,
    resultId: string,
    input: WorkoutExecutionResultMetricsRequest,
  ): Promise<WorkoutExecutionResultResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(WorkoutExecutionRecord)
      const record = await repository.findOne({
        where: { id: executionId, userId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!record) throw new WorkoutExecutionSessionNotFoundError()
      if (record.status !== 'in_progress') throw new WorkoutExecutionClosedError()
      if (record.activeTimer?.kind === 'rest' && record.activeTimer.resultId !== resultId)
        throw new WorkoutExecutionResultConflictError()
      const results = [...(record.results ?? [])]
      const index = results.findIndex(({ id }) => id === resultId)
      if (index < 0) throw new WorkoutExecutionSessionNotFoundError()
      const current = results[index]!
      const timedSet = current.type === 'sets' && current.activeSeconds !== undefined
      const recordedCircuitRound =
        current.type === 'circuit' &&
        (record.circuitRounds ?? []).some(
          (round) =>
            round.blockKey === current.blockKey &&
            current.round.kind === 'planned' &&
            round.roundIndex === current.round.roundIndex,
        )
      if (current.status !== 'performed' || !current.actualExerciseKey || (!timedSet && !recordedCircuitRound))
        throw new WorkoutExecutionResultInvalidError()
      if (current.actualMetrics) {
        if (!isDeepStrictEqual(current.actualMetrics, input.actualMetrics))
          throw new WorkoutExecutionResultMetricsConflictError()
        return {
          result: current,
          replayed: true,
          ...(record.activeTimer ? { activeTimer: record.activeTimer } : {}),
        }
      }
      if (Object.keys(input.actualMetrics).length === 0) throw new WorkoutExecutionResultInvalidError()

      const updated: WorkoutResult = { ...current, actualMetrics: input.actualMetrics }
      results[index] = updated
      try {
        WorkoutExecutionSchema.parse({ ...toExecution(record), results })
      } catch {
        throw new WorkoutExecutionResultInvalidError()
      }
      record.results = results
      await repository.save(record)
      return {
        result: updated,
        replayed: false,
        ...(record.activeTimer ? { activeTimer: record.activeTimer } : {}),
      }
    })
  }

  async closeExecution(
    userId: string,
    executionId: string,
    operation: CloseExecutionOperation,
  ): Promise<WorkoutSyncResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(WorkoutExecutionRecord)
      const record = await repository.findOne({
        where: { id: executionId, userId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!record) throw new WorkoutExecutionSessionNotFoundError()

      const responseIdentity = {
        operationId: operation.operationId,
        executionId: operation.executionId,
        sequence: operation.sequence,
      }
      if (record.deviceId !== operation.deviceId) {
        return syncConflict(
          responseIdentity,
          'EXECUTION_CONFLICT',
          'The execution is not owned by this device.',
        )
      }

      if (record.closeOperation) {
        return isDeepStrictEqual(record.closeOperation, operation)
          ? { ...responseIdentity, result: 'already_applied' }
          : syncConflict(
              responseIdentity,
              'OPERATION_CONTENT_MISMATCH',
              'A different close operation has already been applied.',
            )
      }

      const submitted = operation.payload.execution
      if (
        record.status !== 'in_progress' ||
        !record.snapshot ||
        submitted.id !== record.id ||
        submitted.planKey !== record.planKey ||
        submitted.sessionKey !== record.sessionKey ||
        submitted.startedAt !== record.startedAt.toISOString() ||
        !isDeepStrictEqual(submitted.snapshot, record.snapshot) ||
        !isDeepStrictEqual(submitted.circuitRounds ?? [], record.circuitRounds ?? [])
      ) {
        return syncConflict(
          responseIdentity,
          'EXECUTION_CONFLICT',
          'The close operation does not match the reserved execution.',
        )
      }

      const results = [...(record.results ?? [])]
      for (const incoming of submitted.results) {
        const existingById = results.find((result) => result.id === incoming.id)
        if (existingById) {
          if (!isDeepStrictEqual(existingById, incoming)) {
            return syncConflict(
              responseIdentity,
              'EXECUTION_CONFLICT',
              'A result identity has different content on the server.',
            )
          }
          continue
        }
        if (results.some((result) => sameWorkoutUnit(result, incoming))) {
          return syncConflict(
            responseIdentity,
            'EXECUTION_CONFLICT',
            'A workout unit has a different result on the server.',
          )
        }
        results.push(incoming)
      }

      try {
        WorkoutExecutionSchema.parse({ ...submitted, results })
      } catch {
        return syncRejected(responseIdentity, 'INVALID_OPERATION', 'The consolidated execution is invalid.')
      }

      record.results = results
      record.status = 'completed'
      record.finishedAt = new Date(submitted.finishedAt!)
      record.closeOperation = operation
      await repository.save(record)
      return { ...responseIdentity, result: 'applied' }
    })
  }

  async closeOnlineExecution(
    userId: string,
    executionId: string,
    input: WorkoutExecutionCloseRequest,
  ): Promise<WorkoutExecutionCloseResponse> {
    const details = {
      ...(input.feeling !== undefined ? { feeling: input.feeling } : {}),
      ...(input.observations !== undefined ? { observations: input.observations } : {}),
      completionType: input.completionType ?? 'planned',
      ...(input.closureReason !== undefined ? { closureReason: input.closureReason } : {}),
    } as const

    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(WorkoutExecutionRecord)
      const record = await repository.findOne({
        where: { id: executionId, userId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!record) throw new WorkoutExecutionSessionNotFoundError()

      if (record.status === 'completed') {
        const currentDetails = {
          ...(record.feeling !== null && record.feeling !== undefined ? { feeling: record.feeling } : {}),
          ...(record.observations !== null && record.observations !== undefined
            ? { observations: record.observations }
            : {}),
          completionType: record.completionType ?? 'planned',
          ...(record.closureReason !== null && record.closureReason !== undefined
            ? { closureReason: record.closureReason }
            : {}),
        }
        if (!isDeepStrictEqual(currentDetails, details)) throw new WorkoutExecutionCloseConflictError()
        return { result: 'already_closed', execution: toExecution(record) }
      }
      if (record.status !== 'in_progress' && record.status !== 'paused')
        throw new WorkoutExecutionCloseConflictError()
      if (
        (record.circuitRounds ?? []).some(
          (round) =>
            !hasCompleteCircuitRoundResults(
              record.snapshot,
              record.results ?? [],
              round.blockKey,
              round.roundIndex,
            ),
        )
      )
        throw new WorkoutExecutionResultInvalidError()
      if (
        !(record.snapshot?.session.blocks ?? []).every(
          (block) => block.type !== 'intervals' || hasCompleteIntervals(block, record.results ?? []),
        )
      )
        throw new WorkoutExecutionResultInvalidError()

      const [{ finishedAt }] = await manager.query('SELECT clock_timestamp() AS "finishedAt"')
      const finished = new Date(finishedAt)
      const execution = {
        ...toExecution(record),
        status: 'completed' as const,
        finishedAt: finished.toISOString(),
        ...details,
      }
      try {
        WorkoutExecutionSchema.parse(execution)
      } catch {
        throw new WorkoutExecutionResultInvalidError()
      }

      record.status = 'completed'
      record.finishedAt = finished
      record.feeling = input.feeling ?? null
      record.observations = input.observations ?? null
      record.completionType = details.completionType
      record.closureReason = input.closureReason ?? null
      await repository.save(record)
      return { result: 'closed', execution }
    })
  }

  async correctResult(
    userId: string,
    executionId: string,
    operation: CorrectResultOperation,
  ): Promise<WorkoutSyncResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(WorkoutExecutionRecord)
      const record = await repository.findOne({
        where: { id: executionId, userId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!record) throw new WorkoutExecutionSessionNotFoundError()

      const identity = {
        operationId: operation.operationId,
        executionId: operation.executionId,
        sequence: operation.sequence,
      }
      if (operation.executionId !== record.id || record.deviceId !== operation.deviceId) {
        return syncConflict(identity, 'EXECUTION_CONFLICT', 'La ejecución no pertenece a este dispositivo.')
      }
      if (record.status !== 'completed' || !record.closeOperation) {
        return syncConflict(
          identity,
          'EXECUTION_CONFLICT',
          'Solo se pueden corregir entrenamientos cerrados.',
        )
      }

      const operations = record.correctionOperations ?? []
      const existing = operations.find(({ operationId }) => operationId === operation.operationId)
      if (existing) {
        return isDeepStrictEqual(existing, operation)
          ? { ...identity, result: 'already_applied' }
          : syncConflict(identity, 'OPERATION_CONTENT_MISMATCH', 'La operación ya existe con otro contenido.')
      }
      const expectedSequence = operations.length + 2
      if (operation.sequence > expectedSequence) {
        return {
          ...identity,
          result: 'dependency_pending',
          requiredSequence: expectedSequence,
        }
      }
      if (operation.sequence !== expectedSequence) {
        return syncConflict(identity, 'EXECUTION_CONFLICT', 'La secuencia de corrección ya fue utilizada.')
      }

      const correction = operation.payload.correction
      const results = [...(record.results ?? [])]
      const resultIndex = results.findIndex(({ id }) => id === correction.resultId)
      if (resultIndex < 0) {
        return syncRejected(identity, 'RESULT_NOT_FOUND', 'No se encontró el resultado que quieres corregir.')
      }

      let correctedResult: WorkoutResult
      try {
        correctedResult = applyCorrection(results[resultIndex]!, correction)
        results[resultIndex] = correctedResult
        WorkoutExecutionSchema.parse({
          ...toExecution(record),
          results,
          corrections: [...operations.map(({ payload }) => payload.correction), correction],
        })
      } catch {
        return syncRejected(
          identity,
          'INVALID_OPERATION',
          'La corrección no coincide con el resultado actual.',
        )
      }

      record.results = results
      record.correctionOperations = [...operations, operation]
      await repository.save(record)
      return { ...identity, result: 'applied' }
    })
  }

  private resolveReplay(
    record: WorkoutExecutionRecord,
    input: WorkoutExecutionStartRequest,
  ): WorkoutExecutionStartResponse {
    if (record.planId !== input.planId || record.sessionId !== input.sessionId)
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

function isOnlineStrengthSet(snapshot: WorkoutExecutionSnapshot | null, result: WorkoutResult): boolean {
  if (!snapshot || result.type !== 'sets' || result.status !== 'performed' || result.unit.kind !== 'planned')
    return false
  const block = snapshot.session.blocks.find(({ key }) => key === result.blockKey)
  if (block?.type !== 'sets') return false
  const planned = block.exercises.find(({ key }) => key === result.plannedExerciseKey)
  if (!planned || planned.sets < result.unit.setIndex) return false
  return snapshot.exercises.some(
    ({ key, category }) => key === result.actualExerciseKey && category === 'strength',
  )
}

function isOnlineCircuitResult(
  snapshot: WorkoutExecutionSnapshot | null,
  rounds: WorkoutCircuitRound[],
  activeTimer: WorkoutExecutionActiveTimer | null,
  result: WorkoutResult,
): boolean {
  if (
    !snapshot ||
    result.type !== 'circuit' ||
    result.status !== 'performed' ||
    result.round.kind !== 'planned' ||
    activeTimer?.kind === 'circuitRound' ||
    activeTimer?.kind === 'work' ||
    activeTimer?.kind === 'rest'
  )
    return false
  const block = plannedFixedCircuit(snapshot, result.blockKey)
  if (!block || result.round.roundIndex > block.rounds) return false
  if (
    !rounds.some((round) =>
      sameCircuitRoundIdentity(round, {
        blockKey: result.blockKey,
        roundIndex: result.round.roundIndex,
      }),
    )
  )
    return false
  const planned = block.exercises.find(({ key }) => key === result.plannedExerciseKey)
  if (!planned) return false
  const allowed = [planned.exerciseKey, ...(planned.alternatives ?? []).map(({ exerciseKey }) => exerciseKey)]
  return Boolean(result.actualExerciseKey && allowed.includes(result.actualExerciseKey))
}

function isNextOnlineStrengthUnit(
  snapshot: WorkoutExecutionSnapshot | null,
  results: WorkoutResult[],
  input: WorkoutExecutionWorkTimerStartRequest,
): boolean {
  if (!snapshot || input.unit.kind !== 'planned') return false
  const allBlocksAreStrengthSets = snapshot.session.blocks.every(
    (block) =>
      block.type === 'sets' &&
      block.exercises.every((appearance) =>
        snapshot.exercises.some(
          ({ key, category }) => key === appearance.exerciseKey && category === 'strength',
        ),
      ),
  )
  if (!allBlocksAreStrengthSets) return false

  const units = snapshot.session.blocks.flatMap((block) =>
    block.type === 'sets'
      ? block.exercises.flatMap((appearance) =>
          Array.from({ length: appearance.sets }, (_, index) => ({
            blockKey: block.key,
            plannedExerciseKey: appearance.key,
            setIndex: index + 1,
          })),
        )
      : [],
  )
  const next = units.find(
    (unit) =>
      !results.some(
        (result) =>
          result.type === 'sets' &&
          result.blockKey === unit.blockKey &&
          result.plannedExerciseKey === unit.plannedExerciseKey &&
          result.unit.kind === 'planned' &&
          result.unit.setIndex === unit.setIndex,
      ),
  )
  return Boolean(
    next &&
    next.blockKey === input.blockKey &&
    next.plannedExerciseKey === input.plannedExerciseKey &&
    next.setIndex === input.unit.setIndex,
  )
}

function sameWorkTimerIdentity(
  timer: WorkoutExecutionActiveTimer,
  input: WorkoutExecutionWorkTimerStartRequest,
): boolean {
  return (
    timer.kind === 'work' &&
    timer.resultId === input.resultId &&
    timer.blockKey === input.blockKey &&
    timer.plannedExerciseKey === input.plannedExerciseKey &&
    timer.unit.kind === input.unit.kind &&
    timer.unit.setIndex === input.unit.setIndex
  )
}

function sameWorkTimerResult(
  timer: Extract<WorkoutExecutionActiveTimer, { kind: 'work' }>,
  result: WorkoutResult,
): boolean {
  return (
    result.type === 'sets' &&
    result.id === timer.resultId &&
    result.blockKey === timer.blockKey &&
    result.plannedExerciseKey === timer.plannedExerciseKey &&
    result.unit.kind === timer.unit.kind &&
    result.unit.setIndex === timer.unit.setIndex
  )
}

function plannedRestSeconds(
  snapshot: WorkoutExecutionSnapshot | null,
  source: WorkoutResult | Extract<WorkoutExecutionActiveTimer, { kind: 'work' | 'rest' }>,
): number | null {
  if (!snapshot) return null
  const identity = 'type' in source ? (source.type === 'sets' ? source : null) : source
  if (!identity || identity.unit.kind !== 'planned') return null
  const block = snapshot.session.blocks.find(
    (candidate) => candidate.type === 'sets' && candidate.key === identity.blockKey,
  )
  const appearance =
    block?.type === 'sets'
      ? block.exercises.find(({ key }) => key === identity.plannedExerciseKey)
      : undefined
  if (!block || block.type !== 'sets' || !appearance || identity.unit.setIndex >= appearance.sets) return null
  return block.restBetweenSetsSeconds
}

function effectiveElapsedSeconds(
  startedAt: string,
  pauses: Array<{ startedAt: string; finishedAt?: string }>,
  now: Date,
) {
  const start = Date.parse(startedAt)
  const end = now.getTime()
  const pausedMilliseconds = pauses.reduce((total, pause) => {
    const pauseStart = Math.max(start, Date.parse(pause.startedAt))
    const pauseEnd = Math.min(end, pause.finishedAt ? Date.parse(pause.finishedAt) : end)
    return total + Math.max(0, pauseEnd - pauseStart)
  }, 0)
  return Math.max(0, (end - start - pausedMilliseconds) / 1000)
}

function addEffectiveSeconds(
  startedAt: string,
  seconds: number,
  pauses: Array<{ startedAt: string; finishedAt?: string }>,
): string {
  const start = Date.parse(startedAt)
  let boundary = start + seconds * 1000
  for (const pause of pauses) {
    const pauseStart = Math.max(start, Date.parse(pause.startedAt))
    if (pauseStart >= boundary) break
    if (!pause.finishedAt) break
    const pauseEnd = Date.parse(pause.finishedAt)
    if (pauseEnd > pauseStart) boundary += pauseEnd - pauseStart
  }
  return new Date(boundary).toISOString()
}

function nextIntervalTimer(
  block: Extract<PlannedBlock, { type: 'intervals' }>,
  cycleIndex: number,
  phaseIndex: number,
  startedAt: string,
): IntervalExecutionTimer | null {
  const nextPhaseIndex = phaseIndex + 1
  const nextCycleIndex = nextPhaseIndex < block.phases.length ? cycleIndex : cycleIndex + 1
  const phase = block.phases[nextPhaseIndex < block.phases.length ? nextPhaseIndex : 0]
  if (nextCycleIndex > block.cycles || !phase) return null
  return {
    kind: phase.type === 'work' ? 'intervalWork' : 'intervalRest',
    blockKey: block.key,
    cycleIndex: nextCycleIndex,
    phaseKey: phase.key,
    startedAt,
  }
}

type IntervalExecutionTimer = Extract<WorkoutExecutionActiveTimer, { kind: 'intervalWork' | 'intervalRest' }>

function hasCompleteIntervals(
  block: Extract<PlannedBlock, { type: 'intervals' }>,
  results: WorkoutResult[],
): boolean {
  return Array.from({ length: block.cycles }, (_, index) => index + 1).every((cycleIndex) =>
    block.phases
      .filter(({ type }) => type === 'work')
      .every((phase) =>
        results.some(
          (result) =>
            result.type === 'intervals' &&
            result.blockKey === block.key &&
            result.cycleIndex === cycleIndex &&
            result.phaseKey === phase.key,
        ),
      ),
  )
}

function intervalBlockIsStartable(
  snapshot: WorkoutExecutionSnapshot,
  blockKey: string,
  results: WorkoutResult[],
): boolean {
  const blocks = snapshot.session.blocks.filter(
    (candidate): candidate is Extract<PlannedBlock, { type: 'intervals' }> => candidate.type === 'intervals',
  )
  const targetIndex = blocks.findIndex(({ key }) => key === blockKey)
  return (
    targetIndex >= 0 && blocks.slice(0, targetIndex).every((block) => hasCompleteIntervals(block, results))
  )
}

function intervalIdentityAlreadyPassed(
  block: Extract<PlannedBlock, { type: 'intervals' }>,
  cycleIndex: number,
  phaseIndex: number,
  activeTimer: WorkoutExecutionActiveTimer | null,
  results: WorkoutResult[],
): boolean {
  if (activeTimer?.kind === 'intervalWork' || activeTimer?.kind === 'intervalRest') {
    if (activeTimer.blockKey !== block.key) return false
    const currentIndex = block.phases.findIndex(({ key }) => key === activeTimer.phaseKey)
    return (
      activeTimer.cycleIndex > cycleIndex ||
      (activeTimer.cycleIndex === cycleIndex && currentIndex > phaseIndex)
    )
  }
  return activeTimer === null && hasCompleteIntervals(block, results)
}

function plannedFixedCircuit(snapshot: WorkoutExecutionSnapshot | null, blockKey: string) {
  const block = snapshot?.session.blocks.find(
    (candidate) => candidate.type === 'circuit' && candidate.mode === 'rounds' && candidate.key === blockKey,
  )
  return block?.type === 'circuit' && block.mode === 'rounds' ? block : null
}

function sameCircuitRoundIdentity(
  identity: { blockKey: string; roundIndex: number },
  input: { blockKey: string; roundIndex: number },
): boolean {
  return identity.blockKey === input.blockKey && identity.roundIndex === input.roundIndex
}

function hasCompleteCircuitRoundResults(
  snapshot: WorkoutExecutionSnapshot | null,
  results: WorkoutResult[],
  blockKey: string,
  roundIndex: number,
): boolean {
  const block = plannedFixedCircuit(snapshot, blockKey)
  if (!block) return false
  return block.exercises.every((exercise) =>
    results.some(
      (result) =>
        result.type === 'circuit' &&
        result.blockKey === blockKey &&
        result.plannedExerciseKey === exercise.key &&
        result.round.kind === 'planned' &&
        result.round.roundIndex === roundIndex &&
        result.status === 'performed',
    ),
  )
}

function withoutTimedResultFields(result: WorkoutResult): WorkoutResult {
  const { activeSeconds: _activeSeconds, actualMetrics: _actualMetrics, ...identity } = result
  return identity as WorkoutResult
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
    ...(record.feeling ? { feeling: record.feeling } : {}),
    ...(record.observations !== null && record.observations !== undefined
      ? { observations: record.observations }
      : {}),
    ...(record.completionType ? { completionType: record.completionType } : {}),
    ...(record.closureReason !== null && record.closureReason !== undefined
      ? { closureReason: record.closureReason }
      : {}),
    pauses: record.pauses ?? [],
    ...((record.circuitRounds ?? []).length ? { circuitRounds: record.circuitRounds } : {}),
    ...(record.activeTimer ? { activeTimer: record.activeTimer } : {}),
    results: record.results ?? [],
    corrections: (record.correctionOperations ?? []).map(({ payload }) => payload.correction),
  }
}

function toStartResponse(record: WorkoutExecutionRecord): WorkoutExecutionStartResponse {
  if (!record.requestId || !record.userId) throw new Error('Stored start identity is incomplete.')
  return { requestId: record.requestId, execution: toExecution(record) }
}

function assertOwnerDevice(record: WorkoutExecutionRecord, deviceId: string): void {
  if (record.deviceId !== deviceId) throw new WorkoutExecutionDeviceMismatchError()
}

function sameWorkoutUnit(left: WorkoutResult, right: WorkoutResult): boolean {
  if (left.type !== right.type || left.blockKey !== right.blockKey) return false
  if (left.type === 'sets' && right.type === 'sets') {
    return (
      left.plannedExerciseKey === right.plannedExerciseKey &&
      left.unit.kind === right.unit.kind &&
      left.unit.setIndex === right.unit.setIndex &&
      (left.unit.kind !== 'additional' ||
        (right.unit.kind === 'additional' && left.unit.key === right.unit.key))
    )
  }
  if (left.type === 'circuit' && right.type === 'circuit') {
    return (
      left.plannedExerciseKey === right.plannedExerciseKey &&
      left.round.kind === right.round.kind &&
      left.round.roundIndex === right.round.roundIndex &&
      (left.round.kind !== 'additional' ||
        (right.round.kind === 'additional' && left.round.key === right.round.key))
    )
  }
  return (
    left.type === 'intervals' &&
    right.type === 'intervals' &&
    left.cycleIndex === right.cycleIndex &&
    left.phaseKey === right.phaseKey
  )
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (!(error instanceof QueryFailedError)) return false
  const driverError = error.driverError as { code?: string; constraint?: string }
  return driverError.code === '23505' && driverError.constraint === constraint
}

function syncConflict(
  identity: Pick<WorkoutSyncResponse, 'operationId' | 'executionId' | 'sequence'>,
  code: 'OPERATION_CONTENT_MISMATCH' | 'EXECUTION_CONFLICT',
  message: string,
): WorkoutSyncResponse {
  return { ...identity, result: 'conflict', issue: { code, message } }
}

function syncRejected(
  identity: Pick<WorkoutSyncResponse, 'operationId' | 'executionId' | 'sequence'>,
  code: 'INVALID_OPERATION' | 'RESULT_NOT_FOUND',
  message: string,
): WorkoutSyncResponse {
  return { ...identity, result: 'rejected', issue: { code, message } }
}

function applyCorrection(result: WorkoutResult, correction: WorkoutCorrection): WorkoutResult {
  const exerciseChange = correction.changes.find((change) => change.field === 'exerciseKey')
  const currentExercise = result.actualExerciseKey
  if (exerciseChange && currentExercise !== exerciseChange.before)
    throw new Error('The current exercise does not match the correction.')

  const actualMetrics = { ...(result.actualMetrics ?? {}) }
  for (const change of correction.changes) {
    if (change.field === 'exerciseKey') continue
    const field = actualMetricField(change.field)
    const current = actualMetrics[field] ?? null
    if (current !== change.before) throw new Error('The current metric does not match the correction.')
    if (change.after === null) delete actualMetrics[field]
    else actualMetrics[field] = change.after
  }

  const updated = {
    ...result,
    ...(exerciseChange ? { actualExerciseKey: exerciseChange.after } : {}),
    ...(Object.keys(actualMetrics).length ? { actualMetrics } : { actualMetrics: undefined }),
  }
  return WorkoutResultSchema.parse(updated)
}

function actualMetricField(field: Exclude<WorkoutCorrection['changes'][number]['field'], 'exerciseKey'>) {
  switch (field) {
    case 'weight':
      return 'weightKg' as const
    case 'duration':
      return 'durationSeconds' as const
    case 'distance':
      return 'distanceMeters' as const
    default:
      return field
  }
}

function findOpenRecord(repository: Repository<WorkoutExecutionRecord>, userId: string) {
  return repository.findOne({
    where: [
      { userId, status: 'in_progress' },
      { userId, status: 'paused' },
    ],
  })
}
