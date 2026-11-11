import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { normalizeEmail, User } from './user.entity.js'

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  findByEmail(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: normalizeEmail(email) })
      .getOne()
  }

  create(email: string, passwordHash: string): Promise<User> {
    return this.users.save(this.users.create({ email: normalizeEmail(email), passwordHash }))
  }
}
