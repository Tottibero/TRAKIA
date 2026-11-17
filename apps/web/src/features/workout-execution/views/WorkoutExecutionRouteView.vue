<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import OnlineStrengthExecutionView from './OnlineStrengthExecutionView.vue'
import WorkoutExecutionView from './WorkoutExecutionView.vue'

const route = useRoute()
const isOnlineStrengthFlow = computed(() => route.query.flow === 'online-strength')
const executionId = computed(() => String(route.params.executionId ?? ''))
const requestId = computed(() => String(route.query.requestId ?? ''))
</script>

<template>
  <OnlineStrengthExecutionView
    v-if="isOnlineStrengthFlow"
    :execution-id="executionId"
    :request-id="requestId"
  />
  <WorkoutExecutionView v-else />
</template>
