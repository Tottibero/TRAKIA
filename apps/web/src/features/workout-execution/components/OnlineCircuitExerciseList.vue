<script setup lang="ts">
import { metricPillColorClass } from '../../../shared/utils/metric-pill-presentation'
import type { OnlineCircuitEntry } from '../online-circuit-flow'

defineProps<{ entries: OnlineCircuitEntry[] }>()

function targetDisplay(target: OnlineCircuitEntry['targets'][number]) {
  return target.metric === 'rpe'
    ? `RPE ${target.value}`
    : target.unit
      ? `${target.value} ${target.unit}`
      : String(target.value)
}
</script>

<template>
  <section aria-label="Ejercicios y objetivos de la ronda" class="space-y-3">
    <article v-for="entry in entries" :key="entry.appearance.key">
      <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2">
        <h2 class="min-w-0 break-words text-base font-semibold">{{ entry.exercise.name }}</h2>
        <ul v-if="entry.targets.length" class="flex min-w-0 flex-wrap gap-1.5">
          <li
            v-for="target in entry.targets"
            :key="target.metric"
            class="inline-flex min-h-7 max-w-full items-center rounded-full border border-[var(--trakia-border)] bg-[var(--trakia-surface-raised)] px-2.5 py-1 text-xs font-medium leading-tight"
            :class="metricPillColorClass(target.metric)"
          >
            {{ targetDisplay(target) }}
          </li>
        </ul>
      </div>
      <p v-if="entry.saved" class="mt-1 text-sm text-[var(--trakia-success)]" role="status">
        Resultado guardado
      </p>
    </article>
  </section>
</template>
