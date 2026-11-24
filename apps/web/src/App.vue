<template>
  <div v-if="!isOnline" class="offline-banner" role="status" aria-live="polite">
    <span class="offline-banner__label">Sin conexión</span>
    <span>Necesitas conexión para guardar los resultados</span>
  </div>
  <main v-if="isStarting" class="session-loading" role="status" aria-live="polite">
    <img class="loading-mark" src="/brand/trackia.png" alt="TRAKIA" width="1536" height="1024" />
    <p>Comprobando tu sesión…</p>
  </main>
  <RouterView v-else />
</template>
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import router from './router'
import { subscribeNetworkStatus } from './app/network-status.mjs'

const isStarting = ref(true)
const isOnline = ref(true)
let unsubscribeNetworkStatus: (() => void) | undefined

onMounted(async () => {
  unsubscribeNetworkStatus = subscribeNetworkStatus((online) => {
    isOnline.value = online
  })
  await router.isReady()
  isStarting.value = false
})

onBeforeUnmount(() => unsubscribeNetworkStatus?.())
</script>
<style scoped>
.offline-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.125rem 0.5rem;
  border-bottom: 1px solid color-mix(in srgb, var(--trakia-warning) 30%, transparent);
  background: var(--trakia-surface);
  color: var(--trakia-warning);
  padding: max(0.5rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) 0.5rem
    max(1rem, env(safe-area-inset-left));
  font-size: 0.875rem;
  line-height: 1.25rem;
  text-align: center;
}

.offline-banner__label {
  font-weight: 600;
}
</style>
