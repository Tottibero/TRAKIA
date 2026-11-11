import { getIntegrationDatabaseUrl } from '../../../scripts/integration-database.mjs'
import dataSource from '../dist/database/data-source.js'

const expectedDatabase = decodeURIComponent(getIntegrationDatabaseUrl().pathname.slice(1))
const configuredDatabase = dataSource.options.database

if (configuredDatabase !== expectedDatabase) {
  console.error('Resolved TypeORM database does not match the authorized integration database.')
  process.exit(1)
}

try {
  await dataSource.initialize()
  const [{ database }] = await dataSource.query('SELECT current_database() AS database')

  if (database !== expectedDatabase) {
    throw new Error('Connected PostgreSQL database does not match the authorized integration database.')
  }

  console.log(`Verified effective integration database: ${database}`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  if (dataSource.isInitialized) await dataSource.destroy()
}
