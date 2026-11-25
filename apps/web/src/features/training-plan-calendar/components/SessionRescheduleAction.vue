<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, toRef } from 'vue'
import type { PlanDate } from '@trakia/contracts'
import { ApiError, ApiNetworkError } from '@/shared/api/http'
import SessionRescheduleDialog from './SessionRescheduleDialog.vue'
import {
  addCivilDays,
  getMadridCivilDate,
  getNextMadridMidnight,
  mondayOfCivilWeek,
} from '../calendar-dates.js'
import { trainingPlanSessionMoveOptions } from '../session-move-options.js'
import { useTrainingPlanCalendar } from '../useTrainingPlanCalendar'
import { useTrainingPlanSessionReschedule } from '../useTrainingPlanSessionReschedule'

const props = defineProps<{
  planId: string
  sessionId: string
  originalDate: PlanDate
}>()

const isOpen = shallowRef(false)
const selectedDate = shallowRef<PlanDate | null>(null)
const currentDate = shallowRef(getMadridCivilDate())
const errorMessage = shallowRef<string | null>(null)
const weekStart = computed(() => mondayOfCivilWeek(props.originalDate))
const weekEnd = computed(() => addCivilDays(weekStart.value, 6))
const calendarQuery = useTrainingPlanCalendar(toRef(weekStart), toRef(weekEnd))
const moveMutation = useTrainingPlanSessionReschedule()
let midnightTimer: ReturnType<typeof setTimeout> | undefined

const options = computed(() => {
  const calendar = calendarQuery.data.value
  if (!calendar) return []
  return trainingPlanSessionMoveOptions(calendar, props.planId, props.originalDate, currentDate.value)
})
const selectedOption = computed(
  () => options.value.find((option) => option.date === selectedDate.value) ?? null,
)
const loadError = computed(() => Boolean(calendarQuery.error.value && !calendarQuery.data.value))

function refreshMadridDate() {
  currentDate.value = getMadridCivilDate()
  midnightTimer = setTimeout(refreshMadridDate, Math.max(1, getNextMadridMidnight() - Date.now() + 1))
}

function openSelector() {
  currentDate.value = getMadridCivilDate()
  selectedDate.value = null
  errorMessage.value = null
  isOpen.value = true
}

function closeSelector() {
  if (moveMutation.isPending.value) return
  isOpen.value = false
  selectedDate.value = null
  errorMessage.value = null
}

async function confirmMove() {
  const target = selectedOption.value
  if (!target || moveMutation.isPending.value) return

  errorMessage.value = null
  try {
    await moveMutation.mutateAsync({
      planId: props.planId,
      sessionId: props.sessionId,
      expectedDate: props.originalDate,
      newDate: target.date,
    })
    isOpen.value = false
    selectedDate.value = null
  } catch (error) {
    errorMessage.value = moveErrorMessage(error)
  }
}

function moveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof ApiNetworkError)
    return 'No se pudo conectar para cambiar el día. Comprueba la conexión e inténtalo de nuevo.'
  return 'No se pudo confirmar el cambio. Actualiza el calendario e inténtalo de nuevo.'
}

onMounted(refreshMadridDate)
onBeforeUnmount(() => {
  if (midnightTimer) clearTimeout(midnightTimer)
})
</script>

<template>
  <button class="session-reschedule-trigger" type="button" @click="openSelector">Mover entrenamiento</button>
  <SessionRescheduleDialog
    :open="isOpen"
    :options="options"
    :selected-date="selectedDate"
    :loading="calendarQuery.isPending.value"
    :load-error="loadError"
    :saving="moveMutation.isPending.value"
    :error-message="errorMessage"
    @select-date="selectedDate = $event"
    @cancel="closeSelector"
    @retry="calendarQuery.refetch()"
    @confirm="confirmMove"
  />
</template>

<style scoped>
.session-reschedule-trigger {
  display: inline-flex;
  min-height: 3rem;
  width: 100%;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--trakia-border);
  border-radius: var(--trakia-radius-control);
  background: var(--trakia-surface);
  padding: 0.75rem 1rem;
  color: var(--trakia-text);
  font-size: 0.9375rem;
  font-weight: 600;
  line-height: 1.3;
  text-align: center;
  transition:
    border-color 140ms ease-out,
    background-color 140ms ease-out;
}

.session-reschedule-trigger:hover {
  border-color: var(--trakia-muted-subtle);
  background: var(--trakia-surface-raised);
}

.session-reschedule-trigger:focus-visible {
  outline: 2px solid var(--trakia-focus);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .session-reschedule-trigger {
    transition: none;
  }
}
</style>
