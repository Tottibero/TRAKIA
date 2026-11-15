import { createRouter, createWebHistory } from 'vue-router'
import { AuthUserSchema } from '@trakia/contracts'
import { getCurrentUser, LoginView, safeLocalRedirect } from '@/features/auth'
import { ApiError } from '../shared/api/http'
import { queryClient } from '../app/queryClient'
import { TrainingPlanImportView } from '@/features/training-plan-imports'
import { TrainingPlanSessionDetailView, WeeklyHomeView } from '@/features/training-plan-calendar'
import WorkoutExecutionView from '@/features/workout-execution/views/WorkoutExecutionView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView },
    {
      path: '/workouts/executions/:executionId',
      name: 'workout-execution',
      component: WorkoutExecutionView,
      meta: { requiresAuth: true },
    },
    { path: '/', name: 'home', component: WeeklyHomeView, meta: { requiresAuth: true } },
    {
      path: '/training-plans/:planId/sessions/:sessionId',
      name: 'training-plan-session-detail',
      component: TrainingPlanSessionDetailView,
      meta: { requiresAuth: true },
    },
    {
      path: '/training-plans/import',
      name: 'training-plan-import',
      component: TrainingPlanImportView,
      meta: { requiresAuth: true },
    },
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
    if (to.name === 'login') return safeLocalRedirect(to.query.redirect) ?? { name: 'home' }
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
