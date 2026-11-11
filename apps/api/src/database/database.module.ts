import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { getDatabaseConfig } from '../config/database-config.js'

@Module({
  imports: [TypeOrmModule.forRootAsync({ useFactory: () => ({ ...getDatabaseConfig(), autoLoadEntities: true }) })],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
