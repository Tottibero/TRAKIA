<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/features/auth'
import { useTrainingPlanCalendar } from '../useTrainingPlanCalendar'
import {
  addCivilDays,
  formatDayHeading,
  formatWeekRange,
  getMadridCivilDate,
  getNextMadridMidnight,
  getWeekDates,
  mondayOfCivilWeek,
  parseWeekStart,
  resolveExpandedDates,
  serializeExpandedDates,
} from '../calendar-dates.js'
import { describeCalendarBlock } from '../calendar-presentation.js'

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const currentDate = ref(getMadridCivilDate())
const explicitWeek = computed(() => parseWeekStart(route.query.week))
const currentWeekStart = computed(() => mondayOfCivilWeek(currentDate.value))
const weekStart = computed(() => explicitWeek.value ?? currentWeekStart.value)
const weekEnd = computed(() => addCivilDays(weekStart.value, 6))
const weekDates = computed(() => getWeekDates(weekStart.value))
const expandedDates = computed(() =>
  resolveExpandedDates(route.query.expanded, weekStart.value, currentDate.value),
)
const calendarQuery = useTrainingPlanCalendar(weekStart, weekEnd)
const days = computed(
  () => calendarQuery.data.value?.days ?? weekDates.value.map((date) => ({ date, entries: [] as never[] })),
)
const hasNoEntries = computed(
  () =>
    calendarQuery.data.value?.hasImportedPlans === true &&
    calendarQuery.data.value.days.every((day) => day.entries.length === 0),
)
const hasNoImportedPlans = computed(() => calendarQuery.data.value?.hasImportedPlans === false)
const isCurrentWeek = computed(() => weekStart.value === currentWeekStart.value)
const weekLabel = computed(() => formatWeekRange(weekStart.value, weekEnd.value))

let midnightTimer: number | undefined

function queryWithoutCalendarState() {
  const query = { ...route.query }
  delete query.week
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
      void router.replace({
        name: 'home',
        query: { ...queryWithoutCalendarState(), expanded: nextDate },
      })
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
  void router.push({
    name: 'home',
    query: {
      ...route.query,
      week: nextWeek,
      expanded: '',
    },
  })
}

function goToCurrentWeek() {
  void router.push({ name: 'home', query: queryWithoutCalendarState() })
}

function toggleDay(date: string) {
  const expanded = new Set(expandedDates.value)
  if (expanded.has(date)) expanded.delete(date)
  else expanded.add(date)

  const query = { ...route.query }
  if (!explicitWeek.value) delete query.week
  query.expanded = serializeExpandedDates([...expanded])
  void router.replace({ name: 'home', query })
}

function dayStatus(day: (typeof days.value)[number]) {
  if (!calendarQuery.data.value) {
    return calendarQuery.isError.value ? 'No disponible' : 'Cargando…'
  }
  if (day.entries.length === 0) return 'Sin planificación'
  const sessions = day.entries.filter((entry) => entry.type === 'session').length
  const rests = day.entries.filter((entry) => entry.type === 'rest').length
  const parts: string[] = []
  if (sessions > 0) parts.push(`${sessions} ${sessions === 1 ? 'sesión' : 'sesiones'}`)
  if (rests > 0) parts.push(`${rests} ${rests === 1 ? 'descanso' : 'descansos'}`)
  return parts.join(' · ')
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
  <main class="min-h-screen bg-[#10110f] px-4 py-5 text-stone-100 sm:px-8 sm:py-8">
    <div class="mx-auto max-w-5xl">
      <header class="flex items-center justify-between gap-4">
        <RouterLink
          class="inline-flex min-h-11 items-center text-sm font-semibold tracking-[0.24em] text-stone-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime-300"
          to="/"
          aria-label="TRAKIA, inicio"
        >
          TRAKIA
        </RouterLink>
        <div class="flex items-center gap-4">
          <span class="hidden max-w-56 truncate text-xs text-stone-400 sm:inline">{{
            auth.user.value?.email
          }}</span>
          <button
            class="min-h-11 rounded-md px-3 text-sm text-stone-300 transition hover:text-lime-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
            type="button"
            :disabled="auth.isLoggingOut.value"
            @click="auth.logout()"
          >
            {{ auth.isLoggingOut.value ? 'Saliendo…' : 'Cerrar sesión' }}
          </button>
        </div>
      </header>

      <section class="pb-6 pt-10 sm:flex sm:items-end sm:justify-between sm:gap-6 sm:pb-8 sm:pt-14">
        <div>
          <h1 class="text-3xl font-semibold tracking-[-0.035em] text-stone-50 sm:text-4xl">
            Planificación semanal
          </h1>
          <p class="mt-3 text-base text-stone-400">{{ weekLabel }}</p>
        </div>
        <nav class="mt-5 flex items-center gap-2 sm:mt-0" aria-label="Navegación de semanas">
          <button
            class="grid size-11 shrink-0 place-items-center rounded-md border border-white/10 text-stone-200 transition hover:border-lime-300/50 hover:text-lime-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
            type="button"
            :aria-label="`Semana anterior a ${formatWeekRange(addCivilDays(weekStart, -7), addCivilDays(weekEnd, -7))}`"
            @click="navigateWeeks(-1)"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" class="size-5" fill="none">
              <path d="m12.5 4.5-5.5 5.5 5.5 5.5" stroke="currentColor" stroke-width="1.7" />
            </svg>
          </button>
          <button
            v-if="!isCurrentWeek"
            class="min-h-11 rounded-md border border-white/10 px-4 text-sm font-medium text-stone-200 transition hover:border-lime-300/50 hover:text-lime-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
            type="button"
            @click="goToCurrentWeek"
          >
            Esta semana
          </button>
          <button
            class="grid size-11 shrink-0 place-items-center rounded-md border border-white/10 text-stone-200 transition hover:border-lime-300/50 hover:text-lime-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
            type="button"
            :aria-label="`Semana siguiente a ${formatWeekRange(addCivilDays(weekStart, 7), addCivilDays(weekEnd, 7))}`"
            @click="navigateWeeks(1)"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" class="size-5" fill="none">
              <path d="m7.5 4.5 5.5 5.5-5.5 5.5" stroke="currentColor" stroke-width="1.7" />
            </svg>
          </button>
        </nav>
      </section>

      <div
        v-if="calendarQuery.isPending.value && !calendarQuery.data.value"
        class="mb-5 flex min-h-12 items-center gap-3 rounded-lg border border-white/10 bg-white/[0.035] px-4 text-sm text-stone-300"
        role="status"
        aria-live="polite"
      >
        <span class="inline-flex size-4 animate-pulse rounded-sm bg-lime-300/60" aria-hidden="true"></span>
        Cargando la planificación de esta semana…
      </div>
      <div
        v-else-if="calendarQuery.isError.value && !calendarQuery.data.value"
        class="mb-5 flex flex-col gap-3 rounded-lg border border-rose-300/30 bg-rose-300/[0.06] p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
        role="alert"
      >
        <p class="text-stone-200">No se pudo cargar la planificación de esta semana.</p>
        <button
          class="min-h-11 shrink-0 rounded-md border border-rose-200/40 px-4 font-medium text-rose-100 transition hover:bg-rose-200/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-200"
          type="button"
          aria-label="Reintentar cargar la planificación semanal"
          @click="calendarQuery.refetch()"
        >
          Reintentar
        </button>
      </div>
      <div
        v-else-if="calendarQuery.isError.value && calendarQuery.data.value"
        class="mb-5 flex flex-col gap-3 rounded-lg border border-amber-200/30 bg-amber-200/[0.05] p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
        role="status"
        aria-live="polite"
      >
        <p class="text-stone-200">No se pudo actualizar esta semana. Sigues viendo los datos guardados.</p>
        <button
          class="min-h-11 shrink-0 rounded-md border border-amber-100/40 px-4 font-medium text-amber-100 transition hover:bg-amber-100/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-100"
          type="button"
          aria-label="Reintentar actualizar la planificación semanal"
          @click="calendarQuery.refetch()"
        >
          Reintentar
        </button>
      </div>
      <p
        v-else-if="calendarQuery.isFetching.value && calendarQuery.data.value"
        class="mb-4 text-xs text-stone-400"
        role="status"
        aria-live="polite"
      >
        Actualizando planificación…
      </p>

      <section
        v-if="hasNoImportedPlans"
        class="mb-5 flex flex-col gap-4 border-y border-white/10 py-5 sm:flex-row sm:items-center sm:justify-between"
        aria-labelledby="no-plans-title"
      >
        <div>
          <h2 id="no-plans-title" class="text-lg font-semibold text-stone-100">
            Aún no hay planes importados
          </h2>
          <p class="mt-1 max-w-2xl text-sm leading-6 text-stone-400">
            Cuando importes un plan, aquí aparecerán sus sesiones y descansos semana a semana.
          </p>
        </div>
        <RouterLink
          class="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-lime-300 px-4 text-sm font-semibold text-[#20231d] transition hover:bg-lime-200 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-lime-300"
          to="/training-plans/import"
        >
          Importar un plan
        </RouterLink>
      </section>
      <p
        v-else-if="hasNoEntries"
        class="mb-5 border-y border-white/10 py-4 text-sm leading-6 text-stone-400"
        role="status"
      >
        No hay sesiones ni descansos planificados para esta semana. Puedes consultar otras semanas con los
        controles anteriores.
      </p>

      <section aria-label="Días de la semana" class="border-t border-white/10">
        <ol>
          <li v-for="day in days" :key="day.date" class="border-b border-white/10">
            <button
              class="flex min-h-[4.5rem] w-full items-center gap-3 py-3 text-left transition hover:bg-white/[0.025] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-lime-300 sm:gap-5 sm:px-3"
              type="button"
              :aria-expanded="expandedDates.includes(day.date)"
              :aria-controls="`day-panel-${day.date}`"
              :aria-current="day.date === currentDate ? 'date' : undefined"
              :aria-label="`${formatDayHeading(day.date)}${day.date === currentDate ? ', hoy' : ''}. ${dayStatus(day)}. ${expandedDates.includes(day.date) ? 'Contraer día' : 'Expandir día'}`"
              @click="toggleDay(day.date)"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                class="size-4 shrink-0 text-stone-400 transition-transform duration-150"
                :class="expandedDates.includes(day.date) ? 'rotate-90' : ''"
                fill="none"
              >
                <path d="m7 4.5 5.5 5.5L7 15.5" stroke="currentColor" stroke-width="1.6" />
              </svg>
              <span class="w-36 shrink-0 sm:w-44">
                <span class="block font-medium text-stone-100">{{ formatDayHeading(day.date) }}</span>
                <span
                  v-if="day.date === currentDate"
                  class="mt-0.5 block text-xs font-semibold text-lime-300"
                >
                  Hoy
                </span>
              </span>
              <span
                class="min-w-0 flex-1 break-words text-sm"
                :class="calendarQuery.data.value && day.entries.length ? 'text-stone-300' : 'text-stone-400'"
              >
                {{ dayStatus(day) }}
              </span>
            </button>

            <div
              v-show="expandedDates.includes(day.date)"
              :id="`day-panel-${day.date}`"
              class="pb-5 pl-7 pr-1 sm:pb-6 sm:pl-14 sm:pr-3"
            >
              <div
                v-if="calendarQuery.isPending.value && !calendarQuery.data.value"
                class="space-y-3 py-2"
                aria-hidden="true"
              >
                <div class="h-3 w-2/5 animate-pulse rounded bg-white/10"></div>
                <div class="h-3 w-3/5 animate-pulse rounded bg-white/[0.07]"></div>
              </div>
              <p
                v-else-if="calendarQuery.isError.value && !calendarQuery.data.value"
                class="py-2 text-sm text-stone-400"
              >
                La información de este día estará disponible cuando se complete la consulta.
              </p>
              <p v-else-if="day.entries.length === 0" class="py-2 text-sm text-stone-400">
                {{ hasNoImportedPlans ? 'Sin planes importados.' : 'Sin planificación para este día.' }}
              </p>
              <ul v-else class="divide-y divide-white/[0.08]">
                <li
                  v-for="entry in day.entries"
                  :key="entry.type === 'session' ? entry.sessionId : entry.entryId"
                  class="py-4 first:pt-2 last:pb-2"
                >
                  <article v-if="entry.type === 'session'">
                    <h3 class="break-words font-medium text-stone-100">
                      Sesión <span class="text-stone-400">·</span> {{ entry.planName }}
                      <span class="text-stone-400">·</span> {{ entry.sessionKey }}
                    </h3>
                    <div class="mt-3 grid gap-3 sm:grid-cols-2">
                      <section
                        v-for="(block, blockIndex) in entry.blocks"
                        :key="block.key"
                        class="min-w-0 rounded-md border border-white/[0.08] bg-white/[0.025] px-3 py-3"
                        :aria-label="`Bloque ${blockIndex + 1}: ${describeCalendarBlock(block).heading}`"
                      >
                        <h4 class="text-sm font-medium text-lime-200">
                          {{ describeCalendarBlock(block).heading }}
                        </h4>
                        <ul class="mt-2 space-y-1.5">
                          <li
                            v-for="(item, itemIndex) in describeCalendarBlock(block).items"
                            :key="`${block.key}-${itemIndex}`"
                            class="flex min-w-0 items-baseline justify-between gap-3 text-sm"
                          >
                            <span class="min-w-0 break-words text-stone-300">{{ item.name }}</span>
                            <span v-if="item.detail" class="shrink-0 text-xs tabular-nums text-stone-400">{{
                              item.detail
                            }}</span>
                          </li>
                        </ul>
                      </section>
                    </div>
                  </article>
                  <p v-else class="text-sm text-stone-300">
                    <span class="font-medium text-stone-100">Descanso planificado</span>
                    <span class="text-stone-400"> · </span>{{ entry.planName }}
                  </p>
                </li>
              </ul>
            </div>
          </li>
        </ol>
      </section>
    </div>
  </main>
</template>
