import { Injectable } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { normalizeEmail, User } from './user.entity.js'

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: normalizeEmail(email) })
      .getOne()
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } })
  }

  async incrementSessionVersion(id: string): Promise<void> {
    await this.users.increment({ id }, 'sessionVersion', 1)
  }

  create(email: string, passwordHash: string): Promise<User> {
    return this.users.save(this.users.create({ email: normalizeEmail(email), passwordHash }))
  }

  async bootstrapFirstUser(email: string, passwordHash: string): Promise<boolean> {
    const runner = this.dataSource.createQueryRunner()
    await runner.connect()
    try {
      await runner.startTransaction()
      await runner.query('SELECT pg_advisory_xact_lock($1, $2)', [71421, 1])
      const users = runner.manager.getRepository(User)
      if ((await users.count()) !== 0) {
        await runner.rollbackTransaction()
        return false
      }

      await users.save(users.create({ email: normalizeEmail(email), passwordHash }))
      await runner.commitTransaction()
      return true
    } catch (error) {
      if (runner.isTransactionActive) await runner.rollbackTransaction()
      throw error
    } finally {
      await runner.release()
    }
  }

  async resetPassword(email: string, passwordHash: string): Promise<boolean> {
    const result = await this.users
      .createQueryBuilder()
      .update(User)
      .set({ passwordHash, sessionVersion: () => 'session_version + 1' })
      .where('email = :email', { email: normalizeEmail(email) })
      .execute()

    return (result.affected ?? 0) > 0
  }
}
