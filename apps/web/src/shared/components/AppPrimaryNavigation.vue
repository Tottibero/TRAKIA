<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const isCalendarActive = computed(
  () => route.name === 'home' || route.name === 'training-plan-session-detail',
)
const isImportActive = computed(() => route.name === 'training-plan-import')
</script>

<template>
  <nav class="app-primary-navigation" aria-label="Navegación principal">
    <div class="app-primary-navigation__inner">
      <RouterLink
        class="app-primary-navigation__link"
        :class="{ 'is-active': isCalendarActive }"
        :to="{ name: 'home' }"
        :aria-current="isCalendarActive ? 'page' : undefined"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
          <rect x="3.75" y="5.25" width="16.5" height="15" rx="2" />
          <path d="M8 3.75v3M16 3.75v3M4 9.25h16" />
          <path d="M8 13h2m4 0h2M8 16.5h2m4 0h2" />
        </svg>
        <span>Calendario</span>
      </RouterLink>
      <RouterLink
        class="app-primary-navigation__link"
        :class="{ 'is-active': isImportActive }"
        :to="{ name: 'training-plan-import' }"
        :aria-current="isImportActive ? 'page' : undefined"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
          <path d="M12 15V3.75m0 0L7.75 8M12 3.75 16.25 8" />
          <path d="M5 13.5v5.25c0 .97.78 1.75 1.75 1.75h10.5c.97 0 1.75-.78 1.75-1.75V13.5" />
        </svg>
        <span>Importar planes</span>
      </RouterLink>
    </div>
  </nav>
  <div class="app-shell__nav-spacer" aria-hidden="true"></div>
</template>
