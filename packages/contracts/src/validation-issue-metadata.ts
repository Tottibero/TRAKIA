/** Internal Zod metadata used to classify semantic import validation issues. */
export const IMPORT_VALIDATION_SEMANTIC_CODE_PARAM = 'trakiaImportSemanticCode'

export const IMPORT_VALIDATION_SEMANTIC_CODES = {
  duplicateExerciseKey: 'DUPLICATE_EXERCISE_KEY',
  exerciseNotDefined: 'EXERCISE_NOT_DEFINED',
  incompatibleMetric: 'INCOMPATIBLE_METRIC',
  invalidPlan: 'INVALID_PLAN',
} as const
