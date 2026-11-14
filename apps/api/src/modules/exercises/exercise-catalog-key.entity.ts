import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm'
import { Exercise } from './exercise.entity.js'

export const EXERCISE_CATALOG_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

@Entity({ name: 'exercise_catalog_keys' })
export class ExerciseCatalogKey {
  @PrimaryColumn({ type: 'varchar' })
  key!: string

  @Column({ name: 'exercise_id', type: 'uuid' })
  exerciseId!: string

  @ManyToOne(() => Exercise, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'exercise_id', referencedColumnName: 'id' })
  exercise!: Exercise
}
