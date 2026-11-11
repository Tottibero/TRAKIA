import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 320 })
  email!: string

  @Column({ name: 'password_hash', type: 'varchar', length: 255, select: false })
  passwordHash!: string

  @Column({ name: 'session_version', type: 'integer', default: 0 })
  sessionVersion = 0

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date

  @BeforeInsert()
  @BeforeUpdate()
  normalizeEmail(): void {
    this.email = normalizeEmail(this.email)
  }
}
