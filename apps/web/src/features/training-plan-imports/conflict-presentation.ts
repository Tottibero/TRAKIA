import type { TrainingPlanImportReviewResponse } from '@trakia/contracts'

export type TrainingPlanImportConflict = TrainingPlanImportReviewResponse['conflicts'][number]
export type TrainingPlanImportConflictCode = TrainingPlanImportConflict['code']

export interface ConflictTargetContext {
  exerciseNames: ReadonlyMap<string, string>
  sessionDates: ReadonlyMap<string, string>
  planName: string
}

export interface PresentedConflictGroup {
  message: string
  count: number
  targets: Array<{ label: string; count: number }>
}

const conflictMessages: Record<TrainingPlanImportConflictCode, string> = {
  EXERCISE_DEFINITION_CONFLICT: 'La definición no coincide con la guardada.',
  UNRESOLVED_PERSISTED_EXERCISE_KEY: 'No se puede identificar el ejercicio guardado con seguridad.',
  EXERCISE_NOT_FOUND: 'El ejercicio no está disponible en el archivo ni en el catálogo.',
  INVALID_COMBINED_PLAN: 'El plan tiene datos incompatibles.',
  PAST_SESSION_PROTECTED: 'Las sesiones pasadas no se pueden modificar.',
  SESSION_EXECUTION_PROTECTED: 'La sesión ya tiene una ejecución iniciada o completada.',
  IDENTITY_TYPE_MISMATCH: 'Este elemento ya existe con otro tipo.',
  OPERATION_ID_CONTENT_MISMATCH: 'La operación ya se usó con otros datos.',
  STALE_IMPORT_REVIEW: 'Los datos guardados cambiaron durante la revisión.',
  STALE_PLAN_VERSION: 'El plan cambió durante la revisión.',
  CONCURRENT_CATALOG_OR_PLAN_CHANGE: 'El plan o el catálogo cambió durante la revisión.',
  INVALID_OR_EXPIRED_REVIEW_RECEIPT: 'La revisión venció o dejó de ser válida.',
  IMPORT_CONFLICT: 'Hay un conflicto que impide importar el plan.',
}

export function conflictMessage(code: TrainingPlanImportConflictCode): string {
  return conflictMessages[code]
}

export function conflictTargetLabel(
  conflict: TrainingPlanImportConflict,
  context: ConflictTargetContext,
): string {
  const exerciseConflict =
    conflict.resource === 'exercise' ||
    conflict.code === 'EXERCISE_NOT_FOUND' ||
    conflict.code === 'UNRESOLVED_PERSISTED_EXERCISE_KEY'
  if (exerciseConflict) return context.exerciseNames.get(conflict.key) ?? `Ejercicio «${conflict.key}»`

  if (conflict.resource === 'session') {
    const date = context.sessionDates.get(conflict.key)
    return date ? `Sesión · ${formatPlanDate(date)}` : `Sesión «${conflict.key}»`
  }

  if (conflict.code === 'IDENTITY_TYPE_MISMATCH') return `Elemento «${conflict.key}»`

  const daysIndex = conflict.path.indexOf('days')
  const sessionKey = daysIndex >= 0 ? conflict.path[daysIndex + 1] : undefined
  if (typeof sessionKey === 'string') {
    const date = context.sessionDates.get(sessionKey)
    if (date) return `Sesión · ${formatPlanDate(date)}`
  }

  return context.planName || 'Plan'
}

export function groupImportConflicts(
  conflicts: TrainingPlanImportConflict[],
  context: ConflictTargetContext,
): PresentedConflictGroup[] {
  const groups = new Map<string, PresentedConflictGroup>()

  for (const conflict of conflicts) {
    const message = conflictMessage(conflict.code)
    const group = groups.get(message) ?? { message, count: 0, targets: [] }
    group.count += 1
    const label = conflictTargetLabel(conflict, context)
    const target = group.targets.find((item) => item.label === label)
    if (target) target.count += 1
    else group.targets.push({ label, count: 1 })
    groups.set(message, group)
  }

  return [...groups.values()]
}

export function formatPlanDate(value: string): string {
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}
