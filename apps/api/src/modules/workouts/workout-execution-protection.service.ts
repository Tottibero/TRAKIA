import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, EntityManager } from 'typeorm'

/** Read-only capability consumed by training-plan import review. */
@Injectable()
export class WorkoutExecutionProtectionService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Shared cross-version protocol: writers lock each `planKey/sessionKey` pair
   * with a PostgreSQL transaction-scoped advisory lock, in sorted order. The
   * future online-start use case must call this inside its own transaction
   * before inserting the execution row.
   */
  async acquireSessionLocks(
    manager: EntityManager,
    planKey: string,
    sessionKeys: readonly string[],
  ): Promise<void> {
    const keys = [...new Set(sessionKeys)].sort()
    for (const sessionKey of keys) {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `trakia:workouts:session:${planKey}:${sessionKey}`,
      ])
    }
  }

  async findProtectedSessionKeys(
    planKey: string,
    sessionKeys: readonly string[],
    manager?: EntityManager,
  ): Promise<Set<string>> {
    if (sessionKeys.length === 0) return new Set()
    const query = manager ? manager.query.bind(manager) : this.dataSource.query.bind(this.dataSource)
    const rows = (await query(
      `SELECT DISTINCT session_key AS key
       FROM workout_executions
       WHERE plan_key = $1 AND session_key = ANY($2::varchar[])
         AND status IN ('in_progress', 'paused', 'completed')`,
      [planKey, [...sessionKeys]],
    )) as Array<{ key: string }>
    return new Set(rows.map(({ key }) => key))
  }
}
