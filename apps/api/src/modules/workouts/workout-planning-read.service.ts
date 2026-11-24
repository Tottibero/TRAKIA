import { Injectable } from '@nestjs/common'
import {
  TrainingPlanCalendarQuerySchema,
  TrainingPlanCalendarResponseSchema,
  TrainingPlanSessionDetailSchema,
  type TrainingPlanCalendarQuery,
} from '@trakia/contracts'
import {
  TrainingPlanReadService,
  TrainingPlanSessionNotFoundError,
} from '../training-plans/training-plans.module.js'
import { WorkoutExecutionStartService } from './workout-execution-start.service.js'

@Injectable()
export class WorkoutPlanningReadService {
  constructor(
    private readonly plans: TrainingPlanReadService,
    private readonly executions: WorkoutExecutionStartService,
  ) {}

  async findCalendar(input: TrainingPlanCalendarQuery, userId: string) {
    const query = TrainingPlanCalendarQuerySchema.parse(input)
    const calendar = await this.plans.findCalendar(query)
    const sessionIds = calendar.days.flatMap((day) =>
      day.entries.flatMap((entry) => (entry.type === 'session' ? [entry.sessionId] : [])),
    )
    const executions = await this.executions.findForSessions(userId, sessionIds)

    return TrainingPlanCalendarResponseSchema.parse({
      ...calendar,
      days: calendar.days.map((day) => ({
        ...day,
        entries: day.entries.map((entry) => {
          if (entry.type !== 'session') return entry
          const execution = executions.get(entry.sessionId)
          if (!execution) return { ...entry, execution: null }
          const results = execution.results
          const circuitRounds = execution.circuitRounds ?? []
          const timedCircuitRounds = new Set(
            circuitRounds.map(({ blockKey, roundIndex }) => `${blockKey}:${roundIndex}`),
          )
          return {
            ...entry,
            execution: {
              id: execution.id,
              status: execution.status,
              summary: {
                finishedAt: execution.finishedAt ?? null,
                performedResults: results.filter(({ status }) => status === 'performed').length,
                activeSeconds:
                  circuitRounds.reduce((total, round) => total + round.activeSeconds, 0) +
                  results.reduce((total, result) => {
                    if (result.status !== 'performed') return total
                    if (
                      result.type === 'circuit' &&
                      result.round.kind === 'planned' &&
                      timedCircuitRounds.has(`${result.blockKey}:${result.round.roundIndex}`)
                    )
                      return total
                    return total + (result.activeSeconds ?? 0)
                  }, 0),
              },
            },
          }
        }),
      })),
    })
  }

  async findSession(planId: string, sessionId: string, userId: string) {
    const detail = await this.plans.findSession(planId, sessionId)
    const execution = (await this.executions.findForSessions(userId, [sessionId])).get(sessionId) ?? null
    return TrainingPlanSessionDetailSchema.parse({
      ...detail,
      session: { ...detail.session, execution },
    })
  }
}

export { TrainingPlanSessionNotFoundError }
