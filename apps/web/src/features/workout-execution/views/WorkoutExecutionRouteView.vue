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
</script>

<template>
  <OnlineStrengthExecutionView
    v-if="isOnlineStrengthFlow"
    :execution-id="executionId"
    :request-id="requestId"
  />
  <OnlineCircuitExecutionView
    v-else-if="isOnlineCircuitFlow"
    :execution-id="executionId"
    :request-id="requestId"
  />
  <OnlineIntervalExecutionView
    v-else-if="isOnlineIntervalsFlow"
    :execution-id="executionId"
    :request-id="requestId"
  />
  <OnlineAmrapExecutionView
    v-else-if="isOnlineAmrapFlow"
    :execution-id="executionId"
    :request-id="requestId"
  />
  <WorkoutExecutionView v-else />
</template>
