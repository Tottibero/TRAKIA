<script setup lang="ts">
import type { PlanDate, TrainingPlanCalendarResponse } from '@trakia/contracts'
import { describeCalendarDay } from '../calendar-presentation.js'
import { formatDayAbbreviation, formatDayHeading } from '../calendar-dates.js'

type CalendarDay = TrainingPlanCalendarResponse['days'][number]

const props = defineProps<{
  days: CalendarDay[]
  currentDate: PlanDate
  selectedDate: PlanDate
  weekLabel: string
  hasData: boolean
  hasError: boolean
}>()

const emit = defineEmits<{
  selectDate: [date: PlanDate]
}>()

function hasSessions(day: CalendarDay) {
  return day.entries.some((entry) => entry.type === 'session')
}

function dayLabel(day: CalendarDay) {
  const todayLabel = day.date === props.currentDate ? ', hoy' : ''
  const availability = { hasData: props.hasData, hasError: props.hasError }
  return `${formatDayHeading(day.date)}${todayLabel}. ${describeCalendarDay(day, availability)}`
}
</script>

<template>
  <section class="mb-6 rounded-xl bg-[var(--trakia-surface)] p-2" aria-label="Selector semanal">
    <div class="grid grid-cols-7 gap-2" role="group" :aria-label="`Días de ${weekLabel}`">
      <button
        v-for="day in days"
        :key="day.date"
        class="relative flex h-[4.5rem] min-w-0 flex-col items-center justify-center gap-1 rounded-lg border text-center transition focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trakia-focus)]"
        :class="
          selectedDate === day.date
            ? 'border-[var(--trakia-accent)] bg-[var(--trakia-surface)] text-[var(--trakia-text)]'
            : day.date === currentDate
              ? 'border-[var(--trakia-text)] text-[var(--trakia-text)]'
              : 'border-transparent text-[var(--trakia-muted)] hover:border-[var(--trakia-border)] hover:text-[var(--trakia-text)]'
        "
        type="button"
        :aria-label="dayLabel(day)"
        :aria-current="day.date === currentDate ? 'date' : undefined"
        :aria-pressed="selectedDate === day.date"
        @click="emit('selectDate', day.date)"
      >
        <span class="text-[0.6875rem] font-semibold uppercase leading-3">{{
          formatDayAbbreviation(day.date)
        }}</span>
        <span class="text-base font-semibold tabular-nums leading-5">{{ Number(day.date.slice(-2)) }}</span>
        <span
          class="min-h-3 text-[0.5625rem] font-semibold leading-3"
          :class="day.date === currentDate ? 'text-[var(--trakia-text)]' : 'text-[var(--trakia-muted)]'"
        >
          {{ day.date === currentDate ? 'Hoy' : '\u00a0' }}
        </span>
        <span
          v-if="hasSessions(day)"
          class="absolute bottom-1 size-1 rounded-full bg-[var(--trakia-accent)]"
          aria-hidden="true"
        ></span>
      </button>
    </div>
  </section>
</template>
