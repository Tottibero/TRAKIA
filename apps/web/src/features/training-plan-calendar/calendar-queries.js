import { mondayOfCivilWeek } from './calendar-dates.js'

export const trainingPlanQueryKeys = {
  all: ['training-plans'],
  calendar: (from, to) => ['training-plans', 'calendar', from, to],
  session: (planId, sessionId) => ['training-plans', 'session', planId, sessionId],
}

export function invalidateTrainingPlanQueries(queryClient) {
  return queryClient.invalidateQueries({ queryKey: trainingPlanQueryKeys.all })
}

export function trainingPlanHomeLocation(startDate) {
  return {
    name: 'home',
    query: { week: mondayOfCivilWeek(startDate) },
  }
}
