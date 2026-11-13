export { HealthResponseSchema } from './health.js'
export type { HealthResponse } from './health.js'
export { AuthUserSchema, LoginRequestSchema } from './auth/auth.js'
export type { AuthUser, LoginRequest } from './auth/auth.js'
export {
  ExerciseCategorySchema,
  ExerciseDefinitionSchema,
  ExerciseExternalReferenceSchema,
  ExerciseMetricSchema,
  ExerciseSchema,
} from './exercises/exercise.js'
export type {
  Exercise,
  ExerciseCategory,
  ExerciseDefinition,
  ExerciseExternalReference,
  ExerciseMetric,
} from './exercises/exercise.js'
export {
  ExerciseTargetsSchema,
  PlannedAlternativeSchema,
  PlannedBlockSchema,
  PlannedIntervalPhaseSchema,
  PlannedRestDaySchema,
  PlannedSessionSchema,
  PlannedExerciseSchema,
  PlanDateSchema,
  TargetOverridesSchema,
  TrainingPlanDaySchema,
  TrainingPlanDefinitionSchema,
  resolveExerciseTargets,
} from './training-plans/training-plan.js'
export {
  WorkoutExecutionSchema,
  WorkoutExecutionSnapshotSchema,
  WorkoutExerciseSnapshotSchema,
  WorkoutPauseSchema,
  WorkoutStatusSchema,
} from './workout-executions/workout-execution.js'
export type {
  WorkoutExecution,
  WorkoutExecutionSnapshot,
  WorkoutExerciseSnapshot,
  WorkoutPause,
  WorkoutStatus,
} from './workout-executions/workout-execution.js'
export {
  ActualMetricsSchema,
  ResultStatusSchema,
  WorkoutResultSchema,
} from './workout-executions/workout-results.js'
export type {
  ActualMetrics,
  CircuitResult,
  IntervalResult,
  ResultStatus,
  SetResult,
  WorkoutResult,
} from './workout-executions/workout-results.js'
export {
  WorkoutCorrectionChangeSchema,
  WorkoutCorrectionSchema,
} from './workout-executions/workout-corrections.js'
export type { WorkoutCorrection, WorkoutCorrectionChange } from './workout-executions/workout-corrections.js'
export type {
  ExerciseTargets,
  PlannedAlternative,
  PlannedBlock,
  PlannedExercise,
  PlannedIntervalPhase,
  PlannedRestDay,
  PlannedSession,
  PlanDate,
  TargetOverrides,
  TrainingPlanDefinition,
} from './training-plans/training-plan.js'
