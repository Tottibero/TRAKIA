<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { useRoute } from 'vue-router'
import { ApiError } from '@/shared/api/http'
import AppPageShell from '@/shared/components/AppPageShell.vue'
import { useAuth } from '@/features/auth'
import { TrainingPlanSessionPathParamsSchema } from '@trakia/contracts'
import { useTrainingPlanSession } from '../useTrainingPlanSession'
import { WorkoutExecutionSummary, WorkoutStartAction } from '@/features/workout-execution'
import SessionBlockDetail from '../components/SessionBlockDetail.vue'
import SessionRescheduleAction from '../components/SessionRescheduleAction.vue'
import { formatSessionDate } from '../session-detail-presentation.js'
import { getMadridCivilDate, parseWeekStart, resolveExpandedDates } from '../calendar-dates.js'

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
const startErrorMessage = shallowRef<string | null>(null)
const homeLocation = computed(() => {
  const week = parseWeekStart(route.query.week)
  const day = typeof route.query.day === 'string' ? route.query.day : undefined
  if (!week) return { name: 'home', query: day ? { day } : undefined }
  const expanded = resolveExpandedDates(route.query.expanded, week, getMadridCivilDate())
  const selectedDay = day ?? expanded[0]
  return { name: 'home', query: { week, ...(selectedDay ? { day: selectedDay } : {}) } }
})
const sessionStatus = computed(() => {
  const status = sessionQuery.data.value?.session.execution?.status
  if (status === 'in_progress') return 'En curso'
  if (status === 'paused') return 'En pausa'
  if (status === 'completed') return 'Finalizada'
  return 'Pendiente'
})
const sessionStatusClass = computed(() => {
  const status = sessionQuery.data.value?.session.execution?.status
  if (status === 'completed') return 'bg-[var(--trakia-surface)] text-[var(--trakia-success)]'
  if (status === 'in_progress' || status === 'paused')
    return 'bg-[var(--trakia-surface)] text-[var(--trakia-warning)]'
  return 'bg-[var(--trakia-surface)] text-[var(--trakia-muted)]'
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
      class="session-detail-page bg-[var(--trakia-background)] px-4 py-4 text-[var(--trakia-text)] sm:px-8 sm:py-6"
      :class="{ 'session-detail-page--pending': sessionQuery.data.value?.session.execution === null }"
    >
      <div class="mx-auto max-w-3xl">
        <nav class="pt-6" aria-label="Navegación de la sesión">
          <RouterLink
            class="inline-flex min-h-11 items-center gap-2 rounded-sm pr-3 text-sm font-medium text-[var(--trakia-muted)] underline decoration-[var(--trakia-border)] underline-offset-4 transition hover:text-[var(--trakia-text)] hover:decoration-[var(--trakia-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trakia-focus)]"
            :to="homeLocation"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" class="size-4" fill="none">
              <path d="m12.5 4.5-5.5 5.5 5.5 5.5" stroke="currentColor" stroke-width="1.7" />
            </svg>
            Volver al calendario
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
        <section
          v-else-if="startErrorMessage"
          class="mx-auto mt-8 max-w-md rounded-md border border-[var(--trakia-danger-border)] bg-[var(--trakia-danger-surface)] p-5 text-center"
          role="alert"
          aria-labelledby="session-start-error-title"
        >
          <h1 id="session-start-error-title" class="text-lg font-semibold text-[var(--trakia-text)]">
            No se pudo abrir la sesión
          </h1>
          <p class="mt-3 text-sm leading-6 text-[var(--trakia-danger-muted)]">
            {{ startErrorMessage }}
          </p>
          <RouterLink
            class="mt-6 inline-flex min-h-11 items-center justify-center rounded-[var(--trakia-radius-control)] bg-[var(--trakia-accent-action)] px-4 text-sm font-semibold text-[var(--trakia-accent-action-foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trakia-focus)]"
            :to="homeLocation"
          >
            Volver al calendario
          </RouterLink>
        </section>
        <div
          v-else-if="sessionQuery.isPending.value && !sessionQuery.data.value"
          class="mt-6 flex min-h-14 items-center gap-3 rounded-md border border-[var(--trakia-border)] bg-[var(--trakia-surface)] px-4 text-sm text-[var(--trakia-muted)]"
          role="status"
          aria-live="polite"
        >
          <span class="size-2 animate-pulse rounded-full bg-[var(--trakia-accent)]" aria-hidden="true"></span>
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

          <WorkoutExecutionSummary
            v-if="sessionQuery.data.value.session.execution?.status === 'completed'"
            :execution="sessionQuery.data.value.session.execution"
            :session-name="sessionQuery.data.value.plan.name"
            :calendar-to="homeLocation"
            class="pt-5"
          />
          <template v-else>
            <header class="pb-4 pt-5">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <h1 class="min-w-0 flex-1 break-words text-base font-medium text-[var(--trakia-text)]">
                  {{ sessionQuery.data.value.plan.name }}
                </h1>
                <span
                  class="inline-flex min-h-8 items-center rounded-full px-3 text-xs font-semibold"
                  :class="sessionStatusClass"
                >
                  {{ sessionStatus }}
                </span>
              </div>
              <time
                class="mt-1 block text-sm text-[var(--trakia-muted)]"
                :datetime="sessionQuery.data.value.session.date"
              >
                {{ formatSessionDate(sessionQuery.data.value.session.date) }}
              </time>
            </header>

            <section aria-label="Detalle de los bloques de la sesión" class="session-detail-blocks">
              <ol>
                <li v-for="(block, blockIndex) in sessionQuery.data.value.session.blocks" :key="block.key">
                  <SessionBlockDetail
                    :block="block"
                    :block-number="
                      sessionQuery.data.value.session.blocks
                        .slice(0, blockIndex + 1)
                        .filter((item) => item.type === 'circuit' && item.mode === 'rounds').length
                    "
                  />
                </li>
              </ol>
            </section>

            <WorkoutStartAction
              :plan-id="sessionQuery.data.value.plan.id"
              :session-id="sessionQuery.data.value.session.id"
              :session-name="sessionQuery.data.value.plan.name"
              :planned-date="sessionQuery.data.value.session.date"
              :execution="sessionQuery.data.value.session.execution"
              @start-error="startErrorMessage = $event"
            >
              <template #pending-action>
                <SessionRescheduleAction
                  :plan-id="sessionQuery.data.value.plan.id"
                  :session-id="sessionQuery.data.value.session.id"
                  :original-date="sessionQuery.data.value.session.date"
                />
              </template>
            </WorkoutStartAction>
          </template>
        </template>
      </div>
    </main>
  </AppPageShell>
</template>

<style scoped>
.session-detail-page {
  padding-bottom: calc(5rem + env(safe-area-inset-bottom));
}

.session-detail-page--pending {
  padding-bottom: calc(12.5rem + env(safe-area-inset-bottom));
}

.session-detail-blocks > ol {
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
