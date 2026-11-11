import 'reflect-metadata'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../dist/app.module.js'
import { PasswordService, UsersService, validatePassword } from '../dist/modules/users/index.js'

class InputError extends Error {}

const operation = process.argv[2]
if (!['bootstrap', 'reset-password'].includes(operation)) {
  stdout.write('Uso: pnpm auth:bootstrap | pnpm auth:reset-password\n')
  process.exitCode = 2
} else {
  await execute(operation)
}

async function execute(mode) {
  let app
  let stage = 'configuración de la aplicación'
  try {
    const values = await readCredentials()
    const email = values.email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputError('El email no es válido.')
    if (values.password !== values.confirmation) throw new InputError('Las contraseñas no coinciden.')
    try {
      validatePassword(values.password)
    } catch (error) {
      throw new InputError(error.message)
    }

    app = await NestFactory.createApplicationContext(AppModule, { logger: false })
    const passwords = app.get(PasswordService)
    const users = app.get(UsersService)

    stage = 'hash de contraseña'
    const hash = await passwords.hash(values.password)

    if (mode === 'bootstrap') {
      stage = 'bootstrap de usuario'
      if (!(await users.bootstrapFirstUser(email, hash))) {
        throw new InputError('El bootstrap solo está permitido cuando no existen usuarios.')
      }
      stdout.write('Usuario inicial creado.\n')
    } else {
      stage = 'reset de contraseña'
      if (!(await users.resetPassword(email, hash))) {
        throw new InputError('No existe un usuario con ese email.')
      }
      stdout.write('Contraseña actualizada; las sesiones activas quedaron invalidadas.\n')
    }
  } catch (error) {
    const message =
      error instanceof InputError
        ? error.message
        : `Falló la ${stage}. Comprueba la configuración y el estado de la base de datos.`
    stdout.write(`Error: ${message}\n`)
    process.exitCode = 1
  } finally {
    if (app) await app.close().catch(() => {})
  }
}

async function readCredentials() {
  if (!stdin.isTTY) {
    let input = ''
    for await (const chunk of stdin) input += chunk
    const lines = input.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n')
    if (lines.length !== 3 || lines.some((line) => !line)) {
      throw new InputError(
        'La entrada stdin debe contener email, contraseña y confirmación, cada uno en una línea.',
      )
    }
    return { email: lines[0], password: lines[1], confirmation: lines[2] }
  }

  const rl = createInterface({ input: stdin, output: stdout })
  try {
    const email = await rl.question('Email: ')
    rl.close()
    const password = await hiddenPrompt('Contraseña: ')
    const confirmation = await hiddenPrompt('Confirma la contraseña: ')
    return { email, password, confirmation }
  } finally {
    rl.close()
  }
}

function hiddenPrompt(label) {
  return new Promise((resolve, reject) => {
    stdout.write(label)
    stdin.setRawMode(true)
    stdin.resume()
    let value = ''
    const onData = (buffer) => {
      for (const char of buffer.toString('utf8')) {
        if (char === '\u0003') {
          cleanup()
          stdout.write('\n')
          reject(new InputError('Operación cancelada.'))
          return
        }
        if (char === '\r' || char === '\n') {
          cleanup()
          stdout.write('\n')
          resolve(value)
          return
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1)
        else if (char >= ' ') value += char
      }
    }
    const cleanup = () => {
      stdin.off('data', onData)
      stdin.setRawMode(false)
    }
    stdin.on('data', onData)
  })
}
