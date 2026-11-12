import { createRouter, createWebHistory } from 'vue-router'
import { AuthUserSchema } from '@trakia/contracts'
import { getCurrentUser, LoginView } from '@/features/auth'
import { ApiError } from '../shared/api/http'
import { queryClient } from '../app/queryClient'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView },
    { path: '/', name: 'home', component: HomeView, meta: { requiresAuth: true } },
  ],
})

router.beforeEach(async (to) => {
  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth)
  try {
    const user = await queryClient.fetchQuery({
      queryKey: ['auth', 'me'],
      queryFn: getCurrentUser,
      retry: false,
      staleTime: 60_000,
    })
    AuthUserSchema.parse(user)
    if (to.name === 'login') return { name: 'home' }
  } catch (error) {
    queryClient.removeQueries({ queryKey: ['auth', 'me'] })
    if (error instanceof ApiError && error.status === 401 && requiresAuth) {
      return { name: 'login', query: { redirect: to.fullPath } }
    }
    if (requiresAuth) return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (requiresAuth && !queryClient.getQueryData(['auth', 'me'])) return { name: 'login' }
})

export default router
