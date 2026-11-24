import type { MigrationInterface, QueryRunner } from 'typeorm'

export class AddWorkoutExecutionCircuitRounds1795737600000 implements MigrationInterface {
  name = 'AddWorkoutExecutionCircuitRounds1795737600000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workout_executions" ADD "circuit_rounds" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "workout_executions" DROP COLUMN "circuit_rounds"')
  }
}
