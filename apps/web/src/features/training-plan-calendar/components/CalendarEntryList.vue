<script setup lang="ts">
import type { PlanDate, TrainingPlanCalendarResponse } from '@trakia/contracts'
import { getCalendarSessionPresentation } from '../calendar-presentation.js'

type CalendarEntry = TrainingPlanCalendarResponse['days'][number]['entries'][number]
type CalendarSession = Extract<CalendarEntry, { type: 'session' }>

const props = defineProps<{
  entries: CalendarEntry[]
  weekStart: PlanDate
  selectedDate: PlanDate
}>()

function sessionPresentation(entry: CalendarSession) {
  return getCalendarSessionPresentation(entry.execution?.status)
}

function sessionDetailLocation(entry: CalendarSession) {
  const presentation = sessionPresentation(entry)
  return {
    name: 'training-plan-session-detail',
    params: { planId: entry.planId, sessionId: entry.sessionId },
    query: {
      week: props.weekStart,
      day: props.selectedDate,
      ...(presentation.view === 'summary' ? { view: 'summary' } : {}),
    },
  }
}
</script>

<template>
  <ul class="grid gap-2.5 rounded-xl bg-[var(--trakia-surface-raised)] p-3">
    <li
      v-for="entry in entries"
      :key="entry.type === 'session' ? entry.sessionId : entry.entryId"
      class="min-w-0 py-2"
    >
      <article v-if="entry.type === 'session'" class="flex min-w-0 items-center justify-between gap-3">
        <div class="min-w-0 flex-1">
          <RouterLink
            class="block min-h-6 max-w-full break-words py-0.5 text-base font-semibold leading-[1.4] text-[var(--trakia-text)] [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trakia-focus)]"
            :to="sessionDetailLocation(entry)"
          >
            {{ entry.planName }}
          </RouterLink>
          <p
            class="mt-1 inline-flex min-h-6 max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium leading-tight whitespace-nowrap"
            :class="`calendar-session-status--${sessionPresentation(entry).tone}`"
          >
            <svg
              v-if="entry.execution?.status === 'completed'"
              aria-hidden="true"
              viewBox="0 0 16 16"
              class="size-3 shrink-0"
              fill="none"
            >
              <path d="m3.5 8.5 3 3 6-7" />
            </svg>
            <span>{{ sessionPresentation(entry).label }}</span>
          </p>
        </div>
        <RouterLink
          class="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[var(--trakia-border)] bg-[var(--trakia-surface)] px-2.5 text-[0.8125rem] font-semibold whitespace-nowrap text-[var(--trakia-text)] transition hover:border-[var(--trakia-muted-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trakia-focus)]"
          :aria-label="`${sessionPresentation(entry).action} de ${entry.planName}`"
          :to="sessionDetailLocation(entry)"
        >
          {{ sessionPresentation(entry).action }}
          <svg aria-hidden="true" viewBox="0 0 16 16" class="size-3.5 shrink-0" fill="none">
            <path d="M3 8h9m-4-4 4 4-4 4" />
          </svg>
        </RouterLink>
      </article>
      <p v-else class="min-h-11 py-2 text-sm text-[var(--trakia-text-strong)]">
        Descanso <span class="text-[var(--trakia-muted)]">·</span> {{ entry.planName }}
      </p>
    </li>
  </ul>
</template>

<style scoped>
.calendar-session-status--pending {
  background: var(--trakia-surface);
  color: var(--trakia-muted);
}

.calendar-session-status--complete {
  background: color-mix(in srgb, var(--trakia-success) 12%, var(--trakia-surface-raised));
  color: var(--trakia-success);
}

.calendar-session-status--in-progress,
.calendar-session-status--paused {
  background: color-mix(in srgb, var(--trakia-warning) 12%, var(--trakia-surface-raised));
  color: var(--trakia-warning);
}

.calendar-session-status--complete svg,
.calendar-session-status--in-progress svg,
.calendar-session-status--paused svg {
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
  fill: none;
}
</style>
