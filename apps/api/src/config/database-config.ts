import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions.js'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface DatabaseEnvironment {
  DATABASE_URL?: string
  DATABASE_SSL?: string
  NODE_ENV?: string
  POSTGRES_DB?: string
  PGDATABASE?: string
  POSTGRES_USER?: string
  POSTGRES_PASSWORD?: string
}

export function getDatabaseConfig(
  env: DatabaseEnvironment = process.env,
  compiledDirectory = dirname(fileURLToPath(import.meta.url)),
): PostgresConnectionOptions {
  const databaseUrl = env.DATABASE_URL?.trim()
  if (!databaseUrl) throw new Error('DATABASE_URL is required and must be a valid PostgreSQL URL.')

  let parsed: URL
  try {
    parsed = new URL(databaseUrl)
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL.')
  }

  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !parsed.hostname ||
    !parsed.pathname.slice(1)
  ) {
    throw new Error(
      'DATABASE_URL must use postgres:// or postgresql:// and include a host and database name.',
    )
  }

  const sslValue = env.DATABASE_SSL?.trim().toLowerCase()
  if (sslValue && !['true', 'false'].includes(sslValue)) {
    throw new Error('DATABASE_SSL must be either "true" or "false".')
  }

  const sslEnabled = sslValue === undefined ? env.NODE_ENV === 'production' : sslValue === 'true'
  const sslMode = parsed.searchParams.get('sslmode')
  if (
    sslMode &&
    ((sslEnabled && ['disable', 'allow', 'prefer'].includes(sslMode)) ||
      (!sslEnabled && !['disable'].includes(sslMode)))
  ) {
    throw new Error('DATABASE_SSL conflicts with the sslmode option in DATABASE_URL.')
  }

  return {
    type: 'postgres',
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    database: decodeURIComponent(parsed.pathname.slice(1)),
    ...((env.POSTGRES_USER ?? parsed.username)
      ? { username: env.POSTGRES_USER ?? decodeURIComponent(parsed.username) }
      : {}),
    ...((env.POSTGRES_PASSWORD ?? parsed.password)
      ? { password: env.POSTGRES_PASSWORD ?? decodeURIComponent(parsed.password) }
      : {}),
    ssl: sslEnabled ? { rejectUnauthorized: true } : false,
    synchronize: false,
    migrationsRun: false,
    dropSchema: false,
    entities: [join(compiledDirectory, '../**/*.entity.js')],
    migrations: [join(compiledDirectory, '../database/migrations/*.js')],
    migrationsTableName: 'typeorm_migrations',
    logging: false,
  }
}
