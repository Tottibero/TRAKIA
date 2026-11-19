export function getMadridCivilDate(value?: Date | number | string): string
export function getNextMadridMidnight(value?: Date | number | string): number
export function isPlannedDateToday(plannedDate: string | null | undefined, today: string): boolean
export function resolveWorkoutStartAction(input: {
  startState: 'completed' | 'open' | 'checking' | 'unavailable' | 'idle'
  isPlannedDateToday: boolean
}): 'results' | 'continue' | 'start' | 'scheduled-date' | 'checking' | 'retry'
