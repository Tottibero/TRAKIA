import { z } from 'zod'
import { PlanDateSchema } from './training-plan.js'

const UuidSchema = z.uuid()

export const TrainingPlanSessionReschedulePathParamsSchema = z
  .object({ planId: UuidSchema, sessionId: UuidSchema })
  .strict()
export type TrainingPlanSessionReschedulePathParams = z.infer<
  typeof TrainingPlanSessionReschedulePathParamsSchema
>

export const TrainingPlanSessionRescheduleRequestSchema = z
  .object({ expectedDate: PlanDateSchema, newDate: PlanDateSchema })
  .strict()
export type TrainingPlanSessionRescheduleRequest = z.infer<typeof TrainingPlanSessionRescheduleRequestSchema>

export const TrainingPlanSessionRescheduleResponseSchema = z
  .object({
    sessionId: UuidSchema,
    previousDate: PlanDateSchema,
    newDate: PlanDateSchema,
    restRemoved: z.boolean(),
  })
  .strict()
export type TrainingPlanSessionRescheduleResponse = z.infer<
  typeof TrainingPlanSessionRescheduleResponseSchema
>

export const TrainingPlanSessionRescheduleErrorCodeSchema = z.enum([
  'INVALID_REQUEST',
  'SESSION_NOT_FOUND',
  'SESSION_NOT_PENDING',
  'SESSION_DATE_CHANGED',
  'TARGET_OUTSIDE_WEEK',
  'TARGET_IN_PAST',
  'TARGET_UNAVAILABLE',
  'WEEKLY_PLAN_INCONSISTENT',
])
export type TrainingPlanSessionRescheduleErrorCode = z.infer<
  typeof TrainingPlanSessionRescheduleErrorCodeSchema
>

export const TrainingPlanSessionRescheduleErrorSchema = z
  .object({
    code: TrainingPlanSessionRescheduleErrorCodeSchema,
    message: z.string().trim().min(1),
  })
  .strict()
export type TrainingPlanSessionRescheduleError = z.infer<typeof TrainingPlanSessionRescheduleErrorSchema>
