import { z } from 'zod'
import {
  ImportValidationIssueCodeSchema,
  ImportValidationIssueSchema,
  type ImportValidationIssue,
  type ImportValidationIssueCode,
} from './import-validation-issue.js'
import { IMPORT_VALIDATION_SEMANTIC_CODE_PARAM } from '../validation-issue-metadata.js'
import { TrainingPlanImportV1Schema, type TrainingPlanImportV1 } from './training-plan-import.js'

export type TrainingPlanImportValidationResult =
  { success: true; document: TrainingPlanImportV1 } | { success: false; issues: ImportValidationIssue[] }

interface NormalizedIssue {
  issue: ImportValidationIssue
  sourceIndex: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function comparePath(left: readonly (string | number)[], right: readonly (string | number)[]): number {
  const commonLength = Math.min(left.length, right.length)
  for (let index = 0; index < commonLength; index += 1) {
    const leftSegment = left[index]
    const rightSegment = right[index]
    if (leftSegment === rightSegment) continue
    if (typeof leftSegment === 'number' && typeof rightSegment === 'number') return leftSegment - rightSegment
    if (typeof leftSegment === 'number') return -1
    if (typeof rightSegment === 'number') return 1
    return leftSegment < rightSegment ? -1 : 1
  }
  return left.length - right.length
}

function issueCode(issue: z.core.$ZodIssue, input: unknown): ImportValidationIssueCode {
  if (issue.code === 'custom') {
    const semanticCode = issue.params?.[IMPORT_VALIDATION_SEMANTIC_CODE_PARAM]
    const parsedSemanticCode = ImportValidationIssueCodeSchema.safeParse(semanticCode)
    if (parsedSemanticCode.success) return parsedSemanticCode.data
  }

  if (issue.code === 'invalid_value' && issue.path.length === 1 && isRecord(input)) {
    const field = issue.path[0]
    if (field === 'format' && Object.hasOwn(input, 'format')) return 'INVALID_FORMAT'
    if (field === 'version' && Object.hasOwn(input, 'version')) return 'UNSUPPORTED_VERSION'
  }

  if ((issue.code === 'too_small' || issue.code === 'too_big') && issue.path[0] === 'plan')
    return 'INVALID_PLAN'

  return 'INVALID_STRUCTURE'
}

function normalizeIssues(error: z.ZodError, input: unknown): ImportValidationIssue[] {
  const normalized: NormalizedIssue[] = []

  error.issues.forEach((issue, sourceIndex) => {
    const code = issueCode(issue, input)
    const base = {
      code,
      path: issue.path as Array<string | number>,
      message: issue.message,
    }

    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        normalized.push({
          issue: { ...base, path: [...base.path, key] },
          sourceIndex,
        })
      }
      return
    }

    normalized.push({ issue: base, sourceIndex })
  })

  normalized.sort((left, right) => {
    const pathOrder = comparePath(left.issue.path, right.issue.path)
    if (pathOrder !== 0) return pathOrder
    if (left.issue.code !== right.issue.code) return left.issue.code < right.issue.code ? -1 : 1
    return left.sourceIndex - right.sourceIndex
  })

  return normalized.map(({ issue }) => ImportValidationIssueSchema.parse(issue))
}

export function validateTrainingPlanImportDocument(input: unknown): TrainingPlanImportValidationResult {
  const result = TrainingPlanImportV1Schema.safeParse(input)
  if (result.success) return { success: true, document: result.data }
  return { success: false, issues: normalizeIssues(result.error, input) }
}
