import { AuthUserSchema, LoginRequestSchema, type AuthUser, type LoginRequest } from '@trakia/contracts'
import { apiRequest } from '../../../shared/api/http'

export async function getCurrentUser(): Promise<AuthUser> {
  return AuthUserSchema.parse(await apiRequest<unknown>('/auth/me'))
}

export async function login(input: LoginRequest): Promise<void> {
  const validInput = LoginRequestSchema.parse(input)
  await apiRequest<void>('/auth/login', { method: 'POST', body: JSON.stringify(validInput) })
}

export async function logout(): Promise<void> {
  await apiRequest<void>('/auth/logout', { method: 'POST' })
}
