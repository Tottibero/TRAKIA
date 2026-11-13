import { z } from 'zod'

export const LoginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})

export const AuthUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
})

export type LoginRequest = z.infer<typeof LoginRequestSchema>
export type AuthUser = z.infer<typeof AuthUserSchema>
