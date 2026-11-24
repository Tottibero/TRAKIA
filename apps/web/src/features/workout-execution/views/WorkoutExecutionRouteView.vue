<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import OnlineStrengthExecutionView from './OnlineStrengthExecutionView.vue'
import OnlineCircuitExecutionView from './OnlineCircuitExecutionView.vue'
import OnlineIntervalExecutionView from './OnlineIntervalExecutionView.vue'
import OnlineAmrapExecutionView from './OnlineAmrapExecutionView.vue'
import WorkoutExecutionView from './WorkoutExecutionView.vue'

const route = useRoute()
const isOnlineStrengthFlow = computed(() => route.query.flow === 'online-strength')
const isOnlineCircuitFlow = computed(() => route.query.flow === 'online-circuit')
const isOnlineIntervalsFlow = computed(() => route.query.flow === 'online-intervals')
const isOnlineAmrapFlow = computed(() => route.query.flow === 'online-amrap')
const executionId = computed(() => String(route.params.executionId ?? ''))
const requestId = computed(() => String(route.query.requestId ?? ''))
const blockKey = computed(() => String(route.query.blockKey ?? ''))
const flowKey = computed(() => `${String(route.query.flow ?? 'standard')}:${blockKey.value}`)
</script>

<template>
  <OnlineStrengthExecutionView
    v-if="isOnlineStrengthFlow"
    :key="flowKey"
    :execution-id="executionId"
    :request-id="requestId"
    :block-key="blockKey"
  />
  <OnlineCircuitExecutionView
    v-else-if="isOnlineCircuitFlow"
    :key="flowKey"
    :execution-id="executionId"
    :request-id="requestId"
    :block-key="blockKey"
  />
  <OnlineIntervalExecutionView
    v-else-if="isOnlineIntervalsFlow"
    :key="flowKey"
    :execution-id="executionId"
    :request-id="requestId"
    :block-key="blockKey"
  />
  <OnlineAmrapExecutionView
    v-else-if="isOnlineAmrapFlow"
    :key="flowKey"
    :execution-id="executionId"
    :request-id="requestId"
    :block-key="blockKey"
  />
  <WorkoutExecutionView v-else />
</template>
