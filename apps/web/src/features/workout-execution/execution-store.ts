import {
  WorkoutCompletionTypeSchema,
  WorkoutExecutionSchema,
  WorkoutExecutionStartRequestSchema,
  WorkoutExecutionStartResponseSchema,
  WorkoutFeelingSchema,
  WorkoutPauseSchema,
  WorkoutResultSchema,
  WorkoutSyncStatusSchema,
  WorkoutSyncOperationSchema,
  type ActualMetrics,
  type CircuitResult,
  type IntervalResult,
  type WorkoutResult,
  type SetResult,
  type WorkoutPause,
  type WorkoutExecutionStartRequest,
  type WorkoutExecutionStartResponse,
  type CloseExecutionOperation,
  type CorrectResultOperation,
  type WorkoutCompletionType,
  type WorkoutExecution,
  type WorkoutFeeling,
  type WorkoutSyncStatus,
} from '@trakia/contracts'

const DATABASE_NAME = 'trakia-workout-execution'
const DATABASE_VERSION = 2
const RECORDS = 'records'
const DEVICE_ID = 'deviceId'
const PENDING_START = 'pendingStart'
const ACTIVE_EXECUTION = 'activeExecution'
const PROGRESS_PREFIX = 'progress:'

export type WorkoutSeriesDraft = {
  type?: WorkoutResult['type']
  blockKey: string
  plannedExerciseKey: string
  unit?: SetResult['unit']
  round?: CircuitResult['round']
  cycleIndex?: IntervalResult['cycleIndex']
  phaseKey?: IntervalResult['phaseKey']
  actualExerciseKey?: string
  fields: Partial<Record<keyof ActualMetrics, string>>
}

export type WorkoutExecutionCursor =
  | { type: 'sets'; blockKey: string; plannedExerciseKey: string; setIndex: number; additionalKey?: string }
  | { type: 'circuit'; blockKey: string; plannedExerciseKey: string; roundIndex: number }
  | { type: 'intervals'; blockKey: string; cycleIndex: number; phaseKey: string }

export type WorkoutTimerState = {
  kind: 'rest' | 'work' | 'amrap'
  blockKey: string
  startedAt: string
  durationSeconds: number
  elapsedBeforeSegmentSeconds: number
  cycleIndex?: number
  phaseKey?: string
}

export type WorkoutExecutionTemporalState = {
  status: 'in_progress' | 'paused'
  pauses: WorkoutPause[]
  cursor?: WorkoutExecutionCursor
  timer?: WorkoutTimerState
  requiresWorkConfirmation?: boolean
  workSecondsDraft?: number
  awaitManualAdvance?: boolean
  amrapFinished?: boolean
  setAwaitingMetrics?: boolean
}

export type StoredWorkoutResult = {
  result: WorkoutResult
  status: 'pending' | 'syncing' | 'synced' | 'conflict'
  error?: string
}

export type WorkoutExecutionReviewDraft = {
  feeling?: WorkoutFeeling
  observations?: string
  completionType?: WorkoutCompletionType
  closureReason?: string
}

export type StoredWorkoutClose = {
  operation: CloseExecutionOperation
  status: WorkoutSyncStatus
  error?: string
}

export type WorkoutExecutionProgress = {
  draft: WorkoutSeriesDraft | null
  results: StoredWorkoutResult[]
  temporal: WorkoutExecutionTemporalState
  reviewDraft: WorkoutExecutionReviewDraft | null
  close: StoredWorkoutClose | null
  corrections: CorrectResultOperation[]
}

export interface PendingExecutionStart extends WorkoutExecutionStartRequest {
  createdAt: string
}

export interface WorkoutExecutionStore {
  getOrCreateDeviceId(): Promise<string>
  getPendingStart(): Promise<PendingExecutionStart | null>
  prepareStart(planId: string, sessionId: string): Promise<PendingExecutionStart>
  getActiveExecution(): Promise<WorkoutExecutionStartResponse | null>
  confirmStart(response: WorkoutExecutionStartResponse): Promise<void>
  clearPendingStart(): Promise<void>
  getProgress(executionId: string): Promise<WorkoutExecutionProgress>
  saveDraft(executionId: string, draft: WorkoutSeriesDraft): Promise<void>
  confirmResult(
    executionId: string,
    result: WorkoutResult,
    temporal?: WorkoutExecutionTemporalState,
  ): Promise<void>
  saveTemporalState(executionId: string, temporal: WorkoutExecutionTemporalState): Promise<void>
  getPendingResults(executionId: string): Promise<StoredWorkoutResult[]>
  setResultStatus(
    executionId: string,
    resultId: string,
    status: StoredWorkoutResult['status'],
    error?: string,
  ): Promise<void>
  mergeServerResults(executionId: string, results: WorkoutResult[]): Promise<void>
  setCloseStatus(executionId: string, status: WorkoutSyncStatus, error?: string): Promise<void>
  confirmCloseSynced(executionId: string): Promise<void>
  confirmCorrection(
    executionId: string,
    operation: CorrectResultOperation,
    result: WorkoutResult,
  ): Promise<void>
  saveReviewDraft(executionId: string, draft: WorkoutExecutionReviewDraft): Promise<void>
  closeExecution(execution: WorkoutExecution, deviceId: string): Promise<StoredWorkoutClose>
}

export class PendingExecutionStartConflictError extends Error {
  constructor() {
    super('Another workout start request is awaiting confirmation.')
    this.name = 'PendingExecutionStartConflictError'
  }
}

export function createWorkoutExecutionStore(factory: IDBFactory = indexedDB): WorkoutExecutionStore {
  const database = openDatabase(factory)

  return {
    async getOrCreateDeviceId() {
      const db = await database
      const transaction = db.transaction(RECORDS, 'readwrite')
      const store = transaction.objectStore(RECORDS)
      const existing = await requestResult(store.get(DEVICE_ID))
      if (typeof existing === 'string') {
        await transactionDone(transaction)
        return existing
      }
      const deviceId = crypto.randomUUID()
      putJsonRecord(store, deviceId, DEVICE_ID)
      await transactionDone(transaction)
      return deviceId
    },

    async getPendingStart() {
      const value = await readRecord<unknown>(await database, PENDING_START)
      if (value === undefined) return null
      return parsePendingStart(value)
    },

    async prepareStart(planId, sessionId) {
      const db = await database
      const transaction = db.transaction(RECORDS, 'readwrite')
      const store = transaction.objectStore(RECORDS)
      const deviceRequest = store.get(DEVICE_ID)
      const pendingRequest = store.get(PENDING_START)
      const [rawDeviceId, pendingValue] = await Promise.all([
        requestResult(deviceRequest),
        requestResult(pendingRequest),
      ])
      const deviceId = typeof rawDeviceId === 'string' ? rawDeviceId : crypto.randomUUID()
      const existing = pendingValue === undefined ? null : parsePendingStart(pendingValue)
      if (existing) {
        if (
          existing.deviceId !== deviceId ||
          existing.planId !== planId ||
          existing.sessionId !== sessionId
        ) {
          transaction.abort()
          throw new PendingExecutionStartConflictError()
        }
        await transactionDone(transaction)
        return existing
      }
      const pending = WorkoutExecutionStartRequestSchema.parse({
        requestId: crypto.randomUUID(),
        deviceId,
        planId,
        sessionId,
      })
      const stored: PendingExecutionStart = { ...pending, createdAt: new Date().toISOString() }
      putJsonRecord(store, deviceId, DEVICE_ID)
      putJsonRecord(store, stored, PENDING_START)
      await transactionDone(transaction)
      return stored
    },

    async getActiveExecution() {
      const value = await readRecord<unknown>(await database, ACTIVE_EXECUTION)
      return value === undefined ? null : WorkoutExecutionStartResponseSchema.parse(value)
    },

    async confirmStart(response) {
      const confirmed = WorkoutExecutionStartResponseSchema.parse(response)
      const db = await database
      const transaction = db.transaction(RECORDS, 'readwrite')
      const store = transaction.objectStore(RECORDS)
      const progress = parseProgress(await requestResult(store.get(progressKey(confirmed.execution.id))))
      if (progress.close) {
        await transactionDone(transaction)
        return
      }
      const pending = await requestResult(store.get(PENDING_START))
      if (pending && (pending.requestId !== confirmed.requestId || pending.deviceId !== confirmed.deviceId)) {
        transaction.abort()
        throw new Error('The confirmed start does not match the pending local request.')
      }
      putJsonRecord(store, confirmed, ACTIVE_EXECUTION)
      store.delete(PENDING_START)
      await transactionDone(transaction)
    },

    async clearPendingStart() {
      const db = await database
      const transaction = db.transaction(RECORDS, 'readwrite')
      transaction.objectStore(RECORDS).delete(PENDING_START)
      await transactionDone(transaction)
    },

    async getProgress(executionId) {
      const value = await readRecord<unknown>(await database, progressKey(executionId))
      return parseProgress(value)
    },

    async saveDraft(executionId, draft) {
      const db = await database
      const transaction = db.transaction(RECORDS, 'readwrite')
      const done = transactionDone(transaction)
      const records = transaction.objectStore(RECORDS)
      const progress = parseProgress(await requestResult(records.get(progressKey(executionId))))
      assertExecutionOpen(progress)
      if (!isDraft(draft)) throw new Error('El borrador no coincide con el formato local esperado.')
      putJsonRecord(records, { ...progress, draft }, progressKey(executionId))
      await done
    },

    async confirmResult(executionId, result, temporal) {
      const validatedResult = WorkoutResultSchema.parse(result)
      if (temporal !== undefined) assertTemporal(temporal)
      const db = await database
      const transaction = db.transaction(RECORDS, 'readwrite')
      const done = transactionDone(transaction)
      const records = transaction.objectStore(RECORDS)
      const key = progressKey(executionId)
      const progress = parseProgress(await requestResult(records.get(key)))
      assertExecutionOpen(progress)
      const existingId = progress.results.find(({ result: current }) => current.id === validatedResult.id)
      const temporalSnapshot = temporal ?? progress.temporal
      if (existingId) {
        if (!sameJson(existingId.result, validatedResult)) {
          transaction.abort()
          await done.catch(() => undefined)
          throw new Error('Este identificador ya pertenece a otro resultado.')
        }
        putJsonRecord(records, { ...progress, draft: null, temporal: temporalSnapshot }, key)
        await done
        return
      }
      const existingUnit = progress.results.find(({ result: current }) =>
        sameWorkoutUnit(current, validatedResult),
      )
      if (existingUnit) {
        transaction.abort()
        await done.catch(() => undefined)
        throw new Error('Esta unidad ya está confirmada en este dispositivo.')
      }
      putJsonRecord(
        records,
        {
          ...progress,
          draft: null,
          results: [...progress.results, { result: validatedResult, status: 'pending' }],
          temporal: temporalSnapshot,
        } satisfies WorkoutExecutionProgress,
        key,
      )
      await done
    },

    async saveTemporalState(executionId, temporal) {
      assertTemporal(temporal)
      const db = await database
      const transaction = db.transaction(RECORDS, 'readwrite')
      const done = transactionDone(transaction)
      const records = transaction.objectStore(RECORDS)
      const key = progressKey(executionId)
      const progress = parseProgress(await requestResult(records.get(key)))
      assertExecutionOpen(progress)
      putJsonRecord(records, { ...progress, temporal }, key)
      await done
    },

    async getPendingResults(executionId) {
      return (await this.getProgress(executionId)).results.filter(
        ({ status }) => status === 'pending' || status === 'syncing',
      )
    },

    async setResultStatus(executionId, resultId, status, error) {
      const db = await database
      const transaction = db.transaction(RECORDS, 'readwrite')
      const done = transactionDone(transaction)
      const records = transaction.objectStore(RECORDS)
      const key = progressKey(executionId)
      const progress = parseProgress(await requestResult(records.get(key)))
      const results = progress.results.map((entry) =>
        entry.result.id === resultId && entry.status !== 'synced'
          ? { result: entry.result, status, ...(error ? { error } : {}) }
          : entry,
      )
      putJsonRecord(records, { ...progress, results }, key)
      await done
    },

    async setCloseStatus(executionId, status, error) {
      const db = await database
      const transaction = db.transaction(RECORDS, 'readwrite')
      const done = transactionDone(transaction)
      const records = transaction.objectStore(RECORDS)
      const key = progressKey(executionId)
      const progress = parseProgress(await requestResult(records.get(key)))
      if (!progress.close) {
        transaction.abort()
        await done.catch(() => undefined)
        throw new Error('No hay un cierre local para sincronizar.')
      }
      if (progress.close.status === 'synced' && status !== 'synced') {
        await done
        return
      }
      const close = { ...progress.close, status, ...(error ? { error } : {}) }
      if (!error) delete close.error
      putJsonRecord(records, { ...progress, close }, key)
      await done
    },

    async confirmCloseSynced(executionId) {
      const db = await database
      const transaction = db.transaction(RECORDS, 'readwrite')
      const done = transactionDone(transaction)
      const records = transaction.objectStore(RECORDS)
      const key = progressKey(executionId)
      const progress = parseProgress(await requestResult(records.get(key)))
      if (!progress.close) {
        transaction.abort()
        await done.catch(() => undefined)
        throw new Error('No hay un cierre local para confirmar.')
      }
      const resultIds = new Set(progress.close.operation.payload.execution.results.map(({ id }) => id))
      const results = progress.results.map((entry) =>
        resultIds.has(entry.result.id) ? { result: entry.result, status: 'synced' as const } : entry,
      )
      putJsonRecord(
        records,
        {
          ...progress,
          results,
          close: { operation: progress.close.operation, status: 'synced' },
        },
        key,
      )
      const active = await requestResult(records.get(ACTIVE_EXECUTION))
      if (active?.execution?.id === executionId) records.delete(ACTIVE_EXECUTION)
      await done
    },

    async confirmCorrection(executionId, operation, result) {
      const db = await database
      const transaction = db.transaction(RECORDS, 'readwrite')
      const done = transactionDone(transaction)
      const records = transaction.objectStore(RECORDS)
      const key = progressKey(executionId)
      const progress = parseProgress(await requestResult(records.get(key)))
      if (
        !progress.close ||
        operation.executionId !== executionId ||
        operation.payload.correction.resultId !== result.id
      ) {
        transaction.abort()
        await done.catch(() => undefined)
        throw new Error('La corrección no coincide con el entrenamiento cerrado.')
      }
      const existing = progress.corrections.find(({ operationId }) => operationId === operation.operationId)
      if (existing && !sameJson(existing, operation)) {
        transaction.abort()
        await done.catch(() => undefined)
        throw new Error('El identificador de operación ya pertenece a otra corrección.')
      }
      const hasResult = progress.results.some(({ result: current }) => current.id === result.id)
      if (!hasResult) {
        transaction.abort()
        await done.catch(() => undefined)
        throw new Error('No se encontró el resultado local que se quiere corregir.')
      }
      const results = progress.results.map((entry) =>
        entry.result.id === result.id ? { ...entry, result } : entry,
      )
      putJsonRecord(
        records,
        {
          ...progress,
          results,
          corrections: existing ? progress.corrections : [...progress.corrections, operation],
        },
        key,
      )
      await done
    },

    async mergeServerResults(executionId, serverResults) {
      const db = await database
      const transaction = db.transaction(RECORDS, 'readwrite')
      const done = transactionDone(transaction)
      const records = transaction.objectStore(RECORDS)
      const key = progressKey(executionId)
      const progress = parseProgress(await requestResult(records.get(key)))
      if (progress.close) {
        await done
        return
      }
      const merged = [...progress.results]
      for (const result of serverResults) {
        const index = merged.findIndex(({ result: local }) => local.id === result.id)
        if (index < 0) merged.push({ result, status: 'synced' })
        else if (sameJson(merged[index].result, result)) merged[index] = { result, status: 'synced' }
        else
          merged[index] = {
            ...merged[index],
            status: 'conflict',
            error: 'El servidor devuelve otro contenido para este resultado.',
          }
      }
      putJsonRecord(records, { ...progress, results: merged }, key)
      await done
    },

    async saveReviewDraft(executionId, draft) {
      const db = await database
      const transaction = db.transaction(RECORDS, 'readwrite')
      const done = transactionDone(transaction)
      const records = transaction.objectStore(RECORDS)
      const key = progressKey(executionId)
      const progress = parseProgress(await requestResult(records.get(key)))
      assertExecutionOpen(progress)
      putJsonRecord(records, { ...progress, reviewDraft: parseReviewDraft(draft) }, key)
      await done
    },

    async closeExecution(executionInput, deviceId) {
      const db = await database
      const transaction = db.transaction(RECORDS, 'readwrite')
      const done = transactionDone(transaction)
      const records = transaction.objectStore(RECORDS)
      const start = WorkoutExecutionStartResponseSchema.parse(
        await requestResult(records.get(ACTIVE_EXECUTION)),
      )
      const executionId = executionInput.id
      if (start.execution.id !== executionId || start.deviceId !== deviceId) {
        transaction.abort()
        await done.catch(() => undefined)
        throw new Error('La ejecución no coincide con el dispositivo de origen.')
      }

      const key = progressKey(executionId)
      const progress = parseProgress(await requestResult(records.get(key)))
      if (progress.close) {
        await done
        return progress.close
      }
      assertExecutionOpen(progress)

      const resultsById = new Map(executionInput.results.map((result) => [result.id, result]))
      for (const entry of progress.results) {
        const existing = resultsById.get(entry.result.id)
        if (existing && !sameJson(existing, entry.result)) {
          transaction.abort()
          await done.catch(() => undefined)
          throw new Error('Un resultado local contradice el cierre que se va a guardar.')
        }
        resultsById.set(entry.result.id, entry.result)
      }

      const execution = WorkoutExecutionSchema.parse({
        ...executionInput,
        results: [...resultsById.values()],
      })
      const parsedOperation = WorkoutSyncOperationSchema.parse({
        operationType: 'close_execution',
        operationId: crypto.randomUUID(),
        executionId,
        deviceId,
        sequence: 1,
        payload: { execution },
      })
      if (parsedOperation.operationType !== 'close_execution') {
        transaction.abort()
        await done.catch(() => undefined)
        throw new Error('No se pudo preparar la operación de cierre.')
      }
      const operation = parsedOperation
      const close: StoredWorkoutClose = { operation, status: 'pending' }
      putJsonRecord(records, { ...progress, draft: null, reviewDraft: null, close }, key)
      await done
      return close
    },
  }
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(RECORDS)) request.result.createObjectStore(RECORDS)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Unable to open workout storage.'))
    request.onblocked = () => reject(new Error('Workout storage is blocked by another tab.'))
  })
}

async function readRecord<T>(database: IDBDatabase, key: string): Promise<T | undefined> {
  const transaction = database.transaction(RECORDS, 'readonly')
  const done = transactionDone(transaction)
  const value = await requestResult(transaction.objectStore(RECORDS).get(key))
  await done
  return value as T | undefined
}

function progressKey(executionId: string): string {
  return `${PROGRESS_PREFIX}${executionId}`
}

function parseProgress(value: unknown): WorkoutExecutionProgress {
  if (value === undefined) return emptyProgress()
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalidProgress('el registro principal no es un objeto')
  const candidate = value as Partial<WorkoutExecutionProgress>
  if (!Array.isArray(candidate.results)) throw invalidProgress('la lista de resultados no es válida')
  const results = candidate.results.map(parseStoredResult)
  if (candidate.draft !== null && candidate.draft !== undefined && !isDraft(candidate.draft))
    throw invalidProgress('el borrador no es válido')
  if (
    candidate.reviewDraft !== null &&
    candidate.reviewDraft !== undefined &&
    !isReviewDraft(candidate.reviewDraft)
  )
    throw invalidProgress('el borrador de cierre no es válido')
  if (candidate.close !== null && candidate.close !== undefined && !isStoredClose(candidate.close))
    throw invalidProgress('la operación de cierre no es válida')
  if (candidate.corrections !== undefined && !Array.isArray(candidate.corrections))
    throw invalidProgress('la lista de correcciones no es válida')
  const corrections = (candidate.corrections ?? []).map((correction) => {
    if (!isStoredCorrection(correction)) throw invalidProgress('una corrección no es válida')
    return correction
  })
  if (candidate.temporal !== undefined && !isTemporal(candidate.temporal))
    throw invalidProgress('el estado temporal no es válido')
  return {
    draft: candidate.draft ?? null,
    results,
    temporal: candidate.temporal ?? { status: 'in_progress', pauses: [] },
    reviewDraft: candidate.reviewDraft ?? null,
    close: candidate.close ?? null,
    corrections,
  }
}

function emptyProgress(): WorkoutExecutionProgress {
  return {
    draft: null,
    results: [],
    temporal: { status: 'in_progress', pauses: [] },
    reviewDraft: null,
    close: null,
    corrections: [],
  }
}

function putJsonRecord(store: IDBObjectStore, value: unknown, key: IDBValidKey): void {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) throw new Error('No se puede guardar un valor local vacío.')
  store.put(JSON.parse(serialized), key)
}

function assertExecutionOpen(progress: WorkoutExecutionProgress): void {
  if (progress.close) throw new Error('El entrenamiento ya está cerrado.')
}

function parseReviewDraft(value: WorkoutExecutionReviewDraft): WorkoutExecutionReviewDraft {
  return {
    ...(value.feeling ? { feeling: WorkoutFeelingSchema.parse(value.feeling) } : {}),
    ...(value.completionType
      ? { completionType: WorkoutCompletionTypeSchema.parse(value.completionType) }
      : {}),
    ...(value.observations?.trim() ? { observations: value.observations.trim().slice(0, 1000) } : {}),
    ...(value.closureReason?.trim() ? { closureReason: value.closureReason.trim().slice(0, 240) } : {}),
  }
}

function isReviewDraft(value: unknown): value is WorkoutExecutionReviewDraft {
  if (!value || typeof value !== 'object') return false
  const candidate = value as WorkoutExecutionReviewDraft
  return (
    (candidate.feeling === undefined || WorkoutFeelingSchema.safeParse(candidate.feeling).success) &&
    (candidate.completionType === undefined ||
      WorkoutCompletionTypeSchema.safeParse(candidate.completionType).success) &&
    (candidate.observations === undefined ||
      (typeof candidate.observations === 'string' && candidate.observations.length <= 1000)) &&
    (candidate.closureReason === undefined ||
      (typeof candidate.closureReason === 'string' && candidate.closureReason.length <= 240))
  )
}

function isStoredClose(value: unknown): value is StoredWorkoutClose {
  if (!value || typeof value !== 'object') return false
  const candidate = value as StoredWorkoutClose
  return (
    WorkoutSyncStatusSchema.safeParse(candidate.status).success &&
    WorkoutSyncOperationSchema.safeParse(candidate.operation).success &&
    candidate.operation.operationType === 'close_execution' &&
    (candidate.error === undefined || typeof candidate.error === 'string')
  )
}

function isStoredCorrection(value: unknown): value is CorrectResultOperation {
  return (
    WorkoutSyncOperationSchema.safeParse(value).success &&
    (value as CorrectResultOperation).operationType === 'correct_result'
  )
}

function parseStoredResult(value: unknown): StoredWorkoutResult {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalidProgress('un resultado no es un objeto')
  const item = value as Partial<StoredWorkoutResult>
  const result = WorkoutResultSchema.safeParse(item.result)
  if (
    !result.success ||
    !['pending', 'syncing', 'synced', 'conflict'].includes(String(item.status)) ||
    (item.error !== undefined && typeof item.error !== 'string')
  )
    throw invalidProgress('un resultado guardado no coincide con el contrato')
  return {
    result: result.data,
    status: item.status as StoredWorkoutResult['status'],
    ...(item.error ? { error: item.error } : {}),
  }
}

function isDraft(value: unknown): value is WorkoutSeriesDraft {
  if (!value || typeof value !== 'object') return false
  const draft = value as Partial<WorkoutSeriesDraft>
  return (
    (draft.type === undefined || ['sets', 'circuit', 'intervals'].includes(draft.type)) &&
    typeof draft.blockKey === 'string' &&
    typeof draft.plannedExerciseKey === 'string' &&
    (draft.actualExerciseKey === undefined || typeof draft.actualExerciseKey === 'string') &&
    (draft.round === undefined ||
      (Boolean(draft.round) &&
        ['planned', 'additional', 'amrap'].includes(draft.round.kind) &&
        Number.isInteger(draft.round.roundIndex) &&
        draft.round.roundIndex > 0 &&
        (draft.round.kind !== 'additional' || typeof draft.round.key === 'string'))) &&
    (draft.cycleIndex === undefined || (Number.isInteger(draft.cycleIndex) && draft.cycleIndex > 0)) &&
    (draft.phaseKey === undefined || typeof draft.phaseKey === 'string') &&
    Boolean(draft.fields && typeof draft.fields === 'object' && !Array.isArray(draft.fields)) &&
    Object.entries(draft.fields ?? {}).every(
      ([key, fieldValue]) =>
        ['reps', 'weightKg', 'durationSeconds', 'distanceMeters', 'rpe', 'calories'].includes(key) &&
        typeof fieldValue === 'string',
    ) &&
    (draft.unit === undefined ||
      (typeof draft.unit === 'object' &&
        (draft.unit.kind === 'planned' || draft.unit.kind === 'additional') &&
        Number.isInteger(draft.unit.setIndex) &&
        draft.unit.setIndex > 0 &&
        (draft.unit.kind !== 'additional' || typeof draft.unit.key === 'string')))
  )
}

function isTemporal(value: unknown): value is WorkoutExecutionTemporalState {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<WorkoutExecutionTemporalState>
  return (
    (candidate.status === 'in_progress' || candidate.status === 'paused') &&
    Array.isArray(candidate.pauses) &&
    candidate.pauses.every((pause) => WorkoutPauseSchema.safeParse(pause).success) &&
    (candidate.cursor === undefined || isCursor(candidate.cursor)) &&
    (candidate.timer === undefined || isTimer(candidate.timer)) &&
    (candidate.requiresWorkConfirmation === undefined ||
      typeof candidate.requiresWorkConfirmation === 'boolean') &&
    (candidate.workSecondsDraft === undefined ||
      (Number.isInteger(candidate.workSecondsDraft) && candidate.workSecondsDraft > 0)) &&
    (candidate.awaitManualAdvance === undefined || typeof candidate.awaitManualAdvance === 'boolean') &&
    (candidate.amrapFinished === undefined || typeof candidate.amrapFinished === 'boolean') &&
    (candidate.setAwaitingMetrics === undefined || typeof candidate.setAwaitingMetrics === 'boolean')
  )
}

function assertTemporal(value: unknown): asserts value is WorkoutExecutionTemporalState {
  if (!isTemporal(value)) throw new Error('El estado temporal no coincide con el formato local esperado.')
}

function isCursor(value: unknown): value is WorkoutExecutionCursor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const cursor = value as Partial<WorkoutExecutionCursor>
  if (cursor.type === 'sets')
    return (
      typeof cursor.blockKey === 'string' &&
      typeof cursor.plannedExerciseKey === 'string' &&
      Number.isInteger(cursor.setIndex) &&
      (cursor.setIndex ?? 0) > 0 &&
      (cursor.additionalKey === undefined || typeof cursor.additionalKey === 'string')
    )
  if (cursor.type === 'circuit')
    return (
      typeof cursor.blockKey === 'string' &&
      typeof cursor.plannedExerciseKey === 'string' &&
      Number.isInteger(cursor.roundIndex) &&
      (cursor.roundIndex ?? 0) > 0
    )
  return (
    cursor.type === 'intervals' &&
    typeof cursor.blockKey === 'string' &&
    Number.isInteger(cursor.cycleIndex) &&
    (cursor.cycleIndex ?? 0) > 0 &&
    typeof cursor.phaseKey === 'string'
  )
}

function isTimer(value: unknown): value is WorkoutTimerState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const timer = value as Partial<WorkoutTimerState>
  return (
    (timer.kind === 'rest' || timer.kind === 'work' || timer.kind === 'amrap') &&
    typeof timer.blockKey === 'string' &&
    typeof timer.startedAt === 'string' &&
    Number.isFinite(Date.parse(timer.startedAt)) &&
    Number.isInteger(timer.durationSeconds) &&
    (timer.durationSeconds ?? 0) > 0 &&
    Number.isFinite(timer.elapsedBeforeSegmentSeconds) &&
    (timer.elapsedBeforeSegmentSeconds ?? -1) >= 0 &&
    (timer.cycleIndex === undefined || (Number.isInteger(timer.cycleIndex) && timer.cycleIndex > 0)) &&
    (timer.phaseKey === undefined || typeof timer.phaseKey === 'string')
  )
}

function invalidProgress(reason: string): Error {
  return new Error(
    `El progreso local está dañado (${reason}). Los datos se conservaron; vuelve a intentarlo o solicita asistencia.`,
  )
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

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(sortJson(left)) === JSON.stringify(sortJson(right))
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortJson(nested)]),
  )
}

function parsePendingStart(value: unknown): PendingExecutionStart {
  if (!value || typeof value !== 'object' || !('createdAt' in value))
    throw new Error('The pending workout start record is invalid.')
  const request = WorkoutExecutionStartRequestSchema.parse(value)
  const createdAt = (value as { createdAt: unknown }).createdAt
  if (typeof createdAt !== 'string' || Number.isNaN(Date.parse(createdAt)))
    throw new Error('The pending workout start timestamp is invalid.')
  return { ...request, createdAt }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Workout storage request failed.'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('Workout storage transaction aborted.'))
    transaction.onerror = () => reject(transaction.error ?? new Error('Workout storage transaction failed.'))
  })
}
