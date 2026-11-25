import { mondayOfCivilWeek } from './calendar-dates.js'

export function trainingPlanSessionMoveOptions(calendar, planId, originalDate, today) {
  const originalWeek = mondayOfCivilWeek(originalDate)
  return calendar.days.flatMap(({ date, entries }) => {
    if (mondayOfCivilWeek(date) !== originalWeek || date === originalDate || date < today) return []
    if (entries.length === 0) return [{ date, kind: 'free' }]
    if (entries.length === 1 && entries[0].type === 'rest' && entries[0].planId === planId)
      return [{ date, kind: 'rest' }]
    return []
  })
}
