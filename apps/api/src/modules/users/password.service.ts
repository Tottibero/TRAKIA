import { Injectable } from '@nestjs/common'
import * as argon2 from 'argon2'
import type { HashOptions } from 'argon2'

export const PASSWORD_MIN_LENGTH = 12
const ARGON2_OPTIONS: HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
}

export function validatePassword(password: string): void {
  if ([...password].length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`)
  }
}

@Injectable()
export class PasswordService {
  hash(password: string): Promise<string> {
    validatePassword(password)
    return argon2.hash(password, ARGON2_OPTIONS)
  }

  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password)
  }
}
