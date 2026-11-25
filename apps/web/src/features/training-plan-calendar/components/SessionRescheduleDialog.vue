<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, useTemplateRef, watch } from 'vue'
import type { PlanDate } from '@trakia/contracts'
import { formatDayHeading } from '../calendar-dates.js'
import type { TrainingPlanSessionMoveOption } from '../session-move-options.js'

const props = defineProps<{
  open: boolean
  options: TrainingPlanSessionMoveOption[]
  selectedDate: PlanDate | null
  loading: boolean
  loadError: boolean
  saving: boolean
  errorMessage: string | null
}>()

const emit = defineEmits<{
  'select-date': [date: PlanDate]
  cancel: []
  retry: []
  confirm: []
}>()

const dialogElement = useTemplateRef<{ open: boolean; showModal: () => void; close: () => void }>(
  'move-dialog',
)
const selectedOption = computed(
  () => props.options.find((option) => option.date === props.selectedDate) ?? null,
)

watch(
  () => props.open,
  async (open) => {
    await nextTick()
    const dialog = dialogElement.value
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  },
)

function cancelDialog(event: Event) {
  event.preventDefault()
  emit('cancel')
}

onBeforeUnmount(() => {
  if (dialogElement.value?.open) dialogElement.value.close()
})
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="move-dialog"
      class="session-reschedule-dialog"
      aria-labelledby="session-reschedule-title"
      aria-modal="true"
      @cancel="cancelDialog"
    >
      <div class="session-reschedule-sheet">
        <div class="session-reschedule-sheet__handle" aria-hidden="true"></div>
        <header class="session-reschedule-sheet__header">
          <h2 id="session-reschedule-title">Mover entrenamiento</h2>
          <p>Elige otro día de esta semana</p>
        </header>

        <p v-if="loading" class="session-reschedule-state" role="status" aria-live="polite">
          Cargando días disponibles…
        </p>
        <div v-else-if="loadError" class="session-reschedule-state" role="alert">
          <p>No se pudieron cargar los días disponibles.</p>
          <button class="session-reschedule-retry" type="button" @click="emit('retry')">Reintentar</button>
        </div>
        <p v-else-if="options.length === 0" class="session-reschedule-state" role="status">
          No hay días libres o de descanso disponibles desde hoy en esta semana.
        </p>
        <ul v-else class="session-reschedule-options" aria-label="Días elegibles de esta semana">
          <li v-for="(option, index) in options" :key="option.date">
            <button
              class="session-reschedule-option"
              :class="{ 'session-reschedule-option--selected': selectedDate === option.date }"
              type="button"
              :aria-pressed="selectedDate === option.date"
              :aria-label="`${formatDayHeading(option.date)}, ${option.kind === 'free' ? 'día libre' : 'descanso'}`"
              :autofocus="index === 0"
              @click="emit('select-date', option.date)"
            >
              <span class="session-reschedule-option__date">{{ formatDayHeading(option.date) }}</span>
              <span
                class="session-reschedule-option__kind"
                :class="{ 'session-reschedule-option__kind--rest': option.kind === 'rest' }"
              >
                {{ option.kind === 'free' ? 'Día libre' : 'Descanso' }}
              </span>
            </button>
          </li>
        </ul>

        <p v-if="selectedOption?.kind === 'rest'" class="session-reschedule-rest-note" role="note">
          Este día tiene un descanso del plan. Al confirmar, se sustituirá por el entrenamiento.
        </p>
        <p v-if="errorMessage" class="session-reschedule-error" role="alert">
          {{ errorMessage }}
        </p>

        <footer class="session-reschedule-actions">
          <button class="session-reschedule-cancel" type="button" :disabled="saving" @click="emit('cancel')">
            Cancelar
          </button>
          <button
            class="session-reschedule-confirm"
            type="button"
            :disabled="!selectedOption || loading || loadError || saving"
            @click="emit('confirm')"
          >
            {{ saving ? 'Guardando…' : 'Confirmar cambio' }}
          </button>
        </footer>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.session-reschedule-dialog {
  position: fixed;
  inset: auto 0 0;
  width: 100%;
  max-width: none;
  max-height: min(84dvh, 44rem);
  margin: 0;
  overflow-y: auto;
  border: 1px solid var(--trakia-border);
  border-bottom: 0;
  border-radius: 1rem 1rem 0 0;
  background: var(--trakia-surface);
  padding: 0;
  color: var(--trakia-text);
}

.session-reschedule-dialog::backdrop {
  background: rgb(0 0 0 / 68%);
}

.session-reschedule-sheet {
  padding: 0.75rem 1rem calc(1rem + env(safe-area-inset-bottom));
}

.session-reschedule-sheet__handle {
  width: 2.375rem;
  height: 0.25rem;
  margin: 0 auto 1rem;
  border-radius: 999px;
  background: var(--trakia-muted-subtle);
}

.session-reschedule-sheet__header h2 {
  margin: 0;
  color: var(--trakia-text);
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.35;
}

.session-reschedule-sheet__header p {
  margin: 0.25rem 0 0.875rem;
  color: var(--trakia-muted);
  font-size: 0.875rem;
  line-height: 1.4;
}

.session-reschedule-options {
  display: grid;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.session-reschedule-option {
  display: flex;
  min-height: 3.25rem;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border: 1px solid var(--trakia-border);
  border-radius: var(--trakia-radius-control);
  background: var(--trakia-background);
  padding: 0.5rem 0.75rem;
  color: var(--trakia-text);
  text-align: left;
}

.session-reschedule-option:hover {
  border-color: var(--trakia-muted-subtle);
  background: var(--trakia-surface-raised);
}

.session-reschedule-option:focus-visible,
.session-reschedule-cancel:focus-visible,
.session-reschedule-confirm:focus-visible,
.session-reschedule-retry:focus-visible {
  outline: 2px solid var(--trakia-focus);
  outline-offset: 2px;
}

.session-reschedule-option--selected {
  border-color: var(--trakia-focus);
  background: color-mix(in srgb, var(--trakia-accent) 12%, var(--trakia-surface));
}

.session-reschedule-option__date {
  min-width: 0;
  font-size: 0.875rem;
  font-weight: 600;
}

.session-reschedule-option__kind {
  flex: none;
  color: var(--trakia-muted);
  font-size: 0.75rem;
  line-height: 1.3;
}

.session-reschedule-option__kind--rest {
  border-radius: var(--trakia-radius-control);
  background: var(--trakia-surface-raised);
  padding: 0.25rem 0.5rem;
}

.session-reschedule-rest-note,
.session-reschedule-state {
  margin: 0.75rem 0 0;
  border: 1px solid var(--trakia-border);
  border-radius: var(--trakia-radius-control);
  background: var(--trakia-surface-raised);
  padding: 0.625rem 0.75rem;
  color: var(--trakia-muted);
  font-size: 0.8125rem;
  line-height: 1.45;
}

.session-reschedule-error {
  margin: 0.75rem 0 0;
  color: var(--trakia-danger);
  font-size: 0.8125rem;
  line-height: 1.45;
}

.session-reschedule-retry {
  min-height: 2.75rem;
  margin-top: 0.5rem;
  border: 1px solid var(--trakia-border);
  border-radius: var(--trakia-radius-control);
  background: var(--trakia-surface);
  padding: 0.5rem 0.75rem;
  color: var(--trakia-text);
  font-size: 0.875rem;
  font-weight: 600;
}

.session-reschedule-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0.5rem;
  margin-top: 0.875rem;
}

.session-reschedule-cancel,
.session-reschedule-confirm {
  display: inline-flex;
  min-height: 3rem;
  align-items: center;
  justify-content: center;
  border-radius: var(--trakia-radius-control);
  padding: 0.625rem 0.75rem;
  color: var(--trakia-text);
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.25;
  text-align: center;
}

.session-reschedule-cancel {
  border: 1px solid var(--trakia-border);
  background: transparent;
}

.session-reschedule-confirm {
  border: 0;
  background: var(--trakia-accent-action);
  color: var(--trakia-accent-action-foreground);
}

.session-reschedule-cancel:disabled,
.session-reschedule-confirm:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

@media (min-width: 48rem) {
  .session-reschedule-dialog {
    inset: 50% auto auto 50%;
    width: min(calc(100% - 2rem), 32rem);
    transform: translate(-50%, -50%);
    border-bottom: 1px solid var(--trakia-border);
    border-radius: var(--trakia-radius-surface);
  }

  .session-reschedule-sheet {
    padding: 1.25rem;
  }
}
</style>
