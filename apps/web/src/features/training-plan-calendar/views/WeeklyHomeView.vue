<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import { useAuth } from '@/features/auth'
import AppPageShell from '@/shared/components/AppPageShell.vue'
import CalendarDaySelector from '../components/CalendarDaySelector.vue'
import CalendarEntryList from '../components/CalendarEntryList.vue'
import CalendarWeekHeader from '../components/CalendarWeekHeader.vue'
import { useTrainingPlanCalendar } from '../useTrainingPlanCalendar'
import {
  addCivilDays,
  formatCompactWeekRange,
  formatDayHeading,
  formatWeekRange,
  getMadridCivilDate,
  getNextMadridMidnight,
  getWeekDates,
  mondayOfCivilWeek,
  parseWeekStart,
} from '../calendar-dates.js'

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const currentDate = ref(getMadridCivilDate())
const explicitWeek = computed(() => parseWeekStart(route.query.week))
const currentWeekStart = computed(() => mondayOfCivilWeek(currentDate.value))
const weekStart = computed(() => explicitWeek.value ?? currentWeekStart.value)
const weekEnd = computed(() => addCivilDays(weekStart.value, 6))
const weekDates = computed(() => getWeekDates(weekStart.value))
const calendarQuery = useTrainingPlanCalendar(weekStart, weekEnd)
const days = computed(
  () => calendarQuery.data.value?.days ?? weekDates.value.map((date) => ({ date, entries: [] as never[] })),
)
const hasNoImportedPlans = computed(() => calendarQuery.data.value?.hasImportedPlans === false)
const weekLabel = computed(() => formatCompactWeekRange(weekStart.value, weekEnd.value))
const previousWeekLabel = computed(() =>
  formatWeekRange(addCivilDays(weekStart.value, -7), addCivilDays(weekEnd.value, -7)),
)
const nextWeekLabel = computed(() =>
  formatWeekRange(addCivilDays(weekStart.value, 7), addCivilDays(weekEnd.value, 7)),
)
const selectedDate = computed(() => {
  const requestedDate = typeof route.query.day === 'string' ? route.query.day : undefined
  if (requestedDate && weekDates.value.includes(requestedDate)) return requestedDate
  const legacyDate = Array.isArray(route.query.expanded)
    ? route.query.expanded.find((date) => typeof date === 'string' && weekDates.value.includes(date))
    : typeof route.query.expanded === 'string' && weekDates.value.includes(route.query.expanded)
      ? route.query.expanded
      : undefined
  if (legacyDate) return legacyDate
  return weekDates.value.includes(currentDate.value) ? currentDate.value : weekStart.value
})
const selectedDay = computed(() => days.value.find((day) => day.date === selectedDate.value) ?? days.value[0])

let midnightTimer: number | undefined

function queryWithoutCalendarState() {
  const query = { ...route.query }
  delete query.week
  delete query.day
  delete query.expanded
  return query
}

function syncCivilDate() {
  const previousDate = currentDate.value
  const nextDate = getMadridCivilDate()
  if (previousDate !== nextDate) {
    const previousWeek = mondayOfCivilWeek(previousDate)
    const nextWeek = mondayOfCivilWeek(nextDate)
    currentDate.value = nextDate
    if (previousWeek !== nextWeek && !explicitWeek.value) {
      void router.replace({ name: 'home', query: queryWithoutCalendarState() })
    }
  }
  scheduleMidnightRefresh()
}

function scheduleMidnightRefresh() {
  if (midnightTimer !== undefined) window.clearTimeout(midnightTimer)
  const delay = Math.max(0, getNextMadridMidnight() - Date.now() + 25)
  midnightTimer = window.setTimeout(syncCivilDate, delay)
}

function onVisibilityChange() {
  if (!globalThis.document.hidden) syncCivilDate()
}

function onWindowFocus() {
  syncCivilDate()
}

function navigateWeeks(offset: number) {
  const nextWeek = addCivilDays(weekStart.value, offset * 7)
  const query: LocationQueryRaw = { ...route.query, week: nextWeek }
  delete query.day
  delete query.expanded
  void router.push({ name: 'home', query })
}

function selectDay(date: string) {
  const query: LocationQueryRaw = { ...route.query, day: date }
  if (!explicitWeek.value) delete query.week
  delete query.expanded
  void router.replace({ name: 'home', query })
}

onMounted(() => {
  globalThis.document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('focus', onWindowFocus)
  scheduleMidnightRefresh()
})

onBeforeUnmount(() => {
  globalThis.document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('focus', onWindowFocus)
  if (midnightTimer !== undefined) window.clearTimeout(midnightTimer)
})
</script>

<template>
  <AppPageShell variant="calendar">
    <template #actions>
      <button
        class="app-shell__action"
        type="button"
        :disabled="auth.isLoggingOut.value"
        @click="auth.logout()"
      >
        {{ auth.isLoggingOut.value ? 'Saliendo…' : 'Cerrar sesión' }}
      </button>
    </template>

    <main
      class="mx-auto w-full max-w-[34rem] bg-[var(--trakia-background)] px-5 pb-6 pt-6 text-[var(--trakia-text)]"
    >
      <CalendarWeekHeader
        :week-label="weekLabel"
        :previous-week-label="previousWeekLabel"
        :next-week-label="nextWeekLabel"
        @navigate-week="navigateWeeks"
      />

      <div
        v-if="calendarQuery.isPending.value && !calendarQuery.data.value"
        class="mb-4 flex min-h-6 items-center gap-2 text-sm text-[var(--trakia-muted)]"
        role="status"
        aria-live="polite"
      >
        <span
          class="size-1.5 animate-pulse rounded-full bg-[var(--trakia-muted-subtle)]"
          aria-hidden="true"
        ></span>
        Cargando la semana…
      </div>
      <div
        v-else-if="calendarQuery.isError.value && !calendarQuery.data.value"
        class="mb-4 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between"
        role="alert"
      >
        <p class="text-[var(--trakia-text-strong)]">No se pudo cargar esta semana.</p>
        <button
          class="min-h-11 shrink-0 rounded-lg border border-[var(--trakia-danger-border)] px-4 font-medium text-[var(--trakia-danger)] transition hover:bg-[var(--trakia-danger-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trakia-focus)]"
          type="button"
          @click="calendarQuery.refetch()"
        >
          Reintentar
        </button>
      </div>
      <p
        v-else-if="calendarQuery.isError.value && calendarQuery.data.value"
        class="mb-4 text-sm text-[var(--trakia-warning)]"
        role="status"
        aria-live="polite"
      >
        No se pudo actualizar la semana. Se muestran los datos guardados.
      </p>
      <p
        v-else-if="calendarQuery.isFetching.value && calendarQuery.data.value"
        class="mb-4 text-sm text-[var(--trakia-muted)]"
        role="status"
        aria-live="polite"
      >
        Actualizando…
      </p>

      <section v-if="hasNoImportedPlans" class="mb-6" aria-labelledby="no-plans-title">
        <h2 id="no-plans-title" class="text-lg font-semibold text-[var(--trakia-text)]">Aún no hay planes</h2>
        <p class="mt-1 text-sm leading-6 text-[var(--trakia-muted)]">
          Importa un plan para ver aquí tus sesiones.
        </p>
        <RouterLink
          class="mt-3 inline-flex min-h-11 items-center rounded-lg border border-[var(--trakia-border)] bg-[var(--trakia-surface)] px-3 text-sm font-semibold text-[var(--trakia-text)] transition hover:border-[var(--trakia-muted-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trakia-focus)]"
          :to="{ name: 'training-plan-import' }"
        >
          Importar planes
        </RouterLink>
      </section>

      <CalendarDaySelector
        :days="days"
        :current-date="currentDate"
        :selected-date="selectedDate"
        :week-label="weekLabel"
        :has-data="Boolean(calendarQuery.data.value)"
        :has-error="calendarQuery.isError.value"
        @select-date="selectDay"
      />

      <section v-if="selectedDay" class="pt-1" aria-labelledby="selected-day-title">
        <div class="mb-3 flex min-h-7 items-center">
          <h2 id="selected-day-title" class="text-lg font-semibold leading-[1.35] text-[var(--trakia-text)]">
            {{ formatDayHeading(selectedDay.date) }}
          </h2>
        </div>

        <div class="min-h-[12.5rem]">
          <p
            v-if="!calendarQuery.data.value && calendarQuery.isPending.value"
            class="pt-4 text-sm text-[var(--trakia-muted)]"
            role="status"
          >
            Cargando sesiones…
          </p>
          <p
            v-else-if="!calendarQuery.data.value && calendarQuery.isError.value"
            class="pt-4 text-sm text-[var(--trakia-muted)]"
            role="status"
          >
            Las sesiones no están disponibles.
          </p>
          <p
            v-else-if="selectedDay.entries.length === 0"
            class="pt-4 text-sm text-[var(--trakia-muted)]"
            role="status"
          >
            Sin sesiones planificadas.
          </p>
          <CalendarEntryList
            v-else
            :entries="selectedDay.entries"
            :week-start="weekStart"
            :selected-date="selectedDate"
          />
        </div>
      </section>
    </main>
  </AppPageShell>
</template>
