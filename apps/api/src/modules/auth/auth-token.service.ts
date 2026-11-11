import { Injectable, UnauthorizedException } from '@nestjs/common'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { getJwtSecret, JWT_AUDIENCE, JWT_ISSUER, JWT_LIFETIME_SECONDS } from '../../config/runtime-config.js'

interface AuthClaims {
  sub: string
  sessionVersion: number
  iat: number
  exp: number
  iss: string
  aud: string
}

const encode = (value: string): string => Buffer.from(value).toString('base64url')
const decode = (value: string): string => Buffer.from(value, 'base64url').toString('utf8')

@Injectable()
export class AuthTokenService {
  private readonly secret = getJwtSecret()

  issue(userId: string, sessionVersion: number, now = Math.floor(Date.now() / 1000)): string {
    const header = encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    const payload = encode(
      JSON.stringify({
        sub: userId,
        sessionVersion,
        iat: now,
        exp: now + JWT_LIFETIME_SECONDS,
        iss: JWT_ISSUER,
        aud: JWT_AUDIENCE,
      } satisfies AuthClaims),
    )
    const body = `${header}.${payload}`
    return `${body}.${this.sign(body)}`
  }

  verify(token: string, now = Math.floor(Date.now() / 1000)): AuthClaims {
    try {
      const parts = token.split('.')
      if (parts.length !== 3) throw new Error()
      const [headerPart, payloadPart, signature] = parts as [string, string, string]
      const header = JSON.parse(decode(headerPart)) as { alg?: string; typ?: string }
      if (header.alg !== 'HS256' || header.typ !== 'JWT') throw new Error()
      const expected = this.sign(`${headerPart}.${payloadPart}`)
      const actualBytes = Buffer.from(signature)
      const expectedBytes = Buffer.from(expected)
      if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) {
        throw new Error()
      }
      const claims = JSON.parse(decode(payloadPart)) as Partial<AuthClaims>
      if (
        typeof claims.sub !== 'string' ||
        !claims.sub ||
        !Number.isSafeInteger(claims.sessionVersion) ||
        (claims.sessionVersion as number) < 0 ||
        !Number.isSafeInteger(claims.iat) ||
        !Number.isSafeInteger(claims.exp) ||
        (claims.exp as number) <= now ||
        claims.iss !== JWT_ISSUER ||
        claims.aud !== JWT_AUDIENCE
      )
        throw new Error()
      return claims as AuthClaims
    } catch {
      throw new UnauthorizedException('Authentication required.')
    }
  }

  private sign(value: string): string {
    return createHmac('sha256', this.secret).update(value).digest('base64url')
  }
}
