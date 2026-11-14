import {
  validateTrainingPlanImportDocument,
  type ImportValidationIssue,
  type TrainingPlanImportV1,
  type TrainingPlanImportReviewResponse,
  type TrainingPlanImportConfirmationResponse,
} from '@trakia/contracts'
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError } from '../../shared/api/http'
import { getImportErrorPresentation, type ImportErrorKind } from './import-error-policy.js'
import { confirmTrainingPlanImport, reviewTrainingPlanImport } from './api/trainingPlanImports'

export const MAX_IMPORT_BYTES = 1024 * 1024

export type TrainingPlanImportUiState =
  | 'empty'
  | 'reading'
  | 'invalid-file'
  | 'invalid-json'
  | 'invalid-document'
  | 'reviewing'
  | 'reviewed-with-conflicts'
  | 'ready-to-confirm'
  | 'confirming'
  | 'confirmed'
  | 'unchanged'
  | 'stale-or-expired'
  | 'request-error'

const invalidFileMessage = 'Elige un archivo con extensión .json.'
const fileTooLargeMessage = 'El archivo supera el límite permitido de 1 MiB.'

export function useTrainingPlanImport() {
  const router = useRouter()
  const route = useRoute()
  const fileInput = ref<HTMLInputElement>()
  const errorSummary = ref<HTMLElement>()
  const fileName = ref('')
  const fileSize = ref(0)
  const document = ref<TrainingPlanImportV1>()
  const issues = ref<ImportValidationIssue[]>([])
  const review = ref<TrainingPlanImportReviewResponse>()
  const confirmation = ref<TrainingPlanImportConfirmationResponse>()
  const state = ref<TrainingPlanImportUiState>('empty')
  const errorKind = ref<ImportErrorKind | null>(null)
  const errorTitle = ref('No se pudo continuar')
  const errorMessage = ref('')
  const operationId = ref('')
  const canReview = computed(
    () => Boolean(document.value) && !['reading', 'reviewing', 'confirming'].includes(state.value),
  )
  const canConfirm = computed(
    () => state.value === 'ready-to-confirm' && Boolean(review.value?.reviewToken) && Boolean(document.value),
  )
  const canRetryConfirmation = computed(() => Boolean(operationId.value && review.value?.reviewToken))

  watch(state, async (next) => {
    if (
      !['invalid-file', 'invalid-json', 'invalid-document', 'request-error', 'stale-or-expired'].includes(
        next,
      )
    )
      return
    await nextTick()
    errorSummary.value?.focus()
  })

  function resetReview() {
    review.value = undefined
    confirmation.value = undefined
    operationId.value = ''
    issues.value = []
    errorKind.value = null
    errorTitle.value = 'No se pudo continuar'
    errorMessage.value = ''
  }

  async function readFile(file?: File) {
    resetReview()
    document.value = undefined
    fileName.value = file?.name ?? ''
    fileSize.value = file?.size ?? 0
    if (!file) {
      state.value = 'empty'
      return
    }
    if (!file.name.toLowerCase().endsWith('.json')) {
      errorMessage.value = invalidFileMessage
      state.value = 'invalid-file'
      return
    }
    if (file.size === 0) {
      errorMessage.value = 'El archivo está vacío. Selecciona un JSON con contenido.'
      state.value = 'invalid-file'
      return
    }
    if (file.size > MAX_IMPORT_BYTES) {
      errorMessage.value = fileTooLargeMessage
      state.value = 'invalid-file'
      return
    }

    state.value = 'reading'
    let parsedJson: unknown
    try {
      const text = await file.text()
      if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) {
        errorMessage.value = fileTooLargeMessage
        state.value = 'invalid-file'
        return
      }
      parsedJson = JSON.parse(text)
    } catch {
      errorMessage.value = 'El archivo no contiene JSON válido. Corrige el archivo y vuelve a seleccionarlo.'
      state.value = 'invalid-json'
      return
    }

    const validation = validateTrainingPlanImportDocument(parsedJson)
    if (!validation.success) {
      issues.value = validation.issues
      errorMessage.value =
        'El documento no cumple el formato de importación. Revisa las incidencias indicadas.'
      state.value = 'invalid-document'
      return
    }
    const requestBytes = new TextEncoder().encode(
      JSON.stringify({ document: validation.document }),
    ).byteLength
    if (requestBytes > MAX_IMPORT_BYTES) {
      errorMessage.value = fileTooLargeMessage
      state.value = 'invalid-file'
      return
    }
    document.value = validation.document
    state.value = 'empty'
  }

  async function reviewFile() {
    if (!document.value || !canReview.value) return
    resetReview()
    state.value = 'reviewing'
    try {
      const result = await reviewTrainingPlanImport(document.value)
      review.value = result
      issues.value = result.issues
      if (!result.valid) {
        errorMessage.value = 'El servidor encontró incidencias que impiden continuar.'
        state.value = 'invalid-document'
      } else if (result.conflicts.length > 0) {
        state.value = 'reviewed-with-conflicts'
      } else if (result.confirmable) {
        state.value = 'ready-to-confirm'
      } else {
        errorMessage.value = 'La revisión no se puede confirmar. Vuelve a revisar el archivo.'
        state.value = 'request-error'
      }
    } catch (error) {
      await handleRequestError(error)
    }
  }

  async function confirm() {
    const receipt = review.value?.reviewToken
    if (!document.value || !receipt || !canConfirm.value || state.value === 'confirming') return
    if (!operationId.value) operationId.value = crypto.randomUUID()
    state.value = 'confirming'
    errorMessage.value = ''
    try {
      confirmation.value = await confirmTrainingPlanImport(document.value, receipt, operationId.value)
      state.value = confirmation.value.status === 'confirmed' ? 'confirmed' : 'unchanged'
      operationId.value = ''
    } catch (error) {
      await handleRequestError(error, true)
    }
  }

  async function handleRequestError(error: unknown, confirmationRetry = false) {
    const presentation = getImportErrorPresentation(error)
    errorKind.value = presentation.kind
    errorTitle.value = presentation.title
    errorMessage.value = presentation.message
    issues.value = presentation.issues as ImportValidationIssue[]

    if (error instanceof ApiError && error.status === 401) {
      const redirect = `${route.path}${route.fullPath.includes('?') ? route.fullPath.slice(route.fullPath.indexOf('?')) : ''}`
      await router.replace({ name: 'login', query: { redirect } })
      return
    }

    if (presentation.kind === 'validation') {
      review.value = undefined
      operationId.value = ''
      state.value = 'invalid-document'
      return
    }
    if (presentation.kind === 'conflict') {
      review.value = undefined
      operationId.value = ''
      state.value = 'stale-or-expired'
      return
    }
    if (presentation.kind === 'file-size') {
      review.value = undefined
      operationId.value = ''
      state.value = 'invalid-file'
      return
    }
    state.value = 'request-error'
    if (!confirmationRetry) operationId.value = ''
  }

  async function retryConfirmation() {
    if (review.value?.reviewToken && operationId.value) {
      state.value = 'ready-to-confirm'
      await confirm()
    } else {
      await reviewFile()
    }
  }

  function clearFile() {
    document.value = undefined
    fileName.value = ''
    fileSize.value = 0
    resetReview()
    state.value = 'empty'
    if (fileInput.value) fileInput.value.value = ''
  }

  function chooseAnotherFile() {
    fileInput.value?.click()
  }

  return {
    canConfirm,
    canRetryConfirmation,
    canReview,
    clearFile,
    chooseAnotherFile,
    confirm,
    confirmation,
    errorKind,
    errorMessage,
    errorSummary,
    errorTitle,
    fileInput,
    fileName,
    fileSize,
    issues,
    readFile,
    review,
    reviewFile,
    retryConfirmation,
    state,
  }
}
