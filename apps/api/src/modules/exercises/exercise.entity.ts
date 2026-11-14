import { Check, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { ExerciseCategory, ExerciseExternalReference, ExerciseMetric } from '@trakia/contracts'

@Entity({ name: 'exercises' })
@Check('ck_exercises_category', `"category" IN ('strength', 'cardio', 'functional', 'mobility', 'other')`)
@Check(
  'ck_exercises_supported_metrics',
  `cardinality("supported_metrics") > 0 AND "supported_metrics" <@ ARRAY['reps', 'weight', 'duration', 'distance', 'rpe', 'calories']::varchar[]`,
)
@Check('ck_exercises_name_nonempty', 'length(btrim("name")) > 0')
export class Exercise {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar' })
  name!: string

  @Column({ type: 'text', nullable: true })
  description?: string | null

  @Column({ type: 'varchar' })
  category!: ExerciseCategory

  @Column({ name: 'supported_metrics', type: 'varchar', array: true })
  supportedMetrics!: ExerciseMetric[]

  @Column({ name: 'external_references', type: 'jsonb', nullable: true })
  externalReferences?: ExerciseExternalReference[] | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date
}
