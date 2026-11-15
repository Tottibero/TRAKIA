import {
  WorkoutExecutionStartRequestSchema,
  WorkoutExecutionStartResponseSchema,
  type ActualMetrics,
  type WorkoutResult,
  type SetResult,
  type WorkoutExecutionStartRequest,
  type WorkoutExecutionStartResponse,
} from '@trakia/contracts'

const DATABASE_NAME = 'trakia-workout-execution'
const DATABASE_VERSION = 2
const RECORDS = 'records'
const DEVICE_ID = 'deviceId'
const PENDING_START = 'pendingStart'
const ACTIVE_EXECUTION = 'activeExecution'
const PROGRESS_PREFIX = 'progress:'

export type WorkoutSeriesDraft = {
  blockKey: string
  plannedExerciseKey: string
  unit: SetResult['unit']
  actualExerciseKey: string
  fields: Partial<Record<keyof ActualMetrics, string>>
}

export type StoredWorkoutResult = {
  result: WorkoutResult
  status: 'pending' | 'syncing' | 'synced' | 'conflict'
  error?: string
}

export type WorkoutExecutionProgress = {
  draft: WorkoutSeriesDraft | null
  results: StoredWorkoutResult[]
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
  confirmResult(executionId: string, result: SetResult): Promise<void>
  getPendingResults(executionId: string): Promise<StoredWorkoutResult[]>
  setResultStatus(
    executionId: string,
    resultId: string,
    status: StoredWorkoutResult['status'],
    error?: string,
  ): Promise<void>
  mergeServerResults(executionId: string, results: WorkoutResult[]): Promise<void>
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
      store.put(deviceId, DEVICE_ID)
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
      store.put(deviceId, DEVICE_ID)
      store.put(stored, PENDING_START)
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
      const pending = await requestResult(store.get(PENDING_START))
      if (pending && (pending.requestId !== confirmed.requestId || pending.deviceId !== confirmed.deviceId)) {
        transaction.abort()
        throw new Error('The confirmed start does not match the pending local request.')
      }
      store.put(confirmed, ACTIVE_EXECUTION)
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
      records.put({ ...progress, draft }, progressKey(executionId))
      await done
    },

    async confirmResult(executionId, result) {
      const db = await database
      const transaction = db.transaction(RECORDS, 'readwrite')
      const done = transactionDone(transaction)
      const records = transaction.objectStore(RECORDS)
      const key = progressKey(executionId)
      const progress = parseProgress(await requestResult(records.get(key)))
      const existingId = progress.results.find(({ result: current }) => current.id === result.id)
      if (existingId) {
        if (!sameJson(existingId.result, result)) {
          transaction.abort()
          await done.catch(() => undefined)
          throw new Error('Este identificador ya pertenece a otro resultado.')
        }
        records.put({ ...progress, draft: null }, key)
        await done
        return
      }
      const existingUnit = progress.results.find(({ result: current }) => sameSetUnit(current, result))
      if (existingUnit) {
        transaction.abort()
        await done.catch(() => undefined)
        throw new Error('Esta serie ya está confirmada en este dispositivo.')
      }
      records.put(
        {
          draft: null,
          results: [...progress.results, { result, status: 'pending' }],
        } satisfies WorkoutExecutionProgress,
        key,
      )
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
        entry.result.id === resultId ? { result: entry.result, status, ...(error ? { error } : {}) } : entry,
      )
      records.put({ ...progress, results }, key)
      await done
    },

    async mergeServerResults(executionId, serverResults) {
      const db = await database
      const transaction = db.transaction(RECORDS, 'readwrite')
      const done = transactionDone(transaction)
      const records = transaction.objectStore(RECORDS)
      const key = progressKey(executionId)
      const progress = parseProgress(await requestResult(records.get(key)))
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
      records.put({ ...progress, results: merged }, key)
      await done
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
  if (!value || typeof value !== 'object') return { draft: null, results: [] }
  const candidate = value as Partial<WorkoutExecutionProgress>
  const results = Array.isArray(candidate.results) ? candidate.results.filter(isStoredResult) : []
  return {
    draft: isDraft(candidate.draft) ? candidate.draft : null,
    results,
  }
}

function isStoredResult(value: unknown): value is StoredWorkoutResult {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<StoredWorkoutResult>
  return (
    Boolean(item.result && typeof item.result === 'object') &&
    ['pending', 'syncing', 'synced', 'conflict'].includes(String(item.status))
  )
}

function isDraft(value: unknown): value is WorkoutSeriesDraft {
  if (!value || typeof value !== 'object') return false
  const draft = value as Partial<WorkoutSeriesDraft>
  return (
    typeof draft.blockKey === 'string' &&
    typeof draft.plannedExerciseKey === 'string' &&
    typeof draft.actualExerciseKey === 'string' &&
    Boolean(draft.unit && typeof draft.unit === 'object') &&
    Boolean(draft.fields && typeof draft.fields === 'object')
  )
}

function sameSetUnit(left: WorkoutResult, right: SetResult): boolean {
  if (left.type !== 'sets') return false
  return (
    left.blockKey === right.blockKey &&
    left.plannedExerciseKey === right.plannedExerciseKey &&
    left.unit.kind === right.unit.kind &&
    left.unit.setIndex === right.unit.setIndex &&
    (left.unit.kind !== 'additional' ||
      (right.unit.kind === 'additional' && left.unit.key === right.unit.key))
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
