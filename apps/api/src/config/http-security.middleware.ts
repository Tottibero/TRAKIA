import { Injectable, type NestMiddleware } from '@nestjs/common'

interface HttpRequest {
  method: string
  path: string
  ip: string
  get(name: string): string | undefined
}

interface HttpResponse {
  setHeader(name: string, value: string): void
  status(code: number): HttpResponse
  json(body: unknown): void
}

const ONE_MINUTE_MS = 60_000
const LOGIN_LIMIT = 5
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

@Injectable()
export class HttpSecurityMiddleware implements NestMiddleware {
  private readonly loginAttempts = new Map<string, number[]>()

  constructor(private readonly allowedOrigins: string[]) {}

  use = (request: HttpRequest, response: HttpResponse, next: () => void): void => {
    if (request.method === 'OPTIONS') {
      next()
      return
    }

    if (UNSAFE_METHODS.has(request.method)) {
      const origin = request.get('origin')
      if (!origin || !this.allowedOrigins.includes(origin)) {
        response.status(403).json({ statusCode: 403, message: 'Origin not allowed.' })
        return
      }
      if (request.get('x-trakia-csrf') !== '1') {
        response.status(403).json({ statusCode: 403, message: 'CSRF validation failed.' })
        return
      }
    }

    if (request.method === 'POST' && request.path === '/api/auth/login') {
      const now = Date.now()
      if (this.loginAttempts.size > 10_000) {
        for (const [ip, attempts] of this.loginAttempts) {
          if (attempts.every((attempt) => now - attempt >= ONE_MINUTE_MS)) this.loginAttempts.delete(ip)
        }
      }
      const recent = (this.loginAttempts.get(request.ip) ?? []).filter(
        (attempt) => now - attempt < ONE_MINUTE_MS,
      )
      if (recent.length >= LOGIN_LIMIT) {
        response.setHeader(
          'Retry-After',
          String(Math.max(1, Math.ceil((ONE_MINUTE_MS - (now - recent[0]!)) / 1000))),
        )
        response.status(429).json({ statusCode: 429, message: 'Too many login attempts.' })
        this.loginAttempts.set(request.ip, recent)
        return
      }
      recent.push(now)
      this.loginAttempts.set(request.ip, recent)
    }

    next()
  }
}
