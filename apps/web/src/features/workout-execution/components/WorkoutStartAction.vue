<script setup lang="ts">
import { toRef } from 'vue'
import { useWorkoutExecutionStart } from '../useWorkoutExecutionStart'
import { onlineStrengthExecutionLocation } from '../online-strength-flow'

const props = defineProps<{ planId: string; sessionId: string }>()
const workoutStart = useWorkoutExecutionStart(toRef(props, 'planId'), toRef(props, 'sessionId'))
</script>

<template>
  <section class="py-6 sm:py-8" aria-labelledby="workout-start-title">
    <h2 id="workout-start-title" class="text-xl font-semibold tracking-tight text-stone-100">
      Entrenamiento
    </h2>
    <p class="mt-2 max-w-prose text-sm leading-6 text-stone-300">
      El inicio necesita conexión. Una vez confirmado, podrás recuperar esta sesión desde cualquier
      dispositivo autenticado.
    </p>
    <p v-if="!workoutStart.isOnline.value" class="mt-3 text-sm text-amber-200" role="status">
      Sin conexión: conéctate para iniciar el entrenamiento.
    </p>
    <p
      v-if="workoutStart.isLoading.value"
      class="mt-3 text-sm text-stone-400"
      role="status"
      aria-live="polite"
    >
      Comprobando si hay una sesión abierta…
    </p>
    <p
      v-if="workoutStart.statusMessage.value"
      class="mt-3 text-sm text-lime-200"
      role="status"
      aria-live="polite"
    >
      {{ workoutStart.statusMessage.value }}
    </p>
    <p v-if="workoutStart.errorMessage.value" class="mt-3 text-sm text-rose-200" role="alert">
      {{ workoutStart.errorMessage.value }}
    </p>
    <button
      v-if="!workoutStart.activeExecution.value"
      class="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-md bg-lime-300 px-5 py-3 text-base font-semibold text-stone-950 transition-colors hover:bg-lime-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-200 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-white sm:w-auto"
      type="button"
      :disabled="!workoutStart.canStart.value"
      @click="workoutStart.start"
    >
      {{ workoutStart.isStarting.value ? 'Iniciando…' : 'Iniciar entrenamiento' }}
    </button>
    <RouterLink
      v-else
      class="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-md bg-lime-300 px-5 py-3 text-base font-semibold text-stone-950 transition-colors hover:bg-lime-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-200 sm:w-auto"
      :to="onlineStrengthExecutionLocation(workoutStart.activeExecution.value.execution.id)"
    >
      Continuar online
    </RouterLink>
  </section>
</template>
