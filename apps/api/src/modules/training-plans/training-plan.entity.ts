import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

@Entity({ name: 'training_plans' })
@Index('uq_training_plans_key', ['key'], { unique: true })
@Index('uq_training_plans_origin_key', ['origin', 'key'], { unique: true })
@Check('ck_training_plans_key_format', `"key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`)
@Check('ck_training_plans_period', '"start_date" <= "end_date"')
@Check('ck_training_plans_version', '"version" > 0')
export class TrainingPlan {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar' }) origin!: string
  @Column({ type: 'varchar' }) key!: string
  @Column({ type: 'varchar' }) name!: string
  @Column({ type: 'text', nullable: true }) description!: string | null
  @Column({ name: 'start_date', type: 'date' }) startDate!: string
  @Column({ name: 'end_date', type: 'date' }) endDate!: string
  @Column({ type: 'integer', default: 1 }) version!: number
}

@Entity({ name: 'training_plan_entries' })
@Index('uq_training_plan_entries_key', ['planId', 'key'], { unique: true })
@Index('uq_training_plan_entries_rest_date', ['planId', 'date'], {
  unique: true,
  where: `"type" = 'rest'`,
})
@Check('ck_training_plan_entries_type', `"type" IN ('session', 'rest')`)
@Check('ck_training_plan_entries_key_format', `"key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`)
export class TrainingPlanEntry {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ name: 'plan_id', type: 'uuid' }) planId!: string
  @Column({ type: 'varchar' }) type!: 'session' | 'rest'
  @Column({ type: 'varchar' }) key!: string
  @Column({ type: 'date' }) date!: string
}

@Entity({ name: 'training_plan_blocks' })
@Index('uq_training_plan_blocks_key', ['sessionId', 'key'], { unique: true })
@Index('uq_training_plan_blocks_position', ['sessionId', 'position'], { unique: true })
@Check('ck_training_plan_blocks_type', `"type" IN ('sets', 'circuit', 'intervals')`)
export class TrainingPlanBlock {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ name: 'session_id', type: 'uuid' }) sessionId!: string
  @Column({ type: 'varchar' }) key!: string
  @Column({ type: 'integer' }) position!: number
  @Column({ type: 'varchar' }) type!: 'sets' | 'circuit' | 'intervals'
  @Column({ type: 'varchar', nullable: true }) mode!: string | null
  @Column({ type: 'integer', nullable: true }) count!: number | null
  @Column({ name: 'rest_seconds', type: 'integer', nullable: true }) restSeconds!: number | null
  @Column({ type: 'jsonb', nullable: true }) settings!: Record<string, unknown> | null
}

@Entity({ name: 'training_plan_phases' })
@Index('uq_training_plan_phases_key', ['blockId', 'key'], { unique: true })
@Index('uq_training_plan_phases_position', ['blockId', 'position'], { unique: true })
@Check('ck_training_plan_phases_type', `"type" IN ('work', 'rest')`)
@Check('ck_training_plan_phases_window', '"window_seconds" > 0')
export class TrainingPlanPhase {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ name: 'block_id', type: 'uuid' }) blockId!: string
  @Column({ type: 'varchar' }) key!: string
  @Column({ type: 'integer' }) position!: number
  @Column({ type: 'varchar' }) type!: 'work' | 'rest'
  @Column({ name: 'window_seconds', type: 'integer' }) windowSeconds!: number
}

@Entity({ name: 'training_plan_appearances' })
@Index('uq_training_plan_appearances_key', ['blockId', 'key'], { unique: true })
@Check(
  'ck_training_plan_appearances_role',
  `("role" = 'main' AND "parent_appearance_id" IS NULL) OR ("role" = 'alternative' AND "parent_appearance_id" IS NOT NULL)`,
)
export class TrainingPlanAppearance {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ name: 'block_id', type: 'uuid' }) blockId!: string
  @Column({ name: 'phase_id', type: 'uuid', nullable: true }) phaseId!: string | null
  @Column({ type: 'varchar' }) key!: string
  @Column({ type: 'integer' }) position!: number
  @Column({ type: 'varchar' }) role!: 'main' | 'alternative'
  @Column({ name: 'parent_appearance_id', type: 'uuid', nullable: true }) parentAppearanceId!: string | null
  @Column({ name: 'exercise_id', type: 'uuid' }) exerciseId!: string
  @Column({ type: 'jsonb', nullable: true }) targets!: Record<string, number> | null
  @Column({ name: 'target_overrides', type: 'jsonb', nullable: true }) targetOverrides!: Record<
    string,
    number | null
  > | null
  @Column({ type: 'jsonb', nullable: true }) settings!: Record<string, unknown> | null
}
