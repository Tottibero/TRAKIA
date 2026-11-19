<template>
  <main v-if="isStarting" class="session-loading" role="status" aria-live="polite">
    <img class="loading-mark" src="/brand/trackia.png" alt="TRAKIA" width="1536" height="1024" />
    <p>Comprobando tu sesión…</p>
  </main>
  <RouterView v-else />
</template>
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import router from './router'

const isStarting = ref(true)
onMounted(async () => {
  await router.isReady()
  isStarting.value = false
})
</script>
