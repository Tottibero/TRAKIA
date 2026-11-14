<script setup lang="ts">
import { computed } from 'vue'
import type { ImportValidationIssue, TrainingPlanImportReviewResponse } from '@trakia/contracts'
import { useTrainingPlanImport } from '../useTrainingPlanImport'

const importer = useTrainingPlanImport()
const {
  canConfirm,
  canRetryConfirmation,
  canReview,
  chooseAnotherFile,
  errorKind,
  errorMessage,
  errorSummary,
  errorTitle,
  fileInput,
  fileName,
  fileSize,
  issues,
  review,
  state,
} = importer
const step = computed(() => {
  if (
    ['ready-to-confirm', 'reviewed-with-conflicts', 'confirming', 'confirmed', 'unchanged'].includes(
      importer.state.value,
    )
  )
    return 2
  if (importer.review.value) return 1
  return 0
})
const changeSummary = computed(() => {
  const changes = importer.review.value?.changes ?? []
  return [
    {
      status: 'created',
      label: 'Nuevos',
      count: changes.filter((change) => change.status === 'created').length,
    },
    {
      status: 'modified',
      label: 'Modificados',
      count: changes.filter((change) => change.status === 'modified').length,
    },
    {
      status: 'unchanged',
      label: 'Sin cambios',
      count: changes.filter((change) => change.status === 'unchanged').length,
    },
    {
      status: 'preserved',
      label: 'Conservados',
      count: changes.filter((change) => change.status === 'preserved').length,
    },
  ].filter((item) => item.count > 0)
})
const changeGroups = computed(() => {
  const changes = importer.review.value?.changes ?? []
  return [
    { status: 'created', title: 'Elementos nuevos' },
    { status: 'modified', title: 'Elementos modificados' },
    { status: 'unchanged', title: 'Elementos sin cambios' },
    { status: 'preserved', title: 'Elementos conservados' },
  ]
    .map((group) => ({ ...group, changes: changes.filter((change) => change.status === group.status) }))
    .filter((group) => group.changes.length > 0)
})
const proposalDays = computed(() => importer.review.value?.proposal?.days ?? [])
const stateCopy = computed(() => {
  const copy: Record<string, string> = {
    empty: importer.fileName.value
      ? 'Archivo listo para revisar.'
      : 'Selecciona un archivo JSON para empezar.',
    reading: 'Leyendo y validando el archivo…',
    'invalid-file': 'No se puede usar este archivo.',
    'invalid-json': 'No se pudo interpretar el JSON.',
    'invalid-document': 'El documento necesita correcciones antes de continuar.',
    reviewing: 'Comprobando el plan y los elementos que se conservarán…',
    'reviewed-with-conflicts': 'La revisión encontró conflictos. No se puede confirmar.',
    'ready-to-confirm': 'Revisión completa. Comprueba el resumen antes de confirmar.',
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
const conflictText: Record<string, string> = {
  EXERCISE_DEFINITION_CONFLICT: 'La definición de este ejercicio difiere del catálogo guardado.',
  UNRESOLVED_PERSISTED_EXERCISE_KEY: 'No se puede identificar con seguridad un ejercicio ya guardado.',
  EXERCISE_NOT_FOUND: 'El plan combinado hace referencia a un ejercicio inexistente.',
  INVALID_COMBINED_PLAN: 'La combinación del plan no supera la validación.',
  PAST_SESSION_PROTECTED: 'No se pueden modificar ni añadir sesiones pasadas.',
  SESSION_EXECUTION_PROTECTED: 'Esta sesión ya tiene una ejecución iniciada o completada.',
  IDENTITY_TYPE_MISMATCH: 'La clave del elemento ya pertenece a otro tipo de elemento.',
  OPERATION_ID_CONTENT_MISMATCH: 'El identificador de operación ya se usó con otros datos.',
  STALE_IMPORT_REVIEW: 'Los datos guardados cambiaron después de la revisión.',
  STALE_PLAN_VERSION: 'El plan cambió después de la revisión.',
  CONCURRENT_CATALOG_OR_PLAN_CHANGE: 'El catálogo o plan cambió durante la confirmación.',
  INVALID_OR_EXPIRED_REVIEW_RECEIPT: 'La revisión caducó o dejó de ser válida.',
  IMPORT_CONFLICT: 'El plan tiene un conflicto que impide confirmarlo.',
}
const kindText: Record<string, string> = {
  exercise: 'Ejercicio',
  plan: 'Plan',
  day: 'Día',
  block: 'Bloque',
  phase: 'Fase',
  appearance: 'Ejercicio programado',
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`
}

function formatDate(value?: string): string {
  if (!value) return ''
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function planDayLabel(
  day: NonNullable<TrainingPlanImportReviewResponse['proposal']>['days'][number],
): string {
  return day.type === 'session' ? `Sesión · ${day.date}` : `Descanso${day.date ? ` · ${day.date}` : ''}`
}
</script>

<template>
  <main class="import-page">
    <div class="import-shell">
      <header class="import-toolbar">
        <RouterLink class="import-brand" to="/" aria-label="TRAKIA, inicio"
          >TRAKIA<span aria-hidden="true">.</span></RouterLink
        >
        <RouterLink class="import-back" to="/">Volver al inicio</RouterLink>
      </header>

      <section class="import-content" aria-labelledby="import-title">
        <h1 id="import-title">Importar plan</h1>
        <p class="import-intro">
          Revisa qué se añadirá y qué datos existentes se conservarán antes de guardar.
        </p>

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

        <section class="import-section" aria-labelledby="file-heading">
          <div class="section-heading">
            <h2 id="file-heading">Archivo del plan</h2>
            <p>El JSON se valida en este dispositivo y en el servidor.</p>
          </div>

          <label class="import-file-picker" for="training-plan-file">
            <span class="file-picker-action">Seleccionar archivo</span>
            <span class="file-picker-name">{{ fileName || 'Ningún archivo seleccionado' }}</span>
            <input
              id="training-plan-file"
              ref="fileInput"
              class="import-file-input"
              type="file"
              accept=".json,application/json"
              aria-describedby="file-help"
              @change="selectFile"
            />
          </label>
          <p id="file-help" class="import-help">
            Máximo 1 MiB. El contenido solo se conserva mientras esta pantalla está abierta.
          </p>

          <div v-if="fileName" class="file-meta" aria-live="polite">
            <span class="file-name">{{ fileName }}</span>
            <span>{{ formatFileSize(fileSize) }}</span>
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

        <template v-if="review?.valid">
          <section class="import-section review-section" aria-labelledby="review-heading">
            <div class="section-heading">
              <h2 id="review-heading">Resumen de la revisión</h2>
              <p v-if="review.confirmable">
                Revisión vigente hasta {{ formatDate(review.reviewExpiresAt) }}.
              </p>
              <p v-else>Resuelve los conflictos antes de iniciar una nueva revisión.</p>
            </div>

            <p class="preservation-note">
              Los elementos que no aparecen en el archivo se conservarán. La importación no elimina datos.
            </p>

            <dl class="change-summary" aria-label="Resumen de cambios">
              <div v-for="item in changeSummary" :key="item.status">
                <dt>{{ item.label }}</dt>
                <dd>{{ item.count }}</dd>
              </div>
              <div v-if="review.conflicts.length" class="summary-conflict">
                <dt>Conflictos</dt>
                <dd>{{ review.conflicts.length }}</dd>
              </div>
            </dl>

            <details v-for="group in changeGroups" :key="group.status" class="change-details">
              <summary>
                {{ group.title }} <span>{{ group.changes.length }}</span>
              </summary>
              <ul>
                <li v-for="(change, index) in group.changes" :key="`${change.kind}-${change.key}-${index}`">
                  <span>{{ kindText[change.kind] ?? 'Elemento' }}</span>
                  <strong>{{ change.key }}</strong>
                  <small>{{ pathLabel(change.path) }}</small>
                </li>
              </ul>
            </details>

            <div v-if="review.proposal" class="proposal-detail">
              <h3>Plan combinado</h3>
              <dl>
                <div>
                  <dt>Nombre</dt>
                  <dd>{{ review.proposal.name }}</dd>
                </div>
                <div>
                  <dt>Periodo</dt>
                  <dd>{{ review.proposal.startDate }} – {{ review.proposal.endDate }}</dd>
                </div>
                <div>
                  <dt>Días</dt>
                  <dd>{{ proposalDays.length }}</dd>
                </div>
              </dl>
              <ul class="proposal-days">
                <li v-for="day in proposalDays" :key="day.key">
                  <span>{{ planDayLabel(day) }}</span>
                </li>
              </ul>
            </div>

            <div v-if="review.conflicts.length" class="conflict-list" aria-labelledby="conflict-heading">
              <h3 id="conflict-heading">Conflictos que bloquean la importación</h3>
              <ul>
                <li
                  v-for="(conflict, index) in review.conflicts"
                  :key="`${conflict.code}-${conflict.key}-${index}`"
                >
                  <strong>{{ conflictText[conflict.code] ?? 'Este elemento no se puede importar.' }}</strong>
                  <span>{{ conflict.key }} · {{ pathLabel(conflict.path) }}</span>
                </li>
              </ul>
            </div>
          </section>

          <section class="import-confirm" aria-labelledby="confirm-heading">
            <div>
              <h2 id="confirm-heading">Confirmar importación</h2>
              <p>La confirmación guarda el plan combinado como una única operación.</p>
            </div>
            <button
              v-if="canConfirm || state === 'confirming'"
              class="button-primary"
              type="button"
              :disabled="state === 'confirming'"
              @click="importer.confirm"
            >
              {{ state === 'confirming' ? 'Guardando…' : 'Confirmar plan' }}
            </button>
            <p v-else-if="review.conflicts.length" class="confirm-blocked">
              La confirmación está desactivada hasta resolver los conflictos.
            </p>
            <button
              v-else-if="state === 'request-error' && canRetryConfirmation"
              class="button-primary"
              type="button"
              @click="importer.retryConfirmation"
            >
              Reintentar confirmación segura
            </button>
          </section>
        </template>

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
</template>

<style scoped>
.import-page {
  min-height: 100svh;
  overflow-x: clip;
  background: var(--trakia-background);
  color: var(--trakia-text);
  padding: 0 1rem 3rem;
}

.import-shell {
  width: min(100%, 68rem);
  margin-inline: auto;
}

.import-toolbar {
  min-height: 4.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid var(--trakia-border);
}

.import-brand {
  color: var(--trakia-text);
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: 0.2em;
  text-decoration: none;
}

.import-brand span {
  color: var(--trakia-accent);
}

.import-back,
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
  padding-top: clamp(2rem, 7vw, 4.5rem);
}

h1,
h2,
h3,
p {
  margin-top: 0;
}

h1 {
  margin-bottom: 0.75rem;
  font-size: clamp(2rem, 8vw, 3rem);
  line-height: 1.05;
  letter-spacing: -0.045em;
}

.import-intro {
  max-width: 42rem;
  margin-bottom: 2rem;
  color: var(--trakia-muted);
  font-size: 1rem;
  line-height: 1.6;
}

.import-steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
  margin: 0 0 2rem;
  padding: 0 0 1rem;
  border-bottom: 1px solid var(--trakia-border);
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

.section-heading h2,
.import-confirm h2,
.import-errors h2 {
  margin-bottom: 0.5rem;
  font-size: 1.125rem;
  font-weight: 650;
}

.section-heading p,
.import-confirm p {
  margin-bottom: 1rem;
  color: var(--trakia-muted);
  font-size: 0.875rem;
  line-height: 1.55;
}

.import-file-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.import-file-picker {
  position: relative;
  min-height: 3.25rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  border: 1px solid var(--trakia-border);
  border-radius: 0.5rem;
  background: var(--trakia-surface);
  padding: 0.5rem 0.625rem;
  color: var(--trakia-text);
  font-size: 0.875rem;
  cursor: pointer;
  overflow: hidden;
}

.file-picker-action {
  min-height: 2.25rem;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  border: 0;
  border-radius: 0.35rem;
  background: #2c3026;
  padding-inline: 0.75rem;
  color: var(--trakia-text);
  font-weight: 600;
}

.file-picker-name {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--trakia-muted);
}

.import-file-picker:focus-within {
  outline: 3px solid var(--trakia-focus);
  outline-offset: 3px;
}

.import-help {
  margin: 0.625rem 0 0;
  color: var(--trakia-muted);
  font-size: 0.8125rem;
  line-height: 1.5;
}

.file-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  margin-top: 1rem;
  color: var(--trakia-muted);
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
}

.file-name {
  max-width: 100%;
  overflow-wrap: anywhere;
  color: var(--trakia-text);
  font-weight: 600;
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
  background: var(--trakia-accent);
  color: #20231d;
}

.button-primary:hover:not(:disabled) {
  background: var(--trakia-accent-hover);
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

.status-reviewed-with-conflicts .status-indicator,
.status-stale-or-expired .status-indicator {
  background: var(--trakia-warning);
}

.status-invalid-file .status-indicator,
.status-invalid-json .status-indicator,
.status-invalid-document .status-indicator,
.status-request-error .status-indicator {
  background: var(--trakia-danger);
}

.import-errors,
.conflict-list {
  margin-block: 1rem;
  padding: 1rem;
  border: 1px solid #75483f;
  border-radius: 0.5rem;
  background: #211a18;
  color: var(--trakia-text);
}

.import-errors h2,
.conflict-list h3 {
  margin-bottom: 0.5rem;
  color: var(--trakia-danger);
  font-size: 1rem;
}

.import-errors p,
.conflict-list li strong {
  line-height: 1.5;
}

.import-errors ul,
.conflict-list ul,
.change-details ul,
.proposal-days {
  display: grid;
  gap: 0.75rem;
  margin: 0.75rem 0 0;
  padding: 0;
  list-style: none;
}

.import-errors li,
.conflict-list li {
  display: grid;
  gap: 0.25rem;
  padding-top: 0.75rem;
  border-top: 1px solid #513831;
}

.import-errors li span,
.conflict-list li span {
  color: #e0b5ac;
  font-size: 0.8125rem;
  overflow-wrap: anywhere;
}

.preservation-note {
  margin: 0 0 1rem;
  color: var(--trakia-success);
  font-size: 0.875rem;
  line-height: 1.55;
}

.change-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem 1rem;
  margin: 1.25rem 0;
}

.change-summary div {
  min-width: 0;
  padding-block: 0.75rem;
  border-top: 1px solid var(--trakia-border);
}

.change-summary dt,
.proposal-detail dt {
  color: var(--trakia-muted);
  font-size: 0.8125rem;
}

.change-summary dd {
  margin: 0.2rem 0 0;
  color: var(--trakia-text);
  font-size: 1.25rem;
  font-variant-numeric: tabular-nums;
}

.change-summary .summary-conflict dd {
  color: var(--trakia-warning);
}

.change-details {
  border-top: 1px solid var(--trakia-border);
}

.change-details:last-of-type {
  border-bottom: 1px solid var(--trakia-border);
}

.change-details summary {
  min-height: 3rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  color: var(--trakia-text);
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
}

.change-details summary span {
  color: var(--trakia-muted);
  font-variant-numeric: tabular-nums;
}

.change-details li {
  display: grid;
  grid-template-columns: minmax(6.5rem, 0.4fr) minmax(0, 1fr);
  gap: 0.25rem 0.75rem;
  padding-block: 0.5rem;
  border-top: 1px solid #2e302b;
  font-size: 0.8125rem;
}

.change-details li span,
.change-details li small {
  color: var(--trakia-muted);
}

.change-details li strong,
.change-details li small {
  min-width: 0;
  overflow-wrap: anywhere;
}

.change-details li small {
  grid-column: 1 / -1;
  font-size: 0.75rem;
}

.proposal-detail {
  margin-top: 1.75rem;
}

.proposal-detail h3,
.conflict-list h3 {
  font-size: 1rem;
  font-weight: 650;
}

.proposal-detail dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem 1rem;
  margin: 0;
}

.proposal-detail dl div {
  min-width: 0;
}

.proposal-detail dd {
  margin: 0.25rem 0 0;
  overflow-wrap: anywhere;
  color: var(--trakia-text);
  font-size: 0.875rem;
}

.proposal-days li {
  padding-top: 0.625rem;
  border-top: 1px solid var(--trakia-border);
  color: var(--trakia-muted);
  font-size: 0.8125rem;
}

.import-confirm {
  display: grid;
  gap: 0.25rem;
  padding-block: 1.5rem;
}

.import-confirm h2,
.import-confirm p {
  margin-bottom: 0.25rem;
}

.confirm-blocked {
  color: var(--trakia-warning) !important;
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

  .change-summary {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .import-confirm {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 1.5rem;
  }

  .import-confirm .button-primary,
  .import-confirm .button-secondary {
    min-width: 13rem;
    margin-top: 0;
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
