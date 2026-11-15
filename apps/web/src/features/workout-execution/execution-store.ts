import {
  WorkoutExecutionStartRequestSchema,
  WorkoutExecutionStartResponseSchema,
  type WorkoutExecutionStartRequest,
  type WorkoutExecutionStartResponse,
} from '@trakia/contracts'

const DATABASE_NAME = 'trakia-workout-execution'
const DATABASE_VERSION = 1
const RECORDS = 'records'
const DEVICE_ID = 'deviceId'
const PENDING_START = 'pendingStart'
const ACTIVE_EXECUTION = 'activeExecution'

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
  }
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => request.result.createObjectStore(RECORDS)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Unable to open workout storage.'))
    request.onblocked = () => reject(new Error('Workout storage is blocked by another tab.'))
  })
}

async function readRecord<T>(database: IDBDatabase, key: string): Promise<T | undefined> {
  const transaction = database.transaction(RECORDS, 'readonly')
  const value = await requestResult(transaction.objectStore(RECORDS).get(key))
  await transactionDone(transaction)
  return value as T | undefined
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
