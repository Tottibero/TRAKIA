const authorizedDatabase = 'trakia_test'
const allowedHosts = new Set(['localhost', '127.0.0.1', '::1', 'postgres'])

export function getIntegrationDatabaseUrl(env = process.env) {
  const value = env.TRAKIA_TEST_DATABASE_URL?.trim()
  if (!value) throw new Error('TRAKIA_TEST_DATABASE_URL is required; integration tests were not run.')

  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('TRAKIA_TEST_DATABASE_URL must be a valid PostgreSQL URL.')
  }

  let database
  try {
    database = decodeURIComponent(url.pathname.slice(1))
  } catch {
    throw new Error('TRAKIA_TEST_DATABASE_URL must name the authorized test database.')
  }

  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !allowedHosts.has(url.hostname.replace(/^\[|\]$/g, '')) ||
    database !== authorizedDatabase
  ) {
    throw new Error('Integration tests are authorized only for local PostgreSQL database trakia_test.')
  }

  return url
}

export function getIntegrationProcessEnvironment(env = process.env) {
  const databaseUrl = getIntegrationDatabaseUrl(env)
  const integrationEnv = {
    ...env,
    DATABASE_URL: databaseUrl.toString(),
    DATABASE_SSL: 'false',
  }

  delete integrationEnv.POSTGRES_DB
  delete integrationEnv.PGDATABASE
  delete integrationEnv.TRAKIA_DB_DIST

  return integrationEnv
}
