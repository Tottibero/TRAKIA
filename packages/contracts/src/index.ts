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
  ImportValidationIssueCodeSchema,
  ImportValidationIssueSchema,
} from './training-plan-imports/import-validation-issue.js'
export type {
  ImportValidationIssue,
  ImportValidationIssueCode,
} from './training-plan-imports/import-validation-issue.js'
export { TrainingPlanImportV1Schema } from './training-plan-imports/training-plan-import.js'
export type { TrainingPlanImportV1 } from './training-plan-imports/training-plan-import.js'
export { validateTrainingPlanImportDocument } from './training-plan-imports/validate-training-plan-import.js'
export type { TrainingPlanImportValidationResult } from './training-plan-imports/validate-training-plan-import.js'
export {
  TrainingPlanImportChangeKindSchema,
  TrainingPlanImportChangeSchema,
  TrainingPlanImportChangeStatusSchema,
  TrainingPlanImportConflictCodeSchema,
  TrainingPlanImportConflictSchema,
  TrainingPlanImportReviewRequestSchema,
  TrainingPlanImportReviewResponseSchema,
  TrainingPlanImportConfirmationRequestSchema,
  TrainingPlanImportConfirmationResponseSchema,
  TrainingPlanImportHttpErrorCodeSchema,
  TrainingPlanImportHttpErrorSchema,
} from './training-plan-imports/training-plan-import-http.js'
export type {
  TrainingPlanImportReviewRequest,
  TrainingPlanImportReviewResponse,
  TrainingPlanImportConfirmationRequest,
  TrainingPlanImportConfirmationResponse,
  TrainingPlanImportHttpError,
} from './training-plan-imports/training-plan-import-http.js'
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
  TrainingPlanCalendarBlockSchema,
  TrainingPlanCalendarDaySchema,
  TrainingPlanCalendarQuerySchema,
  TrainingPlanCalendarResponseSchema,
  TrainingPlanCalendarExecutionSummarySchema,
  TrainingPlanCalendarRestSchema,
  TrainingPlanCalendarSessionSchema,
  TrainingPlanReadBlockSchema,
  TrainingPlanReadExerciseSchema,
  TrainingPlanReadHttpErrorSchema,
  TrainingPlanSessionPathParamsSchema,
  TrainingPlanSessionDetailSchema,
} from './training-plans/training-plan-read-http.js'
export type {
  TrainingPlanCalendarBlock,
  TrainingPlanCalendarQuery,
  TrainingPlanCalendarResponse,
  TrainingPlanCalendarExecutionSummary,
  TrainingPlanReadBlock,
  TrainingPlanReadExercise,
  TrainingPlanReadHttpError,
  TrainingPlanSessionPathParams,
  TrainingPlanSessionDetail,
} from './training-plans/training-plan-read-http.js'
export {
  WorkoutCompletionTypeSchema,
  WorkoutExecutionSchema,
  WorkoutExecutionActiveTimerSchema,
  WorkoutFeelingSchema,
  WorkoutExecutionSnapshotSchema,
  WorkoutExerciseSnapshotSchema,
  WorkoutCircuitRoundSchema,
  WorkoutAmrapRoundSchema,
  WorkoutAmrapStateSchema,
  WorkoutPauseSchema,
  WorkoutStatusSchema,
} from './workout-executions/workout-execution.js'
export {
  WorkoutExecutionCloseRequestSchema,
  WorkoutExecutionCloseResponseSchema,
} from './workout-executions/workout-execution-close.js'
export {
  WorkoutExecutionPausePathParamsSchema,
  WorkoutExecutionPauseRequestSchema,
  WorkoutExecutionResumeRequestSchema,
  WorkoutExecutionPauseResponseSchema,
} from './workout-executions/workout-execution-pause.js'
export type {
  WorkoutExecutionPauseRequest,
  WorkoutExecutionResumeRequest,
  WorkoutExecutionPauseResponse,
} from './workout-executions/workout-execution-pause.js'
export type {
  WorkoutExecutionCloseRequest,
  WorkoutExecutionCloseResponse,
} from './workout-executions/workout-execution-close.js'
export type {
  WorkoutCompletionType,
  WorkoutExecution,
  WorkoutFeeling,
  WorkoutExecutionSnapshot,
  WorkoutExecutionActiveTimer,
  WorkoutCircuitRound,
  WorkoutAmrapRound,
  WorkoutAmrapState,
  WorkoutExerciseSnapshot,
  WorkoutPause,
  WorkoutStatus,
} from './workout-executions/workout-execution.js'
export {
  WorkoutExecutionClosedSessionSchema,
  WorkoutExecutionClosedSessionsQuerySchema,
  WorkoutExecutionClosedSessionsResponseSchema,
} from './workout-executions/workout-execution-closed-sessions.js'
export type {
  WorkoutExecutionClosedSession,
  WorkoutExecutionClosedSessionsQuery,
  WorkoutExecutionClosedSessionsResponse,
} from './workout-executions/workout-execution-closed-sessions.js'
export {
  WorkoutExecutionLegacyRequestQuerySchema,
  WorkoutExecutionOpenQuerySchema,
  WorkoutExecutionOpenResponseSchema,
  WorkoutExecutionRequestPathParamsSchema,
  WorkoutExecutionStartErrorCodeSchema,
  WorkoutExecutionStartErrorSchema,
  WorkoutExecutionStartRequestSchema,
  WorkoutExecutionStartResponseSchema,
} from './workout-executions/workout-execution-start.js'
export {
  WorkoutExecutionResultPathParamsSchema,
  WorkoutExecutionResultMetricsPathParamsSchema,
  WorkoutExecutionResultRequestSchema,
  WorkoutExecutionResultResponseSchema,
  WorkoutExecutionWorkTimerStartRequestSchema,
  WorkoutExecutionWorkTimerStartResponseSchema,
  WorkoutExecutionResultMetricsRequestSchema,
} from './workout-executions/workout-execution-results.js'
export type {
  WorkoutExecutionResultPathParams,
  WorkoutExecutionResultMetricsPathParams,
  WorkoutExecutionResultRequest,
  WorkoutExecutionResultResponse,
  WorkoutExecutionWorkTimerStartRequest,
  WorkoutExecutionWorkTimerStartResponse,
  WorkoutExecutionResultMetricsRequest,
} from './workout-executions/workout-execution-results.js'
export {
  WorkoutExecutionCircuitRoundPathParamsSchema,
  WorkoutExecutionCircuitRoundRequestSchema,
  WorkoutExecutionCircuitRoundResponseSchema,
} from './workout-executions/workout-execution-circuit-round.js'
export {
  WorkoutExecutionAmrapPathParamsSchema,
  WorkoutExecutionAmrapRequestSchema,
  WorkoutExecutionAmrapResponseSchema,
} from './workout-executions/workout-execution-amrap.js'
export type {
  WorkoutExecutionAmrapPathParams,
  WorkoutExecutionAmrapRequest,
  WorkoutExecutionAmrapResponse,
} from './workout-executions/workout-execution-amrap.js'
export type {
  WorkoutExecutionCircuitRoundPathParams,
  WorkoutExecutionCircuitRoundRequest,
  WorkoutExecutionCircuitRoundResponse,
} from './workout-executions/workout-execution-circuit-round.js'
export type {
  WorkoutExecutionOpenQuery,
  WorkoutExecutionOpenResponse,
  WorkoutExecutionRequestPathParams,
  WorkoutExecutionStartError,
  WorkoutExecutionStartErrorCode,
  WorkoutExecutionStartRequest,
  WorkoutExecutionStartResponse,
} from './workout-executions/workout-execution-start.js'
export {
  WorkoutExecutionIntervalActionSchema,
  WorkoutExecutionIntervalPathParamsSchema,
  WorkoutExecutionIntervalRequestSchema,
  WorkoutExecutionIntervalResponseSchema,
} from './workout-executions/workout-execution-interval.js'
export type {
  WorkoutExecutionIntervalAction,
  WorkoutExecutionIntervalPathParams,
  WorkoutExecutionIntervalRequest,
  WorkoutExecutionIntervalResponse,
} from './workout-executions/workout-execution-interval.js'
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
export {
  WorkoutSyncIssueCodeSchema,
  WorkoutSyncIssueSchema,
  WorkoutSyncOperationSchema,
  WorkoutSyncResponseSchema,
  WorkoutSyncStatusSchema,
} from './workout-sync/workout-sync.js'
export type {
  CloseExecutionOperation,
  CorrectResultOperation,
  WorkoutSyncIssue,
  WorkoutSyncIssueCode,
  WorkoutSyncOperation,
  WorkoutSyncResponse,
  WorkoutSyncStatus,
} from './workout-sync/workout-sync.js'
export {
  TrainingExportExecutionSchema,
  TrainingExportExerciseSchema,
  TrainingExportPeriodSchema,
  TrainingExportPlanSchema,
  TrainingExportV1Schema,
} from './training-exports/training-export.js'
export type {
  TrainingExportExecution,
  TrainingExportExercise,
  TrainingExportPeriod,
  TrainingExportPlan,
  TrainingExportV1,
} from './training-exports/training-export.js'
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
