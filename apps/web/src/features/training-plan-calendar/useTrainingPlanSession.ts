import { computed, type Ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { getTrainingPlanSessionDetail } from './api/session'
import { trainingPlanQueryKeys } from './calendar-queries.js'

export function useTrainingPlanSession(planId: Ref<string | undefined>, sessionId: Ref<string | undefined>) {
  return useQuery({
    queryKey: computed(() => trainingPlanQueryKeys.session(planId.value ?? '', sessionId.value ?? '')),
    enabled: computed(() => Boolean(planId.value && sessionId.value)),
    queryFn: ({ queryKey, signal }) => getTrainingPlanSessionDetail(queryKey[2], queryKey[3], signal),
  })
}
