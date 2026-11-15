import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type {
  CloseExecutionOperation,
  CorrectResultOperation,
  WorkoutExecutionSnapshot,
  WorkoutResult,
  WorkoutStatus,
} from '@trakia/contracts'

@Entity({ name: 'workout_executions' })
@Index('uq_workout_executions_user_request', ['userId', 'requestId'], {
  unique: true,
  where: '"request_id" IS NOT NULL',
})
@Index('uq_workout_executions_open_user', ['userId'], {
  unique: true,
  where: '"user_id" IS NOT NULL AND "status" IN (\'in_progress\', \'paused\')',
})
@Check(
  'ck_workout_executions_start_identity',
  '("request_id" IS NULL AND "device_id" IS NULL AND "user_id" IS NULL AND "plan_id" IS NULL AND "session_id" IS NULL) OR ("request_id" IS NOT NULL AND "device_id" IS NOT NULL AND "user_id" IS NOT NULL AND "plan_id" IS NOT NULL AND "session_id" IS NOT NULL AND "snapshot" IS NOT NULL)',
)
export class WorkoutExecutionRecord {
  @PrimaryGeneratedColumn('uuid') id!: string

  @Column({ name: 'user_id', type: 'uuid', nullable: true }) userId!: string | null
  @Column({ name: 'device_id', type: 'uuid', nullable: true }) deviceId!: string | null
  @Column({ name: 'request_id', type: 'uuid', nullable: true }) requestId!: string | null
  @Column({ name: 'plan_id', type: 'uuid', nullable: true }) planId!: string | null
  @Column({ name: 'session_id', type: 'uuid', nullable: true }) sessionId!: string | null
  @Column({ name: 'plan_key', type: 'varchar' }) planKey!: string
  @Column({ name: 'session_key', type: 'varchar' }) sessionKey!: string
  @Column({ type: 'jsonb', nullable: true }) snapshot!: WorkoutExecutionSnapshot | null
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" }) results!: WorkoutResult[]
  @Column({ name: 'close_operation', type: 'jsonb', nullable: true })
  closeOperation!: CloseExecutionOperation | null
  @Column({ name: 'correction_operations', type: 'jsonb', default: () => "'[]'::jsonb" })
  correctionOperations!: CorrectResultOperation[]
  @Column({ type: 'varchar' }) status!: WorkoutStatus
  @Column({ name: 'started_at', type: 'timestamptz' }) startedAt!: Date
  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true }) finishedAt!: Date | null
}
