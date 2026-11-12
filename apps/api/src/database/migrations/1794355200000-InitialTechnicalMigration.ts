import type { MigrationInterface, QueryRunner } from 'typeorm'

export class InitialTechnicalMigration1794355200000 implements MigrationInterface {
  name = 'InitialTechnicalMigration1794355200000'

  async up(_queryRunner: QueryRunner): Promise<void> {}

  async down(_queryRunner: QueryRunner): Promise<void> {}
}
