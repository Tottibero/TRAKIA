import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError } from '../../shared/api/http'
import { getCurrentUser, login, logout } from './api/auth'

export const authQueryKey = ['auth', 'me'] as const

export function useAuth() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const userQuery = useQuery({
    queryKey: authQueryKey,
    queryFn: getCurrentUser,
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  })

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      await queryClient.refetchQueries({ queryKey: authQueryKey, exact: true })
      await router.replace('/')
    },
  })

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: async () => {
      queryClient.clear()
      await router.replace('/login')
    },
  })

  return {
    user: computed(() => userQuery.data.value),
    isChecking: computed(() => userQuery.isPending.value),
    isAuthenticated: computed(() => userQuery.isSuccess.value && Boolean(userQuery.data.value)),
    login: loginMutation.mutateAsync,
    isLoggingIn: computed(() => loginMutation.isPending.value),
    loginError: computed(() => loginMutation.error.value),
    logout: logoutMutation.mutateAsync,
    isLoggingOut: computed(() => logoutMutation.isPending.value),
    isUnauthorized: (error: unknown) => error instanceof ApiError && error.status === 401,
  }
}
