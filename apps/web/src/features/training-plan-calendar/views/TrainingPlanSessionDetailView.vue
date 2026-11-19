<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ApiError } from '@/shared/api/http'
import AppPageShell from '@/shared/components/AppPageShell.vue'
import { useAuth } from '@/features/auth'
import { TrainingPlanSessionPathParamsSchema } from '@trakia/contracts'
import { useTrainingPlanSession } from '../useTrainingPlanSession'
import WorkoutStartAction from '@/features/workout-execution/components/WorkoutStartAction.vue'
import SessionBlockDetail from '../components/SessionBlockDetail.vue'
import { formatSessionDate } from '../session-detail-presentation.js'
import {
  getMadridCivilDate,
  parseWeekStart,
  resolveExpandedDates,
  serializeExpandedDates,
} from '../calendar-dates.js'

const route = useRoute()
const auth = useAuth()
const pathParams = computed(() =>
  TrainingPlanSessionPathParamsSchema.safeParse({
    planId: route.params.planId,
    sessionId: route.params.sessionId,
  }),
)
const planId = computed(() => (pathParams.value.success ? pathParams.value.data.planId : undefined))
const sessionId = computed(() => (pathParams.value.success ? pathParams.value.data.sessionId : undefined))
const sessionQuery = useTrainingPlanSession(planId, sessionId)
const homeLocation = computed(() => {
  const week = parseWeekStart(route.query.week)
  if (!week) return { name: 'home' }
  const expanded = resolveExpandedDates(route.query.expanded, week, getMadridCivilDate())
  return { name: 'home', query: { week, expanded: serializeExpandedDates(expanded) } }
})
const isNotFound = computed(
  () => sessionQuery.error.value instanceof ApiError && sessionQuery.error.value.status === 404,
)
const initialErrorMessage = computed(() =>
  isNotFound.value
    ? 'No encontramos esta sesión en el plan indicado.'
    : 'No se pudo cargar el detalle de la sesión.',
)
</script>

<template>
  <AppPageShell>
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
      class="min-h-[calc(100dvh-var(--trakia-shell-header-height))] bg-[var(--trakia-background)] px-4 py-4 text-[var(--trakia-text)] sm:px-8 sm:py-6"
    >
      <div class="mx-auto max-w-3xl">
        <nav class="pt-6" aria-label="Navegación de la sesión">
          <RouterLink
            class="inline-flex min-h-11 items-center gap-2 rounded-sm pr-3 text-sm font-medium text-stone-300 underline decoration-white/30 underline-offset-4 transition hover:text-lime-200 hover:decoration-lime-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
            :to="homeLocation"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" class="size-4" fill="none">
              <path d="m12.5 4.5-5.5 5.5 5.5 5.5" stroke="currentColor" stroke-width="1.7" />
            </svg>
            Volver a la planificación
          </RouterLink>
        </nav>

        <div
          v-if="!pathParams.success"
          class="mt-6 rounded-md border border-rose-200/30 bg-rose-200/[0.06] p-4 text-sm leading-6 text-stone-200"
          role="alert"
        >
          La dirección no identifica una sesión válida. Vuelve a la planificación para abrir una sesión
          disponible.
        </div>
        <div
          v-else-if="sessionQuery.isPending.value && !sessionQuery.data.value"
          class="mt-6 flex min-h-14 items-center gap-3 rounded-md border border-white/10 bg-white/[0.035] px-4 text-sm text-stone-300"
          role="status"
          aria-live="polite"
        >
          <span class="size-3 animate-pulse rounded-full bg-lime-300" aria-hidden="true"></span>
          Cargando detalle de la sesión…
        </div>
        <section
          v-else-if="sessionQuery.isError.value && !sessionQuery.data.value"
          class="mt-6 rounded-md border border-rose-200/30 bg-rose-200/[0.06] p-4 sm:p-5"
          role="alert"
          aria-labelledby="session-error-title"
        >
          <h1 id="session-error-title" class="text-lg font-semibold text-stone-100">
            {{ isNotFound ? 'Sesión no disponible' : 'No se pudo cargar la sesión' }}
          </h1>
          <p class="mt-2 text-sm leading-6 text-stone-300">{{ initialErrorMessage }}</p>
          <button
            v-if="!isNotFound"
            class="mt-4 inline-flex min-h-11 items-center rounded-md border border-rose-100/40 px-4 text-sm font-medium text-rose-100 transition hover:bg-rose-100/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-200"
            type="button"
            @click="sessionQuery.refetch()"
          >
            Reintentar
          </button>
        </section>

        <template v-else-if="sessionQuery.data.value">
          <div
            v-if="sessionQuery.isError.value"
            class="mt-6 flex flex-col gap-3 rounded-md border border-amber-200/30 bg-amber-200/[0.05] p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
            role="status"
            aria-live="polite"
          >
            <p class="leading-6 text-stone-200">
              No se pudo actualizar la sesión. Sigues viendo los datos guardados.
            </p>
            <button
              class="inline-flex min-h-11 shrink-0 items-center rounded-md border border-amber-100/40 px-4 font-medium text-amber-100 transition hover:bg-amber-100/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-100"
              type="button"
              @click="sessionQuery.refetch()"
            >
              Reintentar
            </button>
          </div>
          <p
            v-else-if="sessionQuery.isFetching.value"
            class="mt-5 text-sm text-stone-400"
            role="status"
            aria-live="polite"
          >
            Actualizando detalle…
          </p>

          <header class="pb-5 pt-7 sm:pb-7 sm:pt-9">
            <h1 class="break-words text-3xl font-semibold tracking-[-0.035em] text-stone-50 sm:text-4xl">
              {{ sessionQuery.data.value.plan.name }}
            </h1>
            <p class="mt-2 break-words text-base text-stone-300">
              Sesión <span class="text-stone-500">·</span> {{ sessionQuery.data.value.session.key }}
            </p>
            <time class="mt-1 block text-sm text-stone-400" :datetime="sessionQuery.data.value.session.date">
              {{ formatSessionDate(sessionQuery.data.value.session.date) }}
            </time>
          </header>

          <section aria-label="Detalle de los bloques de la sesión" class="border-y border-white/10">
            <ol>
              <li v-for="(block, index) in sessionQuery.data.value.session.blocks" :key="block.key">
                <SessionBlockDetail :block="block" :index="index" />
              </li>
            </ol>
          </section>

          <WorkoutStartAction
            :plan-id="sessionQuery.data.value.plan.id"
            :session-id="sessionQuery.data.value.session.id"
            :execution="sessionQuery.data.value.session.execution"
            :show-summary="route.query.view === 'summary'"
          />
        </template>
      </div>
    </main>
  </AppPageShell>
</template>
