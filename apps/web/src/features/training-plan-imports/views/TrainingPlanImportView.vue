<script setup lang="ts">
import { computed } from 'vue'
import type { ImportValidationIssue } from '@trakia/contracts'
import { useAuth } from '@/features/auth'
import AppPageShell from '@/shared/components/AppPageShell.vue'
import { trainingPlanHomeLocation } from '../../training-plan-calendar'
import ImportPlanSummary from '../components/ImportPlanSummary.vue'
import { groupImportConflicts } from '../conflict-presentation'
import { useTrainingPlanImport } from '../useTrainingPlanImport'

const importer = useTrainingPlanImport()
const auth = useAuth()
const {
  canConfirm,
  canRetryConfirmation,
  canReview,
  chooseAnotherFile,
  confirmedPlanStartDate,
  errorKind,
  errorMessage,
  errorSummary,
  errorTitle,
  exerciseNames,
  fileInput,
  fileName,
  issues,
  review,
  state,
} = importer
const planningLocation = computed(() =>
  confirmedPlanStartDate.value ? trainingPlanHomeLocation(confirmedPlanStartDate.value) : undefined,
)
const step = computed(() => {
  if (['ready-to-confirm', 'confirming', 'confirmed', 'unchanged'].includes(importer.state.value)) return 2
  if (importer.review.value) return 1
  return 0
})
const proposalDays = computed(() => importer.review.value?.proposal?.days ?? [])
const hasReviewConflicts = computed(() => Boolean(review.value?.valid && review.value.conflicts.length))
const conflictCountLabel = computed(() => {
  const count = review.value?.conflicts.length ?? 0
  return `${count} conflicto${count === 1 ? '' : 's'} encontrado${count === 1 ? '' : 's'}`
})
const conflictGroups = computed(() => {
  if (!review.value?.valid) return []
  const sessionDates = new Map(
    proposalDays.value.filter((day) => day.type === 'session').map((day) => [day.key, day.date]),
  )
  const context = {
    exerciseNames: exerciseNames.value,
    sessionDates,
    planName: review.value.proposal?.name ?? '',
  }
  return groupImportConflicts(review.value.conflicts, context)
})
const stateCopy = computed(() => {
  const copy: Record<string, string> = {
    reading: 'Leyendo y validando el archivo…',
    'invalid-file': 'No se puede usar este archivo.',
    'invalid-json': 'No se pudo interpretar el JSON.',
    'invalid-document': 'El documento necesita correcciones antes de continuar.',
    reviewing: 'Comprobando el plan y los elementos que se conservarán…',
    confirming: 'Guardando el plan…',
    confirmed: 'Plan importado correctamente.',
    unchanged: 'El plan ya estaba al día. No se realizaron cambios.',
    'stale-or-expired': 'La revisión ya no está vigente. Vuelve a revisar el archivo.',
    'request-error': errorMessage.value,
  }
  return copy[importer.state.value] ?? ''
})

const issueText: Record<ImportValidationIssue['code'], string> = {
  INVALID_FORMAT: 'El formato del documento no es compatible.',
  UNSUPPORTED_VERSION: 'La versión del documento no es compatible.',
  INVALID_STRUCTURE: 'Hay un dato ausente o con un formato incorrecto.',
  DUPLICATE_EXERCISE_KEY: 'Hay ejercicios con la misma clave.',
  EXERCISE_NOT_DEFINED: 'El plan hace referencia a un ejercicio que no está definido.',
  INCOMPATIBLE_METRIC: 'Un ejercicio no admite una de las métricas indicadas.',
  INVALID_PLAN: 'La estructura o los datos del plan no son válidos.',
}
async function selectFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  await importer.readFile(file)
}

function issueMessage(issue: ImportValidationIssue): string {
  return issueText[issue.code]
}

function pathLabel(path: Array<string | number>): string {
  return path
    .map((part) => (typeof part === 'number' ? `elemento ${part + 1}` : part.replaceAll('-', ' ')))
    .join(' › ')
}
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
    <main class="import-page">
      <div class="import-shell">
        <section class="import-content" aria-labelledby="import-title">
          <h1 id="import-title">Importar plan</h1>

          <ol class="import-steps" aria-label="Pasos de importación">
            <li :aria-current="step === 0 ? 'step' : undefined" :class="{ 'is-complete': step > 0 }">
              <span class="step-mark">1</span><span>Archivo</span>
            </li>
            <li :aria-current="step === 1 ? 'step' : undefined" :class="{ 'is-complete': step > 1 }">
              <span class="step-mark">2</span><span>Revisión</span>
            </li>
            <li :aria-current="step === 2 ? 'step' : undefined">
              <span class="step-mark">3</span><span>Confirmación</span>
            </li>
          </ol>

          <input
            id="training-plan-file"
            ref="fileInput"
            class="import-file-input"
            type="file"
            accept=".json,application/json"
            tabindex="-1"
            @change="selectFile"
          />

          <section v-if="!hasReviewConflicts" class="import-section file-section">
            <button class="import-file-picker" type="button" @click="importer.chooseAnotherFile">
              <span class="file-picker-action">Seleccionar archivo</span>
              <span class="file-picker-name">{{ fileName || 'Ningún archivo seleccionado' }}</span>
            </button>

            <div v-if="fileName" class="file-meta">
              <button type="button" class="text-button" @click="importer.clearFile">Quitar archivo</button>
            </div>

            <button
              v-if="fileName && (state === 'empty' || state === 'reviewed-with-conflicts')"
              class="button-primary"
              type="button"
              :disabled="!canReview"
              @click="importer.reviewFile"
            >
              {{ review ? 'Volver a revisar' : 'Revisar plan' }}
            </button>
          </section>

          <section
            v-if="
              stateCopy &&
              !['reviewed-with-conflicts', 'ready-to-confirm', 'confirmed', 'unchanged'].includes(state)
            "
            class="import-status"
            :class="`status-${state}`"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <span class="status-indicator" aria-hidden="true"></span>
            <p>{{ stateCopy }}</p>
          </section>

          <section
            v-if="errorMessage || issues.length"
            ref="errorSummary"
            class="import-errors"
            tabindex="-1"
            aria-labelledby="error-heading"
          >
            <h2 id="error-heading">
              {{ issues.length ? 'Revisa estas incidencias del documento' : errorTitle }}
            </h2>
            <p v-if="errorMessage">{{ errorMessage }}</p>
            <ul v-if="issues.length">
              <li v-for="(issue, index) in issues" :key="`${issue.code}-${index}`">
                <strong>{{ issueMessage(issue) }}</strong>
                <span>{{ pathLabel(issue.path) }}</span>
              </li>
            </ul>
          </section>

          <section v-if="hasReviewConflicts" class="conflict-review" aria-labelledby="conflict-heading">
            <h2 id="conflict-heading" aria-live="polite" aria-atomic="true">{{ conflictCountLabel }}</h2>
            <p>No se puede importar el plan hasta corregirlos.</p>

            <ul class="conflict-groups">
              <li v-for="group in conflictGroups" :key="group.message" class="conflict-group">
                <strong>{{ group.message }}</strong>
                <ul>
                  <li v-for="target in group.targets" :key="target.label" class="conflict-target">
                    <span>{{ target.label }}</span>
                    <span v-if="target.count > 1" class="conflict-target-count">× {{ target.count }}</span>
                  </li>
                </ul>
              </li>
            </ul>

            <div class="conflict-actions">
              <button class="button-primary" type="button" @click="importer.chooseAnotherFile">
                Seleccionar otro archivo
              </button>
              <button
                class="button-secondary"
                type="button"
                :disabled="!canReview"
                @click="importer.reviewFile"
              >
                Volver a revisar
              </button>
            </div>
          </section>

          <section v-else-if="review?.valid" class="review-ready" aria-labelledby="review-ready-heading">
            <h2 id="review-ready-heading">
              {{
                state === 'confirmed'
                  ? 'Plan importado'
                  : state === 'unchanged'
                    ? 'El plan ya estaba al día'
                    : 'Plan listo para importar'
              }}
            </h2>
            <ImportPlanSummary
              v-if="review.proposal"
              :plan="review.proposal"
              :exercise-names="exerciseNames"
            />
            <div class="review-actions">
              <button
                v-if="canConfirm || state === 'confirming'"
                class="button-primary"
                type="button"
                :disabled="state === 'confirming'"
                @click="importer.confirm"
              >
                {{ state === 'confirming' ? 'Guardando…' : 'Confirmar plan' }}
              </button>
              <button
                v-else-if="state === 'request-error' && canRetryConfirmation"
                class="button-primary"
                type="button"
                @click="importer.retryConfirmation"
              >
                Reintentar confirmación segura
              </button>
              <RouterLink
                v-else-if="confirmedPlanStartDate && planningLocation"
                class="button-secondary"
                :to="planningLocation"
              >
                Ver planificación
              </RouterLink>
            </div>
          </section>

          <section v-if="state === 'stale-or-expired'" class="recovery-actions">
            <button class="button-primary" type="button" :disabled="!canReview" @click="importer.reviewFile">
              Revisar de nuevo
            </button>
          </section>

          <section v-if="state === 'invalid-document'" class="recovery-actions">
            <button class="button-secondary" type="button" @click="chooseAnotherFile">
              Seleccionar otro archivo
            </button>
          </section>

          <section v-if="state === 'request-error' && !canRetryConfirmation" class="recovery-actions">
            <RouterLink v-if="errorKind === 'permission'" class="button-secondary" to="/">
              Volver al inicio
            </RouterLink>
            <button
              v-else
              class="button-secondary"
              type="button"
              :disabled="!canReview"
              @click="importer.reviewFile"
            >
              Reintentar revisión
            </button>
          </section>
        </section>
      </div>
    </main>
  </AppPageShell>
</template>

<style scoped>
.import-page {
  overflow-x: clip;
  background: var(--trakia-background);
  color: var(--trakia-text);
  padding: 0 max(1rem, env(safe-area-inset-left)) max(3rem, env(safe-area-inset-bottom))
    max(1rem, env(safe-area-inset-right));
}

.import-shell {
  width: min(100%, 68rem);
  margin-inline: auto;
}

.text-button {
  min-height: 2.75rem;
  display: inline-flex;
  align-items: center;
  color: var(--trakia-muted);
  font-size: 0.875rem;
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.import-content {
  width: min(100%, 50rem);
  margin-inline: auto;
  padding-top: clamp(1.5rem, 5vw, 4rem);
}

h1,
h2,
h3,
p {
  margin-top: 0;
}

h1 {
  margin-bottom: 0.5rem;
  font-size: 1.875rem;
  line-height: 1.05;
  letter-spacing: -0.045em;
}

.import-steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
  margin: 0 0 1rem;
  padding: 0;
  list-style: none;
}

.import-steps li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--trakia-muted);
  font-size: 0.8125rem;
}

.import-steps li[aria-current='step'],
.import-steps li.is-complete {
  color: var(--trakia-text);
}

.step-mark {
  width: 1.75rem;
  height: 1.75rem;
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--trakia-border);
  border-radius: 50%;
  color: inherit;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}

.import-steps [aria-current='step'] .step-mark,
.import-steps .is-complete .step-mark {
  border-color: var(--trakia-accent);
  color: var(--trakia-accent);
}

.import-section {
  padding-block: 1.5rem;
  border-bottom: 1px solid var(--trakia-border);
}

.file-section {
  display: grid;
  gap: 0.75rem;
  padding-block: 0;
  border-bottom: 0;
}

.section-heading h2,
.import-errors h2 {
  margin-bottom: 0.5rem;
  font-size: 1.125rem;
  font-weight: 650;
}

.section-heading p {
  margin-bottom: 1rem;
  color: var(--trakia-muted);
  font-size: 0.875rem;
  line-height: 1.55;
}

.import-file-input {
  display: none;
}

.import-file-picker {
  min-height: 3.25rem;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  border: 1px solid var(--trakia-border);
  border-radius: 0.5rem;
  background: var(--trakia-surface);
  padding: 0.5rem 0.625rem;
  color: var(--trakia-text);
  font: inherit;
  cursor: pointer;
  text-align: left;
}

.file-picker-action {
  flex: 0 0 auto;
  color: var(--trakia-text);
  font-weight: 600;
}

.file-picker-name {
  min-width: 0;
  color: var(--trakia-muted);
  overflow-wrap: anywhere;
}

.file-meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-top: -0.5rem;
  color: var(--trakia-muted);
  font-size: 0.8125rem;
}

.file-section > .button-primary {
  margin-top: 0;
}

.text-button {
  min-height: 2.75rem;
  border: 0;
  background: transparent;
  padding: 0;
  font: inherit;
  cursor: pointer;
}

.button-primary,
.button-secondary {
  min-height: 3rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 0.5rem;
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  font: inherit;
  font-size: 0.9375rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background-color 140ms ease-out,
    border-color 140ms ease-out,
    color 140ms ease-out;
}

.button-primary {
  background: var(--trakia-accent-action);
  color: var(--trakia-accent-action-foreground);
}

.button-primary:hover:not(:disabled) {
  background: var(--trakia-accent-action-hover);
}

.button-secondary {
  border-color: var(--trakia-border);
  background: var(--trakia-surface);
  color: var(--trakia-text);
}

.button-primary:disabled,
.button-secondary:disabled {
  cursor: wait;
  opacity: 0.6;
}

:where(.import-page) :focus-visible {
  outline: 3px solid var(--trakia-focus);
  outline-offset: 3px;
}

.import-status {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  padding-block: 1rem;
  color: var(--trakia-muted);
}

.import-status p {
  margin: 0;
  line-height: 1.5;
}

.status-indicator {
  width: 0.625rem;
  height: 0.625rem;
  flex: 0 0 auto;
  margin-top: 0.35rem;
  border-radius: 50%;
  background: var(--trakia-muted);
}

.status-ready-to-confirm .status-indicator,
.status-confirmed .status-indicator,
.status-unchanged .status-indicator {
  background: var(--trakia-success);
}

.status-stale-or-expired .status-indicator {
  background: var(--trakia-warning);
}

.status-invalid-file .status-indicator,
.status-invalid-json .status-indicator,
.status-invalid-document .status-indicator,
.status-request-error .status-indicator {
  background: var(--trakia-danger);
}

.import-errors {
  margin-block: 1rem;
  padding: 1rem;
  border: 1px solid var(--trakia-danger-border);
  border-radius: 0.5rem;
  background: var(--trakia-danger-surface);
  color: var(--trakia-text);
}

.import-errors h2 {
  margin-bottom: 0.5rem;
  color: var(--trakia-danger);
  font-size: 1rem;
}

.import-errors p {
  line-height: 1.5;
}

.import-errors ul {
  display: grid;
  gap: 0.75rem;
  margin: 0.75rem 0 0;
  padding: 0;
  list-style: none;
}

.import-errors li {
  display: grid;
  gap: 0.25rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--trakia-danger-border);
}

.import-errors li span {
  color: var(--trakia-danger-muted);
  font-size: 0.8125rem;
  overflow-wrap: anywhere;
}

.conflict-review {
  margin-top: 0.5rem;
}

.conflict-review h2,
.review-ready h2 {
  margin-bottom: 0.375rem;
  font-size: 1.125rem;
  font-weight: 650;
}

.conflict-review > p {
  margin-bottom: 0;
  color: var(--trakia-muted);
  font-size: 0.9375rem;
  line-height: 1.5;
}

.conflict-groups {
  display: grid;
  gap: 0.75rem;
  margin: 1rem 0 0;
  padding: 0;
  list-style: none;
}

.conflict-group > strong {
  font-size: 0.9375rem;
  line-height: 1.45;
}

.conflict-group ul {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0.5rem 0 0;
  padding: 0;
  list-style: none;
}

.conflict-target {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border-radius: 0.5rem;
  border: 1px solid var(--trakia-danger-border);
  background: var(--trakia-danger-surface);
  padding: 0.375rem 0.625rem;
  color: var(--trakia-danger);
  font-size: 0.875rem;
  overflow-wrap: anywhere;
}

.conflict-target-count {
  color: var(--trakia-danger-muted);
  font-variant-numeric: tabular-nums;
}

.conflict-actions,
.review-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1rem;
}

.conflict-actions .button-primary,
.conflict-actions .button-secondary,
.review-actions .button-primary,
.review-actions .button-secondary {
  min-height: 2.75rem;
  margin-top: 0;
}

.review-ready {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.recovery-actions {
  padding-top: 0.5rem;
}

@media (max-width: 24rem) {
  .import-steps li {
    flex-direction: column;
    align-items: center;
    gap: 0.375rem;
    text-align: center;
    min-width: 0;
  }

  .import-steps li > span:last-child {
    max-width: 100%;
    overflow-wrap: anywhere;
  }
}

@media (min-width: 48rem) {
  .import-page {
    padding-inline: 2.5rem;
  }

  .import-steps {
    width: min(100%, 34rem);
  }

  .conflict-actions .button-primary,
  .conflict-actions .button-secondary,
  .review-actions .button-primary,
  .review-actions .button-secondary {
    min-width: 11rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
