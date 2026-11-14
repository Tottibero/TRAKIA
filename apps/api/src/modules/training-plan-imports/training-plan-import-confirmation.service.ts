import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { validateTrainingPlanImportDocument, type ImportValidationIssue } from '@trakia/contracts'
import { DataSource, EntityManager } from 'typeorm'
import { ExerciseCatalogConflictError, ExerciseCatalogService } from '../exercises/exercises.module.js'
import {
  TrainingPlanKeyConflictError,
  TrainingPlanService,
  TrainingPlanVersionConflictError,
} from '../training-plans/training-plans.module.js'
import { WorkoutExecutionProtectionService } from '../workouts/workouts.module.js'
import { TrainingPlanImportReviewService, proposalHash } from './training-plan-import-review.service.js'
import {
  canonicalJson,
  ImportReviewReceiptService,
  InvalidImportReviewReceiptError,
  sha256,
} from './import-review-receipt.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000

export interface ImportConfirmationResult {
  status: 'confirmed' | 'unchanged'
  operationId: string
  planId: string
  version: number
  changes: Array<{ kind: string; key: string; status: string }>
}

export class ImportConfirmationConflictError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly conflicts: unknown[] = [],
  ) {
    super(message)
    this.name = 'ImportConfirmationConflictError'
  }
}

export class InvalidImportConfirmationError extends Error {
  constructor(readonly issues: ImportValidationIssue[]) {
    super('The training plan import document is invalid.')
    this.name = 'InvalidImportConfirmationError'
  }
}

@Injectable()
export class TrainingPlanImportConfirmationService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly review: TrainingPlanImportReviewService,
    private readonly exercises: ExerciseCatalogService,
    private readonly plans: TrainingPlanService,
    private readonly workouts: WorkoutExecutionProtectionService,
    private readonly receipts: ImportReviewReceiptService,
  ) {}

  async confirm(
    userId: string,
    origin: string,
    input: unknown,
    reviewToken: string,
    operationId: string,
    now = new Date(),
  ): Promise<ImportConfirmationResult> {
    if (!UUID_PATTERN.test(userId)) throw new TypeError('userId must be an authenticated UUID.')
    if (!UUID_PATTERN.test(operationId)) throw new TypeError('operationId must be a UUID.')
    const validation = validateTrainingPlanImportDocument(input)
    if (!validation.success) throw new InvalidImportConfirmationError(validation.issues)
    if (!origin.trim() || origin !== origin.trim())
      throw new TypeError('origin must be non-empty and trimmed.')
    const document = validation.document
    const documentHash = sha256(canonicalJson(document))
    const contentHash = sha256(canonicalJson({ origin, document }))

    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `trakia:training-plan-import:operation:${userId}:${operationId}`,
      ])
      await purgeExpiredOperations(manager, now)

      const previous = (await manager.query(
        `SELECT content_hash AS "contentHash", result
         FROM training_plan_import_operations
         WHERE owner_id = $1 AND operation_id = $2 FOR UPDATE`,
        [userId, operationId],
      )) as Array<{ contentHash: string; result: ImportConfirmationResult }>
      if (previous.length) {
        if (previous[0]!.contentHash !== contentHash)
          throw new ImportConfirmationConflictError(
            'OPERATION_ID_CONTENT_MISMATCH',
            'operationId was already used with different content.',
          )
        return previous[0]!.result
      }

      const claims = this.receipts.verify(reviewToken, now.getTime())
      if (
        claims.userId !== userId ||
        claims.origin !== origin ||
        claims.planKey !== document.plan.key ||
        claims.documentHash !== documentHash
      )
        throw new InvalidImportReviewReceiptError()

      const existing = await this.plans.findForImport(origin, document.plan.key, manager)
      const sessionKeys = new Set(
        document.plan.days.filter((day) => day.type === 'session').map(({ key }) => key),
      )
      for (const day of existing?.definition.days ?? []) if (day.type === 'session') sessionKeys.add(day.key)
      await this.workouts.acquireSessionLocks(manager, document.plan.key, [...sessionKeys])
      this.receipts.verify(reviewToken, Math.max(now.getTime(), Date.now()))

      const current = await this.review.reviewInTransaction(origin, document, manager, now)
      if (!current.valid) throw new InvalidImportConfirmationError(current.issues)
      if (!current.confirmable)
        throw new ImportConfirmationConflictError(
          current.conflicts[0]?.code ?? 'IMPORT_CONFLICT',
          'The import can no longer be confirmed; review it again.',
          current.conflicts,
        )
      if (current.plan?.version !== claims.planVersion || proposalHash(current) !== claims.proposalHash)
        throw new ImportConfirmationConflictError(
          'STALE_IMPORT_REVIEW',
          'The imported data or persisted state changed after review; review it again.',
        )

      try {
        for (const definition of document.exercises) {
          const change = current.changes.find(
            ({ kind, key }) => kind === 'exercise' && key === definition.key,
          )
          if (change?.status === 'created')
            await this.exercises.createFromDefinitionInTransaction(definition, manager)
        }

        let planId = current.plan?.id
        let version = current.plan?.version
        const planChange = current.changes.find(({ kind }) => kind === 'plan')
        if (planChange?.status === 'created') {
          const saved = await this.plans.createForImport(origin, current.plan!.definition, manager)
          planId = saved.id
          version = saved.version
        } else if (planChange?.status === 'modified') {
          const saved = await this.plans.updateForImport(
            origin,
            document.plan.key,
            current.plan!.version!,
            current.plan!.definition,
            manager,
          )
          planId = saved.id
          version = saved.version
        }
        if (!planId || !version) throw new Error('A confirmed import must resolve to a persisted plan.')

        const result: ImportConfirmationResult = {
          status: current.changes.some(({ status }) => status === 'created' || status === 'modified')
            ? 'confirmed'
            : 'unchanged',
          operationId,
          planId,
          version,
          changes: current.changes.map(({ kind, key, status }) => ({ kind, key, status })),
        }
        const createdAt = new Date(now.getTime())
        await manager.query(
          `INSERT INTO training_plan_import_operations
           (owner_id, operation_id, content_hash, result, created_at, expires_at)
           VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
          [
            userId,
            operationId,
            contentHash,
            JSON.stringify(result),
            createdAt,
            new Date(now.getTime() + RETENTION_MS),
          ],
        )
        return result
      } catch (error) {
        if (error instanceof TrainingPlanVersionConflictError)
          throw new ImportConfirmationConflictError('STALE_PLAN_VERSION', error.message)
        if (error instanceof TrainingPlanKeyConflictError || error instanceof ExerciseCatalogConflictError)
          throw new ImportConfirmationConflictError('CONCURRENT_CATALOG_OR_PLAN_CHANGE', error.message)
        throw error
      }
    })
  }
}

async function purgeExpiredOperations(manager: EntityManager, now: Date): Promise<void> {
  await manager.query(
    `WITH expired AS (
       SELECT id FROM training_plan_import_operations
       WHERE expires_at <= $1 ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED
     )
     DELETE FROM training_plan_import_operations operations
     USING expired WHERE operations.id = expired.id`,
    [now],
  )
}
