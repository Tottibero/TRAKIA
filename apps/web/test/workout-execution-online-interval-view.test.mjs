import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const view = readFileSync(
  new URL('../src/features/workout-execution/views/OnlineIntervalExecutionView.vue', import.meta.url),
  'utf8',
)
const preStartPresentation = view.match(
  /<header class="text-center">[\s\S]*?<section v-if="!flow\.activeTimer\.value"[\s\S]*?<\/section>/,
)?.[0]
const initialState = view.match(
  /<section\s+v-else-if="flow\.execution\.value[\s\S]*?<section\s+v-else-if="flow\.execution\.value && flow\.canReview/,
)?.[0]

test('HIIT pre-start screen shows only user-facing block, interval, exercise, and duration data', () => {
  assert.ok(preStartPresentation)
  assert.match(preStartPresentation, /HIIT/)
  assert.match(
    preStartPresentation,
    /Intervalo \{\{ flow\.cycleIndex\.value \}\} de \{\{ flow\.currentBlock\.value\.cycles \}\}/,
  )
  assert.match(preStartPresentation, /\{\{ flow\.currentExercise\.value \}\}/)
  assert.match(preStartPresentation, /\{\{ flow\.currentPhase\.value\.windowSeconds \}\} s/)
  assert.match(preStartPresentation, /metricPillColorClass\('duration'\)/)
  assert.doesNotMatch(
    preStartPresentation,
    /currentBlock\.value\.key|executionId|requestId|UUID|Duración programada/,
  )
  assert.doesNotMatch(preStartPresentation, /reps|kg|RPE|calorías|distancia/i)
})

test('HIIT start action uses the shared red primary style without changing its action', () => {
  const startButton = initialState?.match(/<button\s+v-if="!flow\.activeTimer\.value"[\s\S]*?<\/button>/)?.[0]
  assert.ok(startButton)
  assert.match(startButton, /Iniciar HIIT/)
  assert.match(startButton, /bg-\[var\(--trakia-accent-action\)\]/)
  assert.match(startButton, /text-\[var\(--trakia-accent-action-foreground\)\]/)
  assert.match(startButton, /min-h-14 w-full/)
  assert.match(startButton, /rounded-\[var\(--trakia-radius-control\)\]/)
  assert.match(startButton, /:disabled="!flow\.canStart\.value"/)
  assert.match(startButton, /flow\.isBusy\.value \? 'Iniciando…' : 'Iniciar HIIT'/)
  assert.match(startButton, /@click="flow\.start"/)
  assert.doesNotMatch(startButton, /lime|confirm/i)
})

test('HIIT changes after the start action stay in the existing timer and result states', () => {
  assert.match(view, /v-if="flow\.activeTimer\.value" class="space-y-2 text-center"/)
  assert.match(view, /flow\.timerDisplay\.value/)
  assert.match(view, /flow\.pause/)
  assert.match(view, /flow\.resume/)
  assert.match(view, /flow\.finishEarly/)
  assert.match(view, /flow\.skip/)
  assert.match(view, /IntervalResultMetricsReview/)
  assert.match(view, /WorkoutExecutionSummary/)
})

test('work state keeps the exercise, warm timer, phase label, and discreet next phase', () => {
  const activeSection = view.match(/<section v-if="flow\.activeTimer\.value"[\s\S]*?<\/section>/)?.[0]
  assert.ok(activeSection)
  assert.match(view, /v-if="flow\.isWorking\.value && flow\.currentExercise\.value"/)
  assert.match(activeSection, /phaseName\(flow\.currentPhase\.value\?\.type\)/)
  assert.match(activeSection, /Pausado/)
  assert.match(activeSection, /tabular-nums[^"]*text-\[var\(--trakia-text\)\]/)
  assert.match(activeSection, /Después: \{\{ phaseName\(flow\.nextPhase\.value\.phase\.type\) \}\}/)
  assert.match(view, /return type === 'work' \? 'Trabajo' : 'Descanso'/)
  assert.doesNotMatch(activeSection, /lime-/)
})

test('rest shows the next exercise only when available and labels the final rest briefly', () => {
  const activeSection = view.match(/<section v-if="flow\.activeTimer\.value"[\s\S]*?<\/section>/)?.[0]
  assert.ok(activeSection)
  assert.match(activeSection, /flow\.isResting\.value/)
  assert.match(
    activeSection,
    /<span v-if="flow\.nextExercise\.value">Después: \{\{ flow\.nextExercise\.value \}\}<\/span>/,
  )
  assert.match(
    activeSection,
    /<span v-else>Después: \{\{ phaseName\(flow\.nextPhase\.value\.phase\.type\) \}\}<\/span>/,
  )
  assert.match(activeSection, /v-else-if="flow\.isResting\.value"[\s\S]*?Último descanso/)
  assert.doesNotMatch(activeSection, /al terminar se cerrará este bloque/)
})

test('active HIIT actions retain their existing phase conditions and charcoal styling', () => {
  const resumeButton = view.match(
    /<div v-else-if="flow\.isPaused\.value"[\s\S]*?<button[\s\S]*?<\/button>/,
  )?.[0]
  const buttonFor = (action) =>
    view
      .split('<button')
      .slice(1)
      .map((button) => `<button${button.split('</button>')[0]}</button>`)
      .find((button) => button.includes(`@click="flow.${action}"`))
  const finishButton = buttonFor('finishEarly')
  const skipButton = buttonFor('skip')
  const pauseButton = buttonFor('pause')

  assert.ok(resumeButton)
  assert.ok(finishButton)
  assert.ok(skipButton)
  assert.ok(pauseButton)
  assert.match(resumeButton, /@click="flow\.resume"/)
  assert.match(resumeButton, /bg-\[var\(--trakia-surface\)\]/)
  assert.match(finishButton, /@click="flow\.finishEarly"/)
  assert.match(finishButton, /v-if="flow\.isWorking\.value"/)
  assert.match(finishButton, /flow\.isBusy\.value \|\| !flow\.isOnline\.value/)
  assert.match(finishButton, /text-\[var\(--trakia-warning\)\]/)
  assert.match(skipButton, /@click="flow\.skip"/)
  assert.match(skipButton, /v-if="flow\.isWorking\.value"/)
  assert.match(skipButton, /bg-\[var\(--trakia-surface\)\]/)
  assert.match(pauseButton, /@click="flow\.pause"/)
  assert.match(pauseButton, /bg-\[var\(--trakia-surface\)\]/)
  assert.match(pauseButton, /min-h-12/)
  assert.doesNotMatch(`${resumeButton}${finishButton}${skipButton}${pauseButton}`, /lime-|accent-action/)
})

test('active layout respects mobile safe areas and keeps its content compact', () => {
  const main = view.match(/<main\s+class="([^"]+)"/)?.[1]
  assert.ok(main)
  assert.match(main, /safe-area-inset-top/)
  assert.match(main, /safe-area-inset-bottom/)
  assert.match(main, /safe-area-inset-left/)
  assert.match(main, /safe-area-inset-right/)
  assert.match(view, /class="space-y-4 pt-1"/)
  assert.match(view, /class="space-y-2 text-center" aria-label="Fase HIIT actual"/)
})
