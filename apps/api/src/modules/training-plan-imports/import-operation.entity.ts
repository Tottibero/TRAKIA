import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

@Entity({ name: 'training_plan_import_operations' })
@Index('uq_training_plan_import_operations_owner_id', ['ownerId', 'operationId'], { unique: true })
@Index('ix_training_plan_import_operations_expires_at', ['expiresAt'])
@Check('ck_training_plan_import_operations_hash', '"content_hash" ~ \'^[a-f0-9]{64}$\'')
export class TrainingPlanImportOperation {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ name: 'owner_id', type: 'uuid' }) ownerId!: string
  @Column({ name: 'operation_id', type: 'uuid' }) operationId!: string
  @Column({ name: 'content_hash', type: 'varchar', length: 64 }) contentHash!: string
  @Column({ type: 'jsonb' }) result!: Record<string, unknown>
  @Column({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date
}
