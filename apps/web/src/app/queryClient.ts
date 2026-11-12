import { QueryCache, QueryClient } from '@tanstack/vue-query'
import { ApiError } from '../shared/api/http'

let authRedirectInProgress = false
let handleInvalidSession: (() => void | Promise<unknown>) | undefined

export function setInvalidSessionHandler(handler: () => void | Promise<unknown>) {
  handleInvalidSession = handler
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        queryClient.clear()
        if (handleInvalidSession && !authRedirectInProgress) {
          authRedirectInProgress = true
          void Promise.resolve()
            .then(handleInvalidSession)
            .finally(() => (authRedirectInProgress = false))
        }
      }
    },
  }),
})
