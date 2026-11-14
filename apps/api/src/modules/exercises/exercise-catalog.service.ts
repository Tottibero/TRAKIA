import { Injectable } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import {
  ExerciseDefinitionSchema,
  ExerciseSchema,
  type Exercise as ExerciseContract,
  type ExerciseDefinition,
  type ExerciseExternalReference,
} from '@trakia/contracts'
import { DataSource, EntityManager, QueryFailedError, Repository } from 'typeorm'
import { ExerciseCatalogKey, EXERCISE_CATALOG_KEY_PATTERN } from './exercise-catalog-key.entity.js'
import { Exercise } from './exercise.entity.js'

export type ExerciseDefinitionComparison =
  | { status: 'missing' }
  | { status: 'same'; exercise: ExerciseContract }
  | { status: 'conflict'; exercise: ExerciseContract }

export interface ExerciseCatalogKeyReference {
  key: string
  exerciseId: string
}

export class ExerciseCatalogConflictError extends Error {
  readonly code = 'EXERCISE_CATALOG_CONFLICT'

  constructor(readonly key: string) {
    super(`Exercise catalog key "${key}" is already assigned to a different definition.`)
    this.name = 'ExerciseCatalogConflictError'
  }
}

export class InvalidExerciseCatalogKeyError extends Error {
  constructor(readonly key: string) {
    super('Exercise catalog keys must be lowercase ASCII words separated by single hyphens.')
    this.name = 'InvalidExerciseCatalogKeyError'
  }
}

@Injectable()
export class ExerciseCatalogService {
  constructor(
    @InjectRepository(Exercise) private readonly exercises: Repository<Exercise>,
    @InjectRepository(ExerciseCatalogKey) private readonly keys: Repository<ExerciseCatalogKey>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async findByKey(key: string, manager?: EntityManager): Promise<ExerciseContract | null> {
    const catalogKey = await (manager?.getRepository(ExerciseCatalogKey) ?? this.keys).findOne({
      where: { key },
      relations: { exercise: true },
    })
    return catalogKey ? this.toContract(catalogKey.exercise, catalogKey.key) : null
  }

  async compareDefinition(
    input: ExerciseDefinition,
    manager?: EntityManager,
  ): Promise<ExerciseDefinitionComparison> {
    const definition = ExerciseDefinitionSchema.parse(input)
    const existing = await this.findByKey(definition.key, manager)
    if (!existing) return { status: 'missing' }
    return definitionsMatch(existing, definition)
      ? { status: 'same', exercise: existing }
      : { status: 'conflict', exercise: existing }
  }

  async createFromDefinition(
    input: ExerciseDefinition,
  ): Promise<{ exercise: ExerciseContract; created: boolean }> {
    const definition = ExerciseDefinitionSchema.parse(input)

    try {
      return await this.dataSource.transaction((manager) =>
        this.createFromDefinitionInTransaction(definition, manager),
      )
    } catch (error) {
      if (!isCatalogKeyUniqueViolation(error)) throw error
      const existing = await this.findByKey(definition.key)
      if (!existing) throw error
      return this.resolveExisting(
        { key: definition.key, exercise: await this.exercises.findOneByOrFail({ id: existing.id }) },
        definition,
      )
    }
  }

  /** Create or confirm an identical catalogue definition in the caller's transaction. */
  async createFromDefinitionInTransaction(
    input: ExerciseDefinition,
    manager: EntityManager,
  ): Promise<{ exercise: ExerciseContract; created: boolean }> {
    const definition = ExerciseDefinitionSchema.parse(input)
    const exercises = manager.getRepository(Exercise)
    const keys = manager.getRepository(ExerciseCatalogKey)
    const existingKey = await keys.findOne({ where: { key: definition.key }, relations: { exercise: true } })
    if (existingKey) return this.resolveExisting(existingKey, definition)

    const exercise = await exercises.save(
      exercises.create({
        name: definition.name,
        description: definition.description ?? null,
        category: definition.category,
        supportedMetrics: definition.supportedMetrics,
        externalReferences: definition.externalReferences ?? null,
      }),
    )
    try {
      await keys.save(keys.create({ key: definition.key, exerciseId: exercise.id }))
      return { exercise: this.toContract(exercise, definition.key), created: true }
    } catch (error) {
      if (isCatalogKeyUniqueViolation(error)) throw new ExerciseCatalogConflictError(definition.key)
      throw error
    }
  }

  async assignKey(exerciseId: string, key: string): Promise<ExerciseCatalogKeyReference> {
    validateKey(key)
    return this.dataSource
      .transaction(async (manager) => {
        const exercises = manager.getRepository(Exercise)
        const keys = manager.getRepository(ExerciseCatalogKey)
        const exercise = await exercises.findOneByOrFail({ id: exerciseId })
        const existing = await keys.findOne({ where: { key } })
        if (existing) {
          if (existing.exerciseId === exerciseId) return toKeyReference(existing)
          throw new ExerciseCatalogConflictError(key)
        }
        return toKeyReference(await keys.save(keys.create({ key, exerciseId, exercise })))
      })
      .catch(async (error: unknown) => {
        if (!isCatalogKeyUniqueViolation(error)) throw error
        const existing = await this.keys.findOne({ where: { key } })
        if (existing?.exerciseId === exerciseId) return toKeyReference(existing)
        throw new ExerciseCatalogConflictError(key)
      })
  }

  private resolveExisting(
    catalogKey: Pick<ExerciseCatalogKey, 'key' | 'exercise'>,
    definition: ExerciseDefinition,
  ): { exercise: ExerciseContract; created: false } {
    const exercise = this.toContract(catalogKey.exercise, catalogKey.key)
    if (!definitionsMatch(exercise, definition)) throw new ExerciseCatalogConflictError(definition.key)
    return { exercise, created: false }
  }

  private toContract(exercise: Exercise, key: string): ExerciseContract {
    return ExerciseSchema.parse({
      id: exercise.id,
      key,
      name: exercise.name,
      ...(exercise.description == null ? {} : { description: exercise.description }),
      category: exercise.category,
      supportedMetrics: exercise.supportedMetrics,
      ...(exercise.externalReferences == null ? {} : { externalReferences: exercise.externalReferences }),
    })
  }
}

function validateKey(key: string): void {
  if (!EXERCISE_CATALOG_KEY_PATTERN.test(key)) throw new InvalidExerciseCatalogKeyError(key)
}

function toKeyReference(catalogKey: ExerciseCatalogKey): ExerciseCatalogKeyReference {
  return { key: catalogKey.key, exerciseId: catalogKey.exerciseId }
}

function definitionsMatch(existing: ExerciseContract, incoming: ExerciseDefinition): boolean {
  return (
    existing.name === incoming.name &&
    existing.description === incoming.description &&
    existing.category === incoming.category &&
    sameSet(existing.supportedMetrics, incoming.supportedMetrics) &&
    sameSet(
      (existing.externalReferences ?? []).map(referenceIdentity),
      (incoming.externalReferences ?? []).map(referenceIdentity),
    )
  )
}

function referenceIdentity(reference: ExerciseExternalReference): string {
  if (reference.provider === 'wger') return `wger:${reference.externalId}`
  return `youtube:${youtubeVideoId(reference.videoUrl)}`
}

function youtubeVideoId(value: string): string {
  const url = new URL(value)
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  if (host === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] ?? ''
  if (url.pathname === '/watch') return url.searchParams.get('v') ?? ''
  return url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1] ?? ''
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    new Set(left).size === new Set(right).size &&
    left.every((item) => right.includes(item))
  )
}

function isCatalogKeyUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false
  const driverError = error.driverError as { code?: string; constraint?: string }
  return driverError.code === '23505' && driverError.constraint === 'pk_exercise_catalog_keys'
}
