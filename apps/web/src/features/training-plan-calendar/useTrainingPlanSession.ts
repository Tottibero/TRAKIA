import { computed, type Ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { getTrainingPlanSessionDetail } from './api/session'

export function useTrainingPlanSession(planId: Ref<string | undefined>, sessionId: Ref<string | undefined>) {
  return useQuery({
    queryKey: computed(
      () => ['training-plans', 'session', planId.value ?? '', sessionId.value ?? ''] as const,
    ),
    enabled: computed(() => Boolean(planId.value && sessionId.value)),
    queryFn: ({ queryKey, signal }) => getTrainingPlanSessionDetail(queryKey[2], queryKey[3], signal),
  })
}
