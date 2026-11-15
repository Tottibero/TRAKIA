<script setup lang="ts">
import { useRoute } from 'vue-router'
import type { ActualMetrics } from '@trakia/contracts'
import { useAuth } from '@/features/auth'
import { useWorkoutExecutionSession } from '../useWorkoutExecutionSession'

const route = useRoute()
const auth = useAuth()
const session = useWorkoutExecutionSession(String(route.params.executionId ?? ''))

function metricsSummary(metrics: ActualMetrics | undefined) {
  if (!metrics || !Object.keys(metrics).length) return 'Sin métricas'
  const labels: Record<string, string> = {
    reps: 'reps',
    weightKg: 'kg',
    durationSeconds: 's',
    distanceMeters: 'm',
    rpe: 'RPE',
    calories: 'kcal',
  }
  return Object.entries(metrics)
    .map(([key, value]) => `${value} ${labels[key] ?? key}`)
    .join(' · ')
}
</script>

<template>
  <main class="min-h-dvh bg-[#10110f] px-4 pb-28 pt-4 text-stone-100 sm:px-8 sm:pt-6">
    <div class="mx-auto max-w-2xl">
      <header class="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
        <RouterLink
          class="inline-flex min-h-11 items-center text-sm font-extrabold tracking-[0.22em] text-stone-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime-300"
          :to="{ name: 'home' }"
          aria-label="TRAKIA, volver a la planificación"
        >
          TRAKIA
        </RouterLink>
        <div class="flex items-center gap-3">
          <span v-if="!session.isOnline.value" class="text-xs text-amber-200" role="status"
            >Sin conexión</span
          >
          <span class="hidden max-w-48 truncate text-xs text-stone-400 sm:inline">{{
            auth.user.value?.email
          }}</span>
        </div>
      </header>

      <div
        v-if="session.isLoading.value"
        class="mt-8 text-sm text-stone-300"
        role="status"
        aria-live="polite"
      >
        Recuperando el entrenamiento…
      </div>

      <section v-else-if="session.errorMessage.value" class="mt-8" role="alert">
        <h1 class="text-2xl font-semibold tracking-tight">No se pudo abrir el entrenamiento</h1>
        <p class="mt-3 text-sm leading-6 text-stone-300">{{ session.errorMessage.value }}</p>
        <button
          class="mt-5 inline-flex min-h-12 items-center rounded-md border border-white/20 px-4 text-sm font-medium text-stone-100 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
          type="button"
          @click="session.returnToSession"
        >
          Volver a la planificación
        </button>
      </section>

      <section v-else-if="!session.hasSetBlocks.value" class="pt-7">
        <h1 class="text-3xl font-semibold tracking-[-0.035em]">Registro de fuerza no disponible</h1>
        <p class="mt-3 text-sm leading-6 text-stone-300">
          Esta ejecución todavía no contiene series de fuerza compatibles con este registro.
        </p>
        <button
          class="mt-5 inline-flex min-h-12 items-center rounded-md border border-white/20 px-4 text-sm font-medium text-stone-100 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
          type="button"
          @click="session.returnToSession"
        >
          Volver a la planificación
        </button>
      </section>

      <template v-else-if="session.currentUnit.value && session.currentAppearance.value">
        <div class="pt-6">
          <p class="text-sm text-stone-400">
            {{ session.isAdditional.value ? 'Serie adicional' : `Serie ${session.seriesNumber.value}` }}
            <span class="px-1 text-stone-600">·</span>
            {{ session.registeredCount.value }}
            {{ session.registeredCount.value === 1 ? 'serie guardada' : 'series guardadas' }}
          </p>
          <h1 class="mt-2 break-words text-3xl font-semibold tracking-[-0.035em] text-stone-50 sm:text-4xl">
            {{
              session.actualExercise.value?.name ??
              session.exerciseName(session.currentAppearance.value.exerciseKey)
            }}
          </h1>
          <p class="mt-2 text-sm text-stone-300">Confirma el resultado de esta serie para continuar.</p>
        </div>

        <div class="mt-6 border-y border-white/10 py-5">
          <label class="block text-sm font-medium text-stone-200" for="actual-exercise"
            >Ejercicio realizado</label
          >
          <select
            id="actual-exercise"
            class="mt-2 min-h-12 w-full rounded-md border border-white/15 bg-[#191a17] px-3 text-base text-stone-100 focus:border-lime-300 focus:outline-none focus:ring-2 focus:ring-lime-300/30"
            :value="session.actualExerciseKey.value"
            @change="session.chooseExercise(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="choice in session.exerciseChoices.value" :key="choice.key" :value="choice.key">
              {{ choice.name }}{{ choice.label === 'Alternativa' ? ' · alternativa' : ' · principal' }}
            </option>
          </select>
          <p v-if="session.exerciseChoices.value.length > 1" class="mt-2 text-xs leading-5 text-stone-400">
            Puedes usar el ejercicio principal o una alternativa prevista.
          </p>
        </div>

        <form class="pt-5" @submit.prevent="session.confirmAndNext">
          <fieldset>
            <legend class="text-base font-semibold text-stone-100">Resultado de la serie</legend>
            <p class="mt-1 text-sm leading-5 text-stone-400">
              Los campos son opcionales. Los valores sugeridos se pueden editar.
            </p>
            <div v-if="session.visibleFields.value.length" class="mt-4 grid grid-cols-2 gap-3 sm:gap-4">
              <label
                v-for="item in session.visibleFields.value"
                :key="item.field"
                class="min-w-0 text-sm text-stone-300"
              >
                <span>{{ item.label }}</span>
                <input
                  class="mt-1.5 min-h-12 w-full rounded-md border border-white/15 bg-[#191a17] px-3 text-base tabular-nums text-stone-50 placeholder:text-stone-400 focus:border-lime-300 focus:outline-none focus:ring-2 focus:ring-lime-300/30"
                  type="number"
                  :inputmode="item.step === '1' ? 'numeric' : 'decimal'"
                  :min="item.field === 'reps' ? '1' : '0.1'"
                  :step="item.step"
                  :value="session.fields[item.field] ?? ''"
                  :placeholder="
                    session.suggestions.value[item.field] === undefined
                      ? 'Opcional'
                      : `Sugerencia: ${session.suggestions.value[item.field]}`
                  "
                  :aria-label="`${item.label}${session.suggestions.value[item.field] === undefined ? '' : `, sugerencia ${session.suggestions.value[item.field]}`}`"
                  @input="session.setField(item.field, ($event.target as HTMLInputElement).value)"
                />
              </label>
            </div>
            <p v-else class="mt-4 rounded-md border border-white/10 px-3 py-3 text-sm text-stone-300">
              Este ejercicio no tiene métricas configuradas. Puedes guardar la serie sin añadir medidas.
            </p>
          </fieldset>

          <p v-if="session.errorMessage.value" class="mt-4 text-sm leading-6 text-rose-200" role="alert">
            {{ session.errorMessage.value }}
          </p>

          <div
            class="sticky bottom-0 -mx-4 mt-6 border-t border-white/10 bg-[#10110f] px-4 py-4 sm:-mx-8 sm:px-8"
          >
            <button
              class="inline-flex min-h-14 w-full items-center justify-center rounded-md bg-lime-300 px-5 py-3 text-base font-semibold text-stone-950 transition-colors hover:bg-lime-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-200 disabled:cursor-wait disabled:bg-stone-700 disabled:text-white"
              type="submit"
              :disabled="session.isSaving.value"
            >
              {{ session.isSaving.value ? 'Guardando en este dispositivo…' : 'Guardar y siguiente serie' }}
            </button>
            <p class="mt-2 text-center text-xs text-stone-400" role="status" aria-live="polite">
              Guardado local ·
              {{
                session.pendingCount.value
                  ? `${session.pendingCount.value} pendiente(s) de envío`
                  : 'sincronizado'
              }}
            </p>
          </div>
        </form>
      </template>

      <section v-else-if="session.completed.value" class="pt-7">
        <h1 class="text-3xl font-semibold tracking-[-0.035em]">Series registradas</h1>
        <p class="mt-2 text-sm text-stone-300">
          Has completado las series planificadas. Puedes añadir una serie extra si la has realizado.
        </p>
        <div class="mt-5 flex items-center justify-between gap-4 border-y border-white/10 py-4">
          <span class="text-sm text-stone-300">{{ session.registeredCount.value }} series confirmadas</span>
          <span class="text-xs text-stone-400" role="status" aria-live="polite">
            {{ session.pendingCount.value ? `${session.pendingCount.value} pendiente(s)` : 'Sincronizado' }}
          </span>
        </div>
        <ol class="divide-y divide-white/10" aria-label="Resumen de series confirmadas">
          <li v-for="entry in session.savedResults.value" :key="entry.result.id" class="py-3">
            <div v-if="entry.result.type === 'sets'" class="flex items-start justify-between gap-4">
              <div>
                <p class="text-sm font-medium text-stone-100">
                  {{
                    session.exerciseName(entry.result.actualExerciseKey ?? entry.result.plannedExerciseKey)
                  }}
                  <span class="font-normal text-stone-400">· serie {{ entry.result.unit.setIndex }}</span>
                </p>
                <p class="mt-1 text-sm text-stone-300">{{ metricsSummary(entry.result.actualMetrics) }}</p>
              </div>
              <span class="shrink-0 text-xs text-stone-400">{{
                entry.status === 'synced' ? 'Enviado' : entry.status === 'conflict' ? 'Revisar' : 'Pendiente'
              }}</span>
            </div>
          </li>
        </ol>
        <p v-if="session.syncMessage.value" class="mt-3 text-sm leading-6 text-amber-200" role="status">
          {{ session.syncMessage.value }}
        </p>
        <button
          v-if="session.pendingCount.value && session.isOnline.value"
          class="mt-2 min-h-11 rounded-md px-3 text-sm font-medium text-lime-200 underline decoration-lime-200/40 underline-offset-4 hover:text-lime-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300 disabled:opacity-60"
          type="button"
          :disabled="session.isSyncing.value"
          @click="session.retrySynchronization"
        >
          {{ session.isSyncing.value ? 'Enviando…' : 'Reintentar envío' }}
        </button>
        <div class="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            class="inline-flex min-h-12 flex-1 items-center justify-center rounded-md bg-lime-300 px-4 text-sm font-semibold text-stone-950 hover:bg-lime-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-200"
            type="button"
            @click="session.addExtraSet"
          >
            Añadir serie adicional
          </button>
          <button
            class="inline-flex min-h-12 items-center justify-center rounded-md border border-white/20 px-4 text-sm font-medium text-stone-100 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
            type="button"
            @click="session.returnToSession"
          >
            Volver a planificación
          </button>
        </div>
      </section>

      <p
        v-if="session.syncMessage.value && !session.completed.value"
        class="mt-4 text-sm leading-6 text-amber-200"
        role="status"
      >
        {{ session.syncMessage.value }}
      </p>
      <button
        v-if="session.pendingCount.value && session.isOnline.value && !session.completed.value"
        class="mt-2 min-h-11 rounded-md px-3 text-sm font-medium text-lime-200 underline decoration-lime-200/40 underline-offset-4 hover:text-lime-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300 disabled:opacity-60"
        type="button"
        :disabled="session.isSyncing.value"
        @click="session.retrySynchronization"
      >
        {{ session.isSyncing.value ? 'Enviando…' : 'Reintentar envío' }}
      </button>
    </div>
  </main>
</template>
