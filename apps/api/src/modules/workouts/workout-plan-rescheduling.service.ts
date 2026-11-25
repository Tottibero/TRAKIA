import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import type { TrainingPlanSessionRescheduleRequest } from '@trakia/contracts'
import { DataSource } from 'typeorm'
import { TrainingPlanService } from '../training-plans/training-plans.module.js'
import { WorkoutExecutionProtectionService } from './workout-execution-protection.service.js'

export class WorkoutPlanSessionNotPendingError extends Error {
  constructor() {
    super('La sesión ya se inició o se completó y no se puede mover.')
    this.name = 'WorkoutPlanSessionNotPendingError'
  }
}

@Injectable()
export class WorkoutPlanReschedulingService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly plans: TrainingPlanService,
    private readonly protection: WorkoutExecutionProtectionService,
  ) {}

  async moveSession(
    planId: string,
    sessionId: string,
    input: TrainingPlanSessionRescheduleRequest,
    clock: () => Date = () => new Date(),
  ) {
    return this.dataSource.transaction(async (manager) => {
      const initial = await this.plans.findSessionMoveIdentity(planId, sessionId, manager)
      if (!initial) throw new WorkoutPlanSessionNotFoundError()

      // Shared with workout start and plan import confirmation.
      await this.protection.acquireSessionLocks(manager, initial.planKey, [initial.sessionKey])

      const current = await this.plans.findSessionMoveIdentity(planId, sessionId, manager)
      if (!current) throw new WorkoutPlanSessionNotFoundError()
      if (current.planKey !== initial.planKey || current.sessionKey !== initial.sessionKey)
        throw new WorkoutPlanSessionDateChangedError()

      const protectedKeys = await this.protection.findProtectedSessionKeys(
        current.planKey,
        [current.sessionKey],
        manager,
      )
      if (protectedKeys.has(current.sessionKey)) throw new WorkoutPlanSessionNotPendingError()

      return this.plans.moveSessionDate(manager, planId, sessionId, input.expectedDate, input.newDate, clock)
    })
  }
}

export class WorkoutPlanSessionNotFoundError extends Error {
  constructor() {
    super('No se encontró la sesión pendiente del plan indicado.')
    this.name = 'WorkoutPlanSessionNotFoundError'
  }
}

export class WorkoutPlanSessionDateChangedError extends Error {
  constructor() {
    super('La fecha de esta sesión cambió. Actualiza el detalle e inténtalo de nuevo.')
    this.name = 'WorkoutPlanSessionDateChangedError'
  }
}
