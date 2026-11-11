const DEFAULT_PORT = 3033
const DEFAULT_CORS_ORIGINS = ['http://localhost:5173']
export const JWT_ISSUER = 'trakia-api'
export const JWT_AUDIENCE = 'trakia-web'
export const JWT_LIFETIME_SECONDS = 12 * 60 * 60

export function getJwtSecret(value: string | undefined = process.env.JWT_SECRET): string {
  if (!value || Buffer.byteLength(value, 'utf8') < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 bytes.')
  }
  return value
}

export function getPort(value: string | undefined = process.env.PORT): number {
  if (value === undefined) return DEFAULT_PORT

  if (!/^\d+$/.test(value)) {
    throw new Error('PORT must be an integer between 1 and 65535.')
  }

  const port = Number(value)

  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.')
  }

  return port
}

export function getCorsOrigins(value: string | undefined = process.env.CORS_ORIGINS): string[] {
  if (value === undefined) return DEFAULT_CORS_ORIGINS

  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  if (origins.length === 0) {
    throw new Error('CORS_ORIGINS must contain at least one allowed origin.')
  }

  return origins
}
