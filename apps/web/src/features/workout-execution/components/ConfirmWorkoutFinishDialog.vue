<script setup lang="ts">
import { useTemplateRef, watch } from 'vue'

const isOpen = defineModel<boolean>({ required: true })
const props = defineProps<{ isSaving: boolean; errorMessage: string | null }>()
const emit = defineEmits<{ confirm: [] }>()
const dialog = useTemplateRef('finishDialog')

watch(
  isOpen,
  (open) => {
    const element = dialog.value
    if (!element) return
    if (open && !element.open) element.showModal()
    else if (!open && element.open) element.close()
  },
  { flush: 'post' },
)

function handleCancel(event: Event) {
  if (props.isSaving) {
    event.preventDefault()
    return
  }
  isOpen.value = false
}

function handleClose() {
  isOpen.value = false
}
</script>

<template>
  <dialog
    ref="finishDialog"
    class="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-white/10 bg-[#191a17] p-0 text-stone-100 shadow-2xl backdrop:bg-black/70"
    aria-labelledby="finish-workout-title"
    aria-describedby="finish-workout-description"
    @cancel="handleCancel"
    @close="handleClose"
  >
    <div class="space-y-5 p-5 sm:p-6">
      <div>
        <h2 id="finish-workout-title" class="text-xl font-semibold tracking-tight">
          ¿Finalizar entrenamiento?
        </h2>
        <p id="finish-workout-description" class="mt-2 text-sm leading-6 text-stone-300">
          El entrenamiento quedará cerrado y dejará de aparecer como abierto.
        </p>
      </div>

      <p v-if="props.isSaving" class="text-sm text-stone-300" role="status" aria-live="polite">
        Guardando cierre…
      </p>
      <p v-if="props.errorMessage" class="text-sm leading-6 text-rose-200" role="alert">
        {{ props.errorMessage }}
      </p>

      <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          class="inline-flex min-h-12 items-center justify-center rounded-md border border-white/20 px-4 text-sm font-semibold text-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300 disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          :disabled="props.isSaving"
          autofocus
          @click="isOpen = false"
        >
          Seguir entrenando
        </button>
        <button
          class="inline-flex min-h-12 items-center justify-center rounded-md bg-lime-300 px-4 text-sm font-semibold text-stone-950 hover:bg-lime-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-200 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-white"
          type="button"
          :disabled="props.isSaving"
          @click="emit('confirm')"
        >
          {{ props.isSaving ? 'Guardando…' : props.errorMessage ? 'Reintentar' : 'Sí, finalizar' }}
        </button>
      </div>
    </div>
  </dialog>
</template>
