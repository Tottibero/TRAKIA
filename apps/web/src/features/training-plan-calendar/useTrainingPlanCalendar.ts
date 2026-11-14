import { computed, type Ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import type { PlanDate } from '@trakia/contracts'
import { getTrainingPlanCalendar } from './api/calendar'

export function useTrainingPlanCalendar(from: Ref<PlanDate>, to: Ref<PlanDate>) {
  return useQuery({
    queryKey: computed(() => ['training-plans', 'calendar', from.value, to.value] as const),
    queryFn: ({ queryKey, signal }) => getTrainingPlanCalendar(queryKey[2], queryKey[3], signal),
  })
}
