<script setup lang="ts">
defineProps<{
  weekLabel: string
  previousWeekLabel: string
  nextWeekLabel: string
}>()

const emit = defineEmits<{
  navigateWeek: [offset: -1 | 1]
}>()
</script>

<template>
  <header class="mb-4 flex min-h-11 items-center justify-between gap-3">
    <h1
      class="min-w-0 text-lg font-semibold leading-6 tracking-[-0.02em] text-[var(--trakia-text)]"
      aria-live="polite"
    >
      {{ weekLabel }}
    </h1>
    <nav class="flex shrink-0 items-center gap-2" aria-label="Navegación de semanas">
      <button
        class="grid size-11 place-items-center rounded-lg border border-[var(--trakia-border)] text-[var(--trakia-text)] transition hover:bg-[var(--trakia-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trakia-focus)]"
        type="button"
        :aria-label="`Semana anterior a ${previousWeekLabel}`"
        @click="emit('navigateWeek', -1)"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" class="size-[1.125rem]" fill="none">
          <path d="m12.5 4.5-5.5 5.5 5.5 5.5" stroke="currentColor" stroke-width="1.7" />
        </svg>
      </button>
      <button
        class="grid size-11 place-items-center rounded-lg border border-[var(--trakia-border)] text-[var(--trakia-text)] transition hover:bg-[var(--trakia-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trakia-focus)]"
        type="button"
        :aria-label="`Semana siguiente a ${nextWeekLabel}`"
        @click="emit('navigateWeek', 1)"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" class="size-[1.125rem]" fill="none">
          <path d="m7.5 4.5 5.5 5.5-5.5 5.5" stroke="currentColor" stroke-width="1.7" />
        </svg>
      </button>
    </nav>
  </header>
</template>
