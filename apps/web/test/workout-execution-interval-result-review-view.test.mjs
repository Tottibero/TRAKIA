import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const component = await readFile(
  new URL('../src/features/workout-execution/components/IntervalResultMetricsReview.vue', import.meta.url),
  'utf8',
)
const view = await readFile(
  new URL('../src/features/workout-execution/views/OnlineIntervalExecutionView.vue', import.meta.url),
  'utf8',
)

test('HIIT review uses one compact save action and removes redundant result instructions', () => {
  assert.match(component, /Guardar resultados/)
  assert.doesNotMatch(
    component,
    /Confirmar métricas del intervalo|Resultados HIIT|RESULTADOS REALES|Objetivo:|Sin objetivo/,
  )
  assert.match(component, /bg-\[var\(--trakia-save-action\)\]/)
  assert.match(component, /\? 'Guardando resultados…' : 'Guardar resultados'/)
})

test('interval rows show effective duration instead of repeating planned duration', () => {
  assert.match(
    component,
    /if \(result\.activeSeconds !== undefined\) return `\$\{result\.activeSeconds\} s efectivos`/,
  )
  assert.match(component, /phase\?\.windowSeconds === undefined \? null : `\$\{phase\.windowSeconds\} s`/)
  assert.doesNotMatch(component, /Duración programada|Duración efectiva/)
  assert.match(view, /\{\{ totalEffectiveSeconds\(\) \}\} s efectivos/)
  assert.doesNotMatch(view, /Los descansos no se suman al tiempo de trabajo/)
})

test('save action disables during requests and reports recoverable errors without hiding rows', () => {
  assert.match(component, /if \(saving\.value \|\| !props\.online \|\| !hasValidPending\.value\) return/)
  assert.match(component, /:disabled="!hasValidPending \|\| saving \|\| !online"/)
  assert.match(component, /Los confirmados se conservaron; reintenta los pendientes/)
  assert.match(component, /getOpenWorkoutExecution/)
  assert.match(
    component,
    /recordWorkoutExecutionResultMetrics\(props\.execution\.id, resultId, \{ actualMetrics \}\)/,
  )
})

test('continue and close actions keep the existing pending-metrics gate and TRAKIA red action token', () => {
  assert.match(
    view,
    /:disabled="!flow\.canClose\.value \|\| flow\.isClosing\.value \|\| !flow\.isOnline\.value"/,
  )
  assert.match(view, /bg-\[var\(--trakia-accent-action\)\]/)
  assert.match(view, /Continuar al siguiente bloque/)
  assert.match(view, /Cerrar entrenamiento/)
  assert.doesNotMatch(view, /lime/)
})
