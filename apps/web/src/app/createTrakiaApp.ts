import { VueQueryPlugin } from '@tanstack/vue-query'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from '../App.vue'
import router from '../router'
import { queryClient, setInvalidSessionHandler } from './queryClient'

export function createTrakiaApp() {
  const app = createApp(App)

  setInvalidSessionHandler(() => {
    const isPrivateRoute = router.currentRoute.value.matched.some((route) => route.meta.requiresAuth)
    if (isPrivateRoute) return router.replace('/login')
  })

  app.use(createPinia())
  app.use(router)
  app.use(VueQueryPlugin, { queryClient })

  return app
}
