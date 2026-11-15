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
          <button
            v-if="
              !session.isLoading.value &&
              !session.errorMessage.value &&
              !session.isClosed.value &&
              !session.isReviewing.value
            "
            class="min-h-11 rounded-md bg-lime-300 px-3 text-sm font-semibold text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
            type="button"
            @click="session.openReview"
          >
            <span class="sm:hidden">Finalizar</span>
            <span class="hidden sm:inline">Finalizar entrenamiento</span>
          </button>
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

      <section v-else-if="session.isClosed.value" class="pt-8" aria-labelledby="closed-title">
        <h1 id="closed-title" class="text-3xl font-semibold tracking-[-0.035em]">Entrenamiento cerrado</h1>
        <p class="mt-2 text-sm leading-6 text-stone-300">El cierre permanece guardado en este dispositivo.</p>
        <p
          class="mt-3 text-xs leading-5"
          :class="
            session.closedOperation.value?.status === 'conflict' ||
            session.closedOperation.value?.status === 'rejected'
              ? 'text-amber-200'
              : 'text-stone-400'
          "
          role="status"
          aria-live="polite"
        >
          {{
            session.syncMessage.value ||
            (session.closedOperation.value?.status === 'synced'
              ? 'Cierre sincronizado con el servidor.'
              : session.closedOperation.value?.status === 'syncing'
                ? 'Sincronizando cierre…'
                : session.closedOperation.value?.status === 'conflict' ||
                    session.closedOperation.value?.status === 'rejected'
                  ? 'El cierre requiere atención. Los datos locales se conservan.'
                  : 'Cierre pendiente; se reintentará al volver la conexión.')
          }}
        </p>
        <div v-if="session.reviewSummary.value" class="mt-6 space-y-5">
          <p class="text-sm text-stone-200">
            {{ session.reviewSummary.value.performed.length }} realizadas ·
            {{ session.reviewSummary.value.skipped.length }} omitidas ·
            {{ session.reviewSummary.value.notReached.length }} pendientes/no alcanzadas
          </p>
          <p
            v-if="session.closedOperation.value?.operation.payload.execution.feeling"
            class="text-sm text-stone-300"
          >
            Sensaciones:
            {{ session.closedOperation.value.operation.payload.execution.feeling.replaceAll('_', ' ') }}
          </p>
          <p
            v-if="session.closedOperation.value?.operation.payload.execution.observations"
            class="whitespace-pre-wrap text-sm leading-6 text-stone-300"
          >
            {{ session.closedOperation.value.operation.payload.execution.observations }}
          </p>
        </div>
        <section class="mt-8 border-t border-white/10 pt-6" aria-labelledby="closed-results-title">
          <h2 id="closed-results-title" class="text-lg font-semibold text-stone-100">Resultados</h2>
          <p v-if="session.correctionMessage.value" class="mt-2 text-sm text-lime-200" role="status">
            {{ session.correctionMessage.value }}
          </p>
          <ul class="mt-3 divide-y divide-white/10">
            <li
              v-for="entry in session.savedResults.value.filter(
                ({ result }) => result.status === 'performed' && result.actualExerciseKey,
              )"
              :key="entry.result.id"
              class="py-4"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="break-words text-sm font-medium text-stone-100">
                    {{ session.exerciseName(entry.result.actualExerciseKey!) }}
                  </p>
                  <p class="mt-1 text-sm text-stone-300">
                    {{ metricsSummary(entry.result.actualMetrics) }}
                  </p>
                </div>
                <button
                  class="min-h-11 shrink-0 rounded-md border border-white/20 px-3 text-sm font-medium text-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
                  type="button"
                  :disabled="!session.isOnline.value || session.isSaving.value"
                  @click="session.beginCorrection(entry.result)"
                >
                  Corregir
                </button>
              </div>
            </li>
          </ul>
          <p v-if="!session.isOnline.value" class="mt-3 text-sm text-amber-200" role="status">
            Conéctate para corregir un resultado. Los cambios no se guardan sin confirmación del servidor.
          </p>
          <form
            v-if="session.correctionResult.value"
            class="mt-5 space-y-4 border-t border-white/10 pt-5"
            @submit.prevent="session.confirmCorrection"
          >
            <h3 class="text-base font-semibold text-stone-100">Corregir resultado</h3>
            <div v-if="session.correctionExerciseChoices.value.length > 1">
              <label class="block text-sm font-medium text-stone-200" for="corrected-exercise">
                Ejercicio realizado
              </label>
              <select
                id="corrected-exercise"
                class="mt-2 min-h-12 w-full rounded-md border border-white/15 bg-[#191a17] px-3 text-base text-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
                :value="session.correctionExerciseKey.value"
                :disabled="session.isSaving.value || session.ambiguousCorrection.value"
                @change="session.setCorrectionExercise(($event.target as HTMLSelectElement).value)"
              >
                <option
                  v-for="exercise in session.correctionExerciseChoices.value"
                  :key="exercise.key"
                  :value="exercise.key"
                >
                  {{ exercise.name }}
                </option>
              </select>
            </div>
            <div v-for="{ field, label, step } in session.correctionVisibleFields.value" :key="field">
              <label class="block text-sm font-medium text-stone-200" :for="`correction-${field}`">
                {{ label }}
              </label>
              <input
                :id="`correction-${field}`"
                class="mt-2 min-h-12 w-full rounded-md border border-white/15 bg-[#191a17] px-3 text-base text-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
                type="number"
                min="0.1"
                :step="step"
                :value="session.correctionFields[field] ?? ''"
                :disabled="session.isSaving.value || session.ambiguousCorrection.value"
                @input="session.setCorrectionField(field, ($event.target as HTMLInputElement).value)"
              />
              <p class="mt-1 text-xs text-stone-400">Deja vacío para retirar un valor registrado.</p>
            </div>
            <p v-if="session.correctionError.value" class="text-sm text-amber-200" role="alert">
              {{ session.correctionError.value }}
            </p>
            <div class="flex flex-col gap-2 sm:flex-row">
              <button
                class="min-h-12 flex-1 rounded-md bg-lime-300 px-4 font-semibold text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300 disabled:cursor-not-allowed disabled:opacity-50"
                type="submit"
                :disabled="session.isSaving.value || !session.isOnline.value"
              >
                {{ session.isSaving.value ? 'Confirmando…' : 'Confirmar corrección' }}
              </button>
              <button
                class="min-h-12 rounded-md border border-white/20 px-4 font-medium text-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
                type="button"
                :disabled="session.isSaving.value || session.ambiguousCorrection.value"
                @click="session.cancelCorrection"
              >
                Cancelar
              </button>
            </div>
          </form>
        </section>
        <button
          v-if="session.closedOperation.value?.status === 'pending' && session.isOnline.value"
          class="mt-4 min-h-11 rounded-md border border-white/20 px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
          type="button"
          :disabled="session.isSyncing.value"
          @click="session.retrySynchronization"
        >
          Reintentar sincronización
        </button>
        <button
          class="mt-8 min-h-12 w-full rounded-md border border-white/20 px-4 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
          type="button"
          @click="session.returnToSession"
        >
          Volver a la planificación
        </button>
      </section>

      <section v-else-if="session.isReviewing.value" class="pt-7" aria-labelledby="review-title">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h1 id="review-title" class="text-3xl font-semibold tracking-[-0.035em]">
              Revisar entrenamiento
            </h1>
            <p class="mt-2 text-sm leading-6 text-stone-300">
              Comprueba lo registrado antes del cierre definitivo.
            </p>
          </div>
          <button
            class="min-h-11 shrink-0 rounded-md border border-white/20 px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
            type="button"
            @click="session.returnToExecution"
          >
            Volver
          </button>
        </div>

        <section v-if="session.reviewSummary.value" class="mt-6 space-y-6">
          <p class="border-y border-white/10 py-3 text-sm text-stone-200">
            {{ session.reviewSummary.value.performed.length }} realizadas ·
            {{ session.reviewSummary.value.skipped.length }} omitidas ·
            {{ session.reviewSummary.value.notReached.length }} pendientes/no alcanzadas
          </p>
          <p v-if="session.reviewDurationLabel.value" class="text-sm text-stone-300">
            Duración de ejecución:
            <strong class="font-semibold text-stone-100">{{ session.reviewDurationLabel.value }}</strong>
          </p>
          <p v-else class="text-sm text-amber-200" role="status">
            No se puede calcular una duración fiable con las marcas temporales guardadas.
          </p>

          <div
            v-for="group in [
              { title: 'Realizadas', items: session.reviewSummary.value.performed, status: 'Realizada' },
              { title: 'Omitidas', items: session.reviewSummary.value.skipped, status: 'Omitida' },
              {
                title: 'Pendientes / no alcanzadas',
                items: session.reviewSummary.value.notReached,
                status: 'No alcanzada',
              },
            ]"
            :key="group.title"
          >
            <h2 class="text-base font-semibold text-stone-100">
              {{ group.title }} <span class="font-normal text-stone-400">· {{ group.items.length }}</span>
            </h2>
            <ul v-if="group.items.length" class="mt-2 divide-y divide-white/10">
              <li
                v-for="item in group.items"
                :key="item.id"
                class="flex items-start justify-between gap-4 py-3"
              >
                <span class="min-w-0">
                  <span class="block break-words text-sm text-stone-100">{{ item.title }}</span>
                  <span class="mt-1 block text-xs text-stone-400">{{ item.detail }}</span>
                </span>
                <span class="shrink-0 text-xs text-stone-300">{{ group.status }}</span>
              </li>
            </ul>
            <p v-else class="mt-2 text-sm text-stone-400">Ninguna</p>
          </div>
        </section>

        <form class="mt-8 space-y-6 border-t border-white/10 pt-6" @submit.prevent="session.confirmClose">
          <fieldset>
            <legend class="text-base font-semibold text-stone-100">Sensaciones al terminar · opcional</legend>
            <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
              <label
                v-for="feeling in session.feelings"
                :key="feeling.value"
                class="flex min-h-12 cursor-pointer items-center justify-center rounded-md border px-2 text-center text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-lime-300"
                :class="
                  session.reviewDraft.feeling === feeling.value
                    ? 'border-lime-300 bg-lime-300/10 text-lime-100'
                    : 'border-white/15 text-stone-200'
                "
              >
                <input
                  class="sr-only"
                  type="radio"
                  name="workout-feeling"
                  :value="feeling.value"
                  :checked="session.reviewDraft.feeling === feeling.value"
                  @change="session.setFeeling(feeling.value)"
                />
                {{ feeling.label }}
              </label>
            </div>
          </fieldset>

          <div>
            <label class="block text-sm font-medium text-stone-200" for="final-observations">
              Observaciones · opcional
            </label>
            <textarea
              id="final-observations"
              v-model="session.reviewDraft.observations"
              class="mt-2 min-h-24 w-full rounded-md border border-white/15 bg-[#191a17] px-3 py-3 text-base leading-6 text-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
              maxlength="1000"
              rows="3"
            />
            <p class="mt-1 text-xs text-stone-400">Máximo 1000 caracteres.</p>
          </div>

          <fieldset>
            <legend class="text-base font-semibold text-stone-100">Cierre</legend>
            <div class="mt-3 space-y-2">
              <label
                class="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-white/15 px-3 text-sm text-stone-100 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-lime-300 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
              >
                <input
                  class="size-4 accent-lime-300"
                  type="radio"
                  name="completion-type"
                  value="planned"
                  :checked="session.reviewDraft.completionType === 'planned'"
                  :disabled="!session.canMarkPlannedCompletion.value"
                  @change="session.setCompletionType('planned')"
                />
                He completado el entrenamiento previsto
              </label>
              <label
                class="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-white/15 px-3 text-sm text-stone-100 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-lime-300"
              >
                <input
                  class="size-4 accent-lime-300"
                  type="radio"
                  name="completion-type"
                  value="early"
                  :checked="session.reviewDraft.completionType === 'early'"
                  @change="session.setCompletionType('early')"
                />
                Finalizar antes
              </label>
            </div>
          </fieldset>
          <p v-if="!session.canMarkPlannedCompletion.value" class="text-xs leading-5 text-stone-400">
            El entrenamiento previsto solo puede marcarse como completado cuando todas sus unidades se han
            realizado y no quedan omisiones.
          </p>

          <div v-if="session.reviewDraft.completionType === 'early'">
            <label class="block text-sm font-medium text-stone-200" for="closure-reason">
              Motivo · opcional
            </label>
            <input
              id="closure-reason"
              v-model="session.reviewDraft.closureReason"
              class="mt-2 min-h-12 w-full rounded-md border border-white/15 bg-[#191a17] px-3 text-base text-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
              maxlength="240"
              type="text"
            />
          </div>

          <p class="text-sm leading-6 text-stone-400">
            Las omisiones y unidades no alcanzadas conservan su estado deportivo. Finalizar antes no se
            clasifica como escaqueo ni aplica penalizaciones.
          </p>
          <p v-if="session.errorMessage.value" class="text-sm text-amber-200" role="alert">
            {{ session.errorMessage.value }}
          </p>
          <button
            class="min-h-12 w-full rounded-md bg-lime-300 px-4 font-semibold text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300 disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
            :disabled="session.isSaving.value || !session.reviewDraft.completionType"
          >
            {{ session.isSaving.value ? 'Guardando cierre…' : 'Confirmar cierre' }}
          </button>
        </form>
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
