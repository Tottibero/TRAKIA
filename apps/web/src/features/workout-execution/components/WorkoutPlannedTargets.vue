<script setup lang="ts">
import type { OnlineStrengthTarget } from '../online-strength-flow'
import { metricPillColorClass } from '../../../shared/utils/metric-pill-presentation'

defineProps<{ targets: OnlineStrengthTarget[] }>()
</script>

<template>
  <ul
    v-if="targets.length"
    class="mx-auto mt-5 flex max-w-full flex-wrap justify-center gap-2"
    aria-label="Objetivos planificados"
  >
    <li
      v-for="target in targets"
      :key="target.metric"
      class="inline-flex min-h-9 max-w-full items-center rounded-full border border-[#303434] bg-[#1C1F1F] px-3 py-1 text-sm font-medium leading-tight text-[#F4F1EB]"
      :class="metricPillColorClass(target.metric)"
    >
      <span class="tabular-nums">
        {{ target.metric === 'rpe' ? `RPE ${target.value}` : target.displayValue }}
      </span>
    </li>
  </ul>
</template>
