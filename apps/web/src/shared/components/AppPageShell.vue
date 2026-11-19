<template>
  <div class="app-shell">
    <header class="app-shell__header" :class="{ 'app-shell__header--calendar': variant === 'calendar' }">
      <div class="app-shell__header-inner">
        <div class="app-shell__brand" :class="{ 'app-shell__brand--calendar': variant === 'calendar' }">
          <img class="app-shell__logo" src="/brand/trackia.png" alt="" width="1536" height="1024" />
          <span v-if="variant === 'calendar'" class="app-shell__wordmark" aria-label="TRAKIA"
            >TRAK<span class="app-shell__wordmark-accent">IA</span></span
          >
        </div>
        <div v-if="$slots.actions" class="app-shell__actions">
          <slot name="actions" />
        </div>
      </div>
    </header>
    <slot />
    <AppPrimaryNavigation />
  </div>
</template>

<script setup lang="ts">
import AppPrimaryNavigation from './AppPrimaryNavigation.vue'

withDefaults(defineProps<{ variant?: 'default' | 'calendar' }>(), { variant: 'default' })
</script>

<style scoped>
@media (min-width: 48rem) {
  .app-shell__brand:not(.app-shell__brand--calendar) .app-shell__logo {
    width: 6.75rem;
    height: 4.5rem;
  }
}
</style>
