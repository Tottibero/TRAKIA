import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common'
import { AuthUserSchema, LoginRequestSchema, type AuthUser, type LoginRequest } from '@trakia/contracts'
import { PasswordService, UsersService } from '../users/users.module.js'
import { Public } from '../../config/public-route.decorator.js'
import { AuthTokenService } from './auth-token.service.js'
import { AuthenticatedRequest, CookieResponse, cookieName, cookieOptions } from './auth.guard.js'

interface AuthResponse extends CookieResponse {
  cookie(name: string, value: string, options: ReturnType<typeof cookieOptions>): void
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly tokens: AuthTokenService,
  ) {}

  @Public()
  @Post('login')
  async login(@Body() body: LoginRequest, @Res({ passthrough: true }) response: AuthResponse): Promise<void> {
    const parsed = LoginRequestSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid request.')
    const input = parsed.data
    const user = await this.users.findByEmail(input.email)
    const valid = user ? await this.passwords.verify(user.passwordHash, input.password) : false
    if (!user || !valid) throw new UnauthorizedException('Invalid email or password.')
    response.cookie(cookieName(), this.tokens.issue(user.id, user.sessionVersion), cookieOptions())
  }

  @Post('logout')
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: AuthResponse,
  ): Promise<void> {
    if (request.authUserId) await this.users.incrementSessionVersion(request.authUserId)
    response.clearCookie(cookieName(), cookieOptions())
  }

  @Get('me')
  async me(@Req() request: AuthenticatedRequest): Promise<AuthUser> {
    const user = await this.users.findById(request.authUserId!)
    if (!user) throw new UnauthorizedException('Authentication required.')
    return AuthUserSchema.parse({ id: user.id, email: user.email })
  }
}
