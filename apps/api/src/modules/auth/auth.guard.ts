import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { IS_PUBLIC } from '../../config/public-route.decorator.js'
import { AuthTokenService } from './auth-token.service.js'
import { UsersService } from '../users/users.module.js'

export interface AuthenticatedRequest {
  headers: { cookie?: string }
  authUserId?: string
}

export interface CookieResponse {
  clearCookie(name: string, options: ReturnType<typeof cookieOptions>): void
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AuthTokenService,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]))
      return true

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const response = context.switchToHttp().getResponse<CookieResponse>()
    const token = readCookie(request.headers.cookie, cookieName())
    if (!token) throw new UnauthorizedException('Authentication required.')
    const claims = this.tokens.verify(token)
    const user = await this.users.findById(claims.sub)
    if (!user || user.sessionVersion !== claims.sessionVersion) {
      response.clearCookie(cookieName(), cookieOptions())
      throw new UnauthorizedException('Authentication required.')
    }
    request.authUserId = user.id
    return true
  }
}

export function cookieName(): string {
  return process.env.NODE_ENV === 'production' ? '__Host-trakia_session' : 'trakia_session'
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60 * 1000,
  }
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of header?.split(';') ?? []) {
    const separator = part.indexOf('=')
    if (separator > 0 && part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim())
    }
  }
  return undefined
}
