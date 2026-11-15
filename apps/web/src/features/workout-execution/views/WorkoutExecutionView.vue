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

function title() {
  const unit = session.currentUnit.value
  if (!unit) return 'Entrenamiento'
  if (unit.type === 'intervals' && !unit.phase.exercise)
    return unit.phase.type === 'rest' ? 'Recuperación' : 'Trabajo'
  return (
    session.currentExercise.value?.name ?? session.currentAppearance.value?.exerciseKey ?? 'Entrenamiento'
  )
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
          >TRAKIA</RouterLink
        >
        <div class="flex items-center gap-3">
          <span v-if="!session.isOnline.value" class="text-xs text-amber-200" role="status"
            >Sin conexión</span
          >
          <span class="hidden max-w-48 truncate text-xs text-stone-400 sm:inline">{{
            auth.user.value?.email
          }}</span>
        </div>
      </header>

      <p v-if="session.isLoading.value" class="mt-8 text-sm text-stone-300" role="status" aria-live="polite">
        Recuperando el entrenamiento…
      </p>
      <section v-else-if="session.errorMessage.value" class="mt-8" role="alert">
        <h1 class="text-2xl font-semibold">No se pudo abrir el entrenamiento</h1>
        <p class="mt-3 text-sm leading-6 text-stone-300">{{ session.errorMessage.value }}</p>
        <button
          class="mt-5 min-h-12 rounded-md border border-white/20 px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
          type="button"
          @click="session.returnToSession"
        >
          Volver a la planificación
        </button>
      </section>

      <template v-else-if="session.currentUnit.value && !session.isAmrapFinished.value">
        <div class="pt-6">
          <div class="flex items-center justify-between gap-3 text-sm text-stone-400">
            <p>
              {{ session.positionLabel.value }} <span class="px-1 text-stone-600">·</span> posición
              {{ session.position.value }} · {{ session.registeredCount.value }} resultados
            </p>
            <button
              class="min-h-11 rounded-md border border-white/20 px-3 text-sm font-medium text-stone-100 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
              type="button"
              :aria-pressed="session.isPaused.value"
              @click="session.togglePause"
            >
              {{ session.isPaused.value ? 'Reanudar' : 'Pausar' }}
            </button>
          </div>
          <h1 class="mt-3 break-words text-3xl font-semibold tracking-[-0.035em] text-stone-50 sm:text-4xl">
            {{ title() }}
          </h1>
          <p v-if="session.currentPhase.value" class="mt-2 text-sm text-stone-300">
            {{ session.currentPhase.value.type === 'work' ? 'Trabajo' : 'Descanso' }} ·
            {{ session.currentPhase.value.windowSeconds }} s previstos
          </p>
          <p v-else-if="session.currentUnit.value.type === 'circuit'" class="mt-2 text-sm text-stone-300">
            {{
              session.currentUnit.value.mode === 'amrap'
                ? `AMRAP · ronda ${session.currentUnit.value.round.roundIndex}`
                : `Circuito · ronda ${session.currentUnit.value.round.roundIndex}`
            }}
          </p>
        </div>

        <section
          v-if="session.timer.value"
          class="mt-5 flex items-center justify-between gap-4 border-y border-white/10 py-4"
          aria-live="off"
        >
          <div>
            <p class="text-xs uppercase tracking-[0.16em] text-stone-400">
              {{
                session.timer.value.kind === 'rest'
                  ? 'Descanso'
                  : session.timer.value.kind === 'amrap'
                    ? 'Tiempo AMRAP'
                    : 'Tiempo de trabajo'
              }}
            </p>
            <p class="mt-1 font-mono text-4xl tabular-nums text-lime-200" role="timer">
              {{ session.timerDisplay.value }}
            </p>
          </div>
          <p class="max-w-44 text-right text-xs leading-5 text-stone-400">
            {{
              session.isPaused.value
                ? 'Temporizador pausado'
                : session.timer.value.kind === 'rest' && session.timerRemaining.value === 0
                  ? 'Descanso excedido'
                  : `${session.timer.value.durationSeconds} s previstos`
            }}
          </p>
        </section>

        <p
          v-if="session.isPaused.value"
          class="mt-4 rounded-md border border-amber-200/30 px-3 py-3 text-sm text-amber-100"
          role="status"
        >
          Entrenamiento pausado. El tiempo no avanza.
        </p>
        <p
          v-if="session.needsWorkConfirmation.value"
          class="mt-4 rounded-md border border-amber-200/30 px-3 py-3 text-sm leading-6 text-amber-100"
          role="status"
        >
          La fase de trabajo se interrumpió. Confirma el resultado real o marca la fase como omitida; no se ha
          registrado automáticamente.
        </p>
        <section
          v-if="session.temporal.value.awaitManualAdvance"
          class="mt-4 rounded-md border border-white/10 p-3"
        >
          <p class="text-sm text-stone-200">Ronda completa. Continúa cuando estés listo.</p>
          <button
            class="mt-3 min-h-12 w-full rounded-md border border-white/20 px-4 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
            type="button"
            @click="session.continueManually"
          >
            Continuar a la siguiente ronda
          </button>
        </section>

        <div v-if="session.exerciseChoices.value.length > 1" class="mt-5 border-y border-white/10 py-4">
          <label class="block text-sm font-medium text-stone-200" for="actual-exercise"
            >Ejercicio realizado</label
          >
          <select
            id="actual-exercise"
            class="mt-2 min-h-12 w-full rounded-md border border-white/15 bg-[#191a17] px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
            :value="session.actualExerciseKey.value"
            @change="session.chooseExercise(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="choice in session.exerciseChoices.value" :key="choice.key" :value="choice.key">
              {{ choice.name }} · {{ choice.label.toLowerCase() }}
            </option>
          </select>
        </div>

        <form
          v-if="session.currentAppearance.value && !session.temporal.value.awaitManualAdvance"
          class="pt-5"
          @submit.prevent="session.confirmCurrent('performed')"
        >
          <fieldset>
            <legend class="text-base font-semibold text-stone-100">
              {{
                session.currentPhase.value?.type === 'rest'
                  ? 'Resultado de la recuperación'
                  : 'Resultado realizado'
              }}
            </legend>
            <p class="mt-1 text-sm leading-5 text-stone-400">
              Los campos opcionales muestran solo las métricas de este ejercicio.
            </p>
            <div class="mt-4 grid grid-cols-2 gap-3 sm:gap-4">
              <label
                v-for="item in session.visibleFields.value"
                :key="item.field"
                class="min-w-0 text-sm text-stone-300"
              >
                <span>{{ item.label }}</span>
                <input
                  class="mt-1.5 min-h-12 w-full rounded-md border border-white/15 bg-[#191a17] px-3 text-base tabular-nums text-stone-50 focus:border-lime-300 focus:outline-none focus:ring-2 focus:ring-lime-300/30"
                  type="number"
                  :inputmode="item.step === '1' ? 'numeric' : 'decimal'"
                  min="0.1"
                  :step="item.step"
                  :value="session.fields[item.field] ?? ''"
                  :aria-label="item.label"
                  @input="session.setField(item.field, ($event.target as HTMLInputElement).value)"
                />
              </label>
            </div>
            <label
              v-if="session.needsWorkConfirmation.value && session.currentPhase.value?.type === 'work'"
              class="mt-4 block text-sm text-stone-300"
            >
              Duración real del trabajo (segundos)
              <input
                class="mt-1.5 min-h-12 w-full rounded-md border border-white/15 bg-[#191a17] px-3 text-base tabular-nums text-stone-50 focus:border-lime-300 focus:outline-none focus:ring-2 focus:ring-lime-300/30"
                type="number"
                min="1"
                step="1"
                inputmode="numeric"
                :value="session.temporal.value.workSecondsDraft ?? ''"
                @input="session.setWorkSecondsDraft(($event.target as HTMLInputElement).value)"
              />
            </label>
          </fieldset>
          <p v-if="session.errorMessage.value" class="mt-4 text-sm leading-6 text-rose-200" role="alert">
            {{ session.errorMessage.value }}
          </p>
          <div
            class="sticky bottom-0 -mx-4 mt-6 border-t border-white/10 bg-[#10110f] px-4 py-4 sm:-mx-8 sm:px-8"
          >
            <button
              class="min-h-14 w-full rounded-md bg-lime-300 px-5 py-3 text-base font-semibold text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300 disabled:bg-stone-700 disabled:text-white"
              type="submit"
              :disabled="
                session.isSaving.value ||
                session.isPaused.value ||
                session.temporal.value.awaitManualAdvance ||
                session.isAmrapFinished.value ||
                (session.needsWorkConfirmation.value && !session.temporal.value.workSecondsDraft)
              "
            >
              {{
                session.isSaving.value
                  ? 'Guardando…'
                  : session.currentPhase.value?.type === 'work'
                    ? 'Terminar trabajo e iniciar descanso'
                    : session.currentUnit.value.type === 'sets'
                      ? 'Completar serie'
                      : session.currentUnit.value.type === 'circuit'
                        ? 'Registrar ejercicio'
                        : 'Completar fase'
              }}
            </button>
            <button
              v-if="session.currentUnit.value.type === 'intervals'"
              class="mt-2 min-h-11 w-full rounded-md border border-white/15 px-4 text-sm text-stone-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
              type="button"
              :disabled="session.isPaused.value"
              @click="session.skipCurrent"
            >
              Omitir fase
            </button>
            <button
              v-if="session.needsWorkConfirmation.value"
              class="mt-2 min-h-11 w-full rounded-md border border-amber-200/30 px-4 text-sm text-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
              type="button"
              :disabled="session.isPaused.value"
              @click="session.skipCurrent"
            >
              Omitir fase interrumpida
            </button>
            <p class="mt-2 text-center text-xs text-stone-400" role="status" aria-live="polite">
              Guardado local ·
              {{
                session.pendingCount.value
                  ? `${session.pendingCount.value} pendiente(s) de envío`
                  : session.conflictCount.value
                    ? `${session.conflictCount.value} resultado(s) para revisar`
                    : 'sincronizado'
              }}
            </p>
            <p v-if="session.syncMessage.value" class="mt-2 text-center text-xs text-amber-200" role="status">
              {{ session.syncMessage.value }}
            </p>
          </div>
        </form>
        <div
          v-else-if="session.currentPhase.value && !session.currentAppearance.value"
          class="mt-5 text-sm text-stone-300"
        >
          <p>Recuperación prevista. Al finalizar el temporizador, continuará el siguiente intervalo.</p>
          <button
            class="mt-3 min-h-11 rounded-md border border-white/15 px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
            type="button"
            :disabled="session.isPaused.value"
            @click="session.skipCurrent"
          >
            Omitir descanso
          </button>
        </div>
      </template>

      <section v-else class="pt-7">
        <h1 class="text-3xl font-semibold tracking-[-0.035em]">
          {{ session.isAmrapFinished.value ? 'Tiempo terminado' : 'Unidades registradas' }}
        </h1>
        <p class="mt-2 text-sm leading-6 text-stone-300">
          {{
            session.isAmrapFinished.value
              ? 'El AMRAP ha terminado. Solo se conservan los ejercicios confirmados; no se añadieron unidades al vencer el tiempo.'
              : 'El plan previsto está recorrido. Revisa los resultados registrados.'
          }}
        </p>
        <div class="mt-5 border-y border-white/10 py-4 text-sm text-stone-300">
          {{ session.registeredCount.value }} resultados
          <span class="ml-3 text-xs text-stone-400">{{
            session.pendingCount.value ? `${session.pendingCount.value} pendiente(s)` : 'Sincronizado'
          }}</span>
        </div>
        <ol class="divide-y divide-white/10" aria-label="Resultados registrados">
          <li v-for="entry in session.registeredSummary.value" :key="entry.result.id" class="py-3">
            <p class="text-sm font-medium text-stone-100">
              {{ entry.name }} <span class="font-normal text-stone-400">· {{ entry.result.type }}</span>
            </p>
            <div class="mt-1 flex items-center justify-between gap-3">
              <p class="text-sm text-stone-300">{{ metricsSummary(entry.result.actualMetrics) }}</p>
              <span class="shrink-0 text-xs text-stone-400">{{
                entry.status === 'synced' ? 'Enviado' : entry.status === 'conflict' ? 'Revisar' : 'Pendiente'
              }}</span>
            </div>
          </li>
        </ol>
        <p v-if="session.syncMessage.value" class="mt-3 text-sm text-amber-200" role="status">
          {{ session.syncMessage.value }}
        </p>
        <button
          v-if="session.pendingCount.value && session.isOnline.value"
          class="mt-3 min-h-12 rounded-md border border-white/20 px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
          type="button"
          @click="session.retrySynchronization"
        >
          Reintentar envío
        </button>
        <button
          v-if="session.hasSetBlocks.value && !session.isAmrapFinished.value"
          class="mt-3 min-h-12 w-full rounded-md bg-lime-300 px-4 font-semibold text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
          type="button"
          @click="session.addExtraSet"
        >
          Añadir serie adicional
        </button>
        <button
          class="mt-4 min-h-12 w-full rounded-md border border-white/20 px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
          type="button"
          @click="session.returnToSession"
        >
          Volver a planificación
        </button>
      </section>
    </div>
  </main>
</template>
