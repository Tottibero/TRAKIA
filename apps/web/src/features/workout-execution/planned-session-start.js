export { getMadridCivilDate, getNextMadridMidnight } from '../../shared/utils/madrid-civil-date.js'

export function isPlannedDateToday(plannedDate, today) {
  return plannedDate === undefined || plannedDate === null || plannedDate === today
}

export function resolveWorkoutStartAction({ startState, isPlannedDateToday }) {
  if (startState === 'completed') return 'results'
  if (startState === 'open') return 'continue'
  if (startState === 'idle') return isPlannedDateToday ? 'start' : 'scheduled-date'
  if (startState === 'checking') return 'checking'
  return 'retry'
}
