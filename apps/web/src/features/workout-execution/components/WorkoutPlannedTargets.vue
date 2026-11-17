<script setup lang="ts">
import type { OnlineStrengthTarget } from '../online-strength-flow'

defineProps<{ targets: OnlineStrengthTarget[] }>()
</script>

<template>
  <section v-if="targets.length" class="mx-auto mt-5 max-w-xs" aria-label="Objetivos planificados">
    <p class="mb-2 text-center text-xs font-semibold text-stone-400">Objetivos</p>
    <dl class="grid grid-cols-2 gap-x-5 gap-y-2 text-sm">
      <div v-for="target in targets" :key="target.metric" class="flex min-w-0 justify-between gap-2">
        <dt class="text-stone-300">{{ target.label }}</dt>
        <dd class="whitespace-nowrap text-right font-medium tabular-nums text-stone-100">
          {{ target.displayValue }}
        </dd>
      </div>
    </dl>
  </section>
</template>
