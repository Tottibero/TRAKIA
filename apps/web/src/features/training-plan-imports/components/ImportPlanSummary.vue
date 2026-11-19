<script setup lang="ts">
import { computed } from 'vue'
import type { TrainingPlanDefinition } from '@trakia/contracts'
import { presentImportPlanSummary } from '../import-plan-summary'

const props = defineProps<{
  plan: TrainingPlanDefinition
  exerciseNames: ReadonlyMap<string, string>
}>()

const summary = computed(() => presentImportPlanSummary(props.plan, props.exerciseNames))

type MetricPill = {
  label: string
  tone: 'sessions' | 'exercises' | 'circuits' | 'time' | 'rounds' | 'reps' | 'neutral'
}

function metricPills(value?: string): MetricPill[] {
  return (
    value
      ?.split(' · ')
      .map((part) => part.trim())
      .filter(Boolean) ?? []
  ).map((label) => ({
    label,
    tone: metricTone(label),
  }))
}

function metricTone(label: string): MetricPill['tone'] {
  if (/\b\d+\s+sesiones?\b/i.test(label)) return 'sessions'
  if (/\b\d+\s+ejercicios?\b/i.test(label)) return 'exercises'
  if (/\b\d+\s+circuitos?\b/i.test(label)) return 'circuits'
  if (/\b\d+\s+rondas?\b/i.test(label)) return 'rounds'
  if (/\b\d+\s*×\s*\d+|\b\d+(?:[.,]\d+)?\s*rep\.?/i.test(label)) return 'reps'
  if (/\b(descanso|hasta)\b|\b\d+(?:[.,]\d+)?\s*(?:s|m)\b/i.test(label)) return 'time'
  return 'neutral'
}

function pillClass(label: string): string {
  const tone = metricTone(label)
  return tone === 'neutral' ? '' : `import-plan-summary__pill--${tone}`
}
</script>

<template>
  <section class="import-plan-summary" aria-label="Contenido del plan que se importará">
    <header class="import-plan-summary__header">
      <p class="import-plan-summary__name">{{ plan.name }}</p>
      <ul class="import-plan-summary__pills" aria-label="Resumen">
        <li class="import-plan-summary__pill">{{ summary.period }}</li>
        <li
          class="import-plan-summary__pill"
          :class="pillClass(`${summary.sessionCount} ${summary.sessionCount === 1 ? 'sesión' : 'sesiones'}`)"
        >
          {{ summary.sessionCount }} {{ summary.sessionCount === 1 ? 'sesión' : 'sesiones' }}
        </li>
        <li
          class="import-plan-summary__pill"
          :class="pillClass(`${summary.scheduledExerciseCount} ejercicios`)"
        >
          {{ summary.scheduledExerciseCount }} ejercicios
        </li>
      </ul>
    </header>

    <ul class="import-plan-summary__sessions">
      <li v-for="session in summary.sessions" :key="session.key" class="import-plan-summary__session">
        <details>
          <summary class="import-plan-summary__trigger">
            <span class="import-plan-summary__session-date">{{ session.date }}</span>
            <span class="import-plan-summary__session-content">
              <ul class="import-plan-summary__pills" aria-label="Contenido de la sesión">
                <li
                  v-for="count in session.counts"
                  :key="count"
                  class="import-plan-summary__pill"
                  :class="pillClass(count)"
                >
                  {{ count }}
                </li>
              </ul>
              <svg class="import-plan-summary__chevron" aria-hidden="true" viewBox="0 0 20 20" fill="none">
                <path
                  d="m5.5 7.5 4.5 4.5 4.5-4.5"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.6"
                />
              </svg>
            </span>
          </summary>

          <div class="import-plan-summary__content">
            <section
              v-for="block in session.blocks"
              :key="block.key"
              class="import-plan-summary__block"
              :aria-label="block.heading"
            >
              <div v-if="block.heading || block.details" class="import-plan-summary__block-header">
                <p v-if="block.heading" class="import-plan-summary__block-heading">
                  {{ block.heading }}
                </p>
                <ul v-if="block.details" class="import-plan-summary__pills" aria-label="Métricas del bloque">
                  <li
                    v-for="metric in metricPills(block.details)"
                    :key="metric.label"
                    class="import-plan-summary__pill"
                    :class="`import-plan-summary__pill--${metric.tone}`"
                  >
                    {{ metric.label }}
                  </li>
                </ul>
              </div>
              <ul v-if="block.items.length" class="import-plan-summary__items">
                <li v-for="item in block.items" :key="item.key" class="import-plan-summary__item">
                  <div class="import-plan-summary__item-row">
                    <span class="import-plan-summary__item-name">{{ item.label }}</span>
                    <ul
                      v-if="item.details"
                      class="import-plan-summary__pills import-plan-summary__item-pills"
                      aria-label="Objetivos y descansos"
                    >
                      <li
                        v-for="metric in metricPills(item.details)"
                        :key="metric.label"
                        class="import-plan-summary__pill"
                        :class="`import-plan-summary__pill--${metric.tone}`"
                      >
                        {{ metric.label }}
                      </li>
                    </ul>
                  </div>
                </li>
              </ul>
            </section>
          </div>
        </details>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.import-plan-summary {
  display: grid;
  gap: 0.375rem;
  min-width: 0;
}

.import-plan-summary__header {
  display: grid;
  gap: 0.375rem;
  min-width: 0;
}

.import-plan-summary__name {
  margin: 0;
  color: var(--trakia-text);
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.import-plan-summary__pills,
.import-plan-summary__sessions,
.import-plan-summary__items {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.import-plan-summary__pills {
  align-items: center;
}

.import-plan-summary__pill {
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  border-radius: var(--trakia-radius-control);
  background: var(--trakia-surface-raised);
  padding: 0.125rem 0.375rem;
  color: var(--trakia-text-strong);
  font-size: 0.8125rem;
  line-height: 1.35;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.import-plan-summary__pill--time {
  background: color-mix(in srgb, var(--trakia-warning) 18%, var(--trakia-surface-raised));
  color: var(--trakia-warning);
}

.import-plan-summary__pill--sessions {
  background: color-mix(in srgb, var(--trakia-session) 18%, var(--trakia-surface-raised));
  color: var(--trakia-session);
}

.import-plan-summary__pill--exercises {
  background: color-mix(in srgb, var(--trakia-exercise) 18%, var(--trakia-surface-raised));
  color: var(--trakia-exercise);
}

.import-plan-summary__pill--circuits {
  background: color-mix(in srgb, var(--trakia-circuit) 18%, var(--trakia-surface-raised));
  color: var(--trakia-circuit);
}

.import-plan-summary__pill--rounds {
  background: color-mix(in srgb, var(--trakia-success) 18%, var(--trakia-surface-raised));
  color: var(--trakia-success);
}

.import-plan-summary__pill--reps {
  background: color-mix(in srgb, var(--trakia-info) 18%, var(--trakia-surface-raised));
  color: var(--trakia-info);
}

.import-plan-summary__session {
  width: 100%;
  border-top: 1px solid var(--trakia-border);
}

.import-plan-summary__trigger {
  min-height: 2.75rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  cursor: pointer;
  list-style: none;
}

.import-plan-summary__trigger::-webkit-details-marker {
  display: none;
}

.import-plan-summary__trigger:focus-visible {
  outline: 3px solid var(--trakia-focus);
  outline-offset: 2px;
}

.import-plan-summary__session-date {
  min-width: 0;
  flex: 0 1 auto;
  color: var(--trakia-text-strong);
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.import-plan-summary__session-content {
  min-width: 0;
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: flex-end;
  gap: 0.375rem;
}

.import-plan-summary__session-content .import-plan-summary__pills {
  justify-content: flex-end;
}

.import-plan-summary__chevron {
  width: 1rem;
  height: 1rem;
  flex: 0 0 auto;
  color: var(--trakia-muted);
  transition: transform 140ms ease-out;
}

details[open] > .import-plan-summary__trigger .import-plan-summary__chevron {
  transform: rotate(180deg);
}

.import-plan-summary__content {
  display: grid;
  gap: 0.5rem;
  padding: 0 0 0.75rem;
}

.import-plan-summary__block {
  min-width: 0;
}

.import-plan-summary__block-header,
.import-plan-summary__item-row {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.25rem 0.5rem;
}

.import-plan-summary__block-heading {
  min-width: 0;
  flex: 1 1 8rem;
  margin: 0;
  color: var(--trakia-text-strong);
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.import-plan-summary__block-header .import-plan-summary__pills,
.import-plan-summary__item-pills {
  justify-content: flex-end;
  margin-left: auto;
}

.import-plan-summary__items {
  display: grid;
  gap: 0.25rem;
}

.import-plan-summary__item-row {
  align-items: flex-start;
}

.import-plan-summary__item-name {
  min-width: 0;
  flex: 1 1 10rem;
  color: var(--trakia-text);
  font-size: 0.8125rem;
  font-weight: 500;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

@media (prefers-reduced-motion: reduce) {
  .import-plan-summary__chevron {
    transition: none;
  }
}
</style>
