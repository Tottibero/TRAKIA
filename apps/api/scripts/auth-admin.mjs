import 'reflect-metadata'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { NestFactory } from '@nestjs/core'
import { AuthAdminModule } from '../dist/modules/auth/auth-admin.module.js'
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
  let stage = 'inicialización de NestJS/TypeORM'
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

    app = await NestFactory.createApplicationContext(AuthAdminModule, {
      logger: false,
      abortOnError: false,
    })
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
    const message = getSafeErrorMessage(error, stage)
    stdout.write(`Error: ${message}\n`)
    process.exitCode = 1
  } finally {
    if (app) await app.close().catch(() => {})
  }
}

function getSafeErrorMessage(error, stage) {
  if (error instanceof InputError) return error.message

  const safeDatabaseErrors = {
    ECONNREFUSED:
      'No se pudo conectar a PostgreSQL (ECONNREFUSED). Comprueba que el servicio esté iniciado y que DATABASE_URL use el host accesible desde este terminal.',
    ETIMEDOUT: 'Se agotó el tiempo de conexión a PostgreSQL (ETIMEDOUT). Comprueba la red y DATABASE_URL.',
    ENOTFOUND: 'No se pudo resolver el host de PostgreSQL (ENOTFOUND). Comprueba el host de DATABASE_URL.',
    EHOSTUNREACH:
      'No se puede alcanzar el host de PostgreSQL (EHOSTUNREACH). Comprueba la red y DATABASE_URL.',
    '28P01': 'PostgreSQL rechazó la autenticación (28P01). Comprueba las credenciales configuradas.',
    28000: 'PostgreSQL rechazó el acceso (28000). Comprueba las credenciales y permisos configurados.',
    '3D000': 'La base configurada no existe (3D000). Comprueba el nombre indicado en DATABASE_URL.',
  }

  const messages = []
  const codes = []
  const visited = new Set()
  for (let current = error, depth = 0; current && depth < 5 && !visited.has(current); depth += 1) {
    visited.add(current)
    if (typeof current.message === 'string') messages.push(current.message)
    if (typeof current.code === 'string') codes.push(current.code)
    current = current.cause
  }

  if (messages.some((message) => message.includes('DATABASE_URL is required'))) {
    return 'Falta DATABASE_URL. Configura la conexión PostgreSQL antes de ejecutar el comando.'
  }
  if (messages.some((message) => message.includes('DATABASE_URL must'))) {
    return 'DATABASE_URL no tiene un formato PostgreSQL válido; revisa host y nombre de base.'
  }
  if (messages.some((message) => message.includes('DATABASE_SSL'))) {
    return 'DATABASE_SSL debe ser true o false y ser compatible con las opciones de DATABASE_URL.'
  }
  if (messages.some((message) => message.includes('JWT_SECRET must be configured'))) {
    return 'JWT_SECRET no está configurado correctamente. El comando administrativo no necesita JWT; revisa que se esté usando su contexto aislado.'
  }

  const code = codes.find((value) => Object.hasOwn(safeDatabaseErrors, value))
  if (code) return safeDatabaseErrors[code]
  return `Falló la ${stage}. Comprueba la configuración y disponibilidad de PostgreSQL.`
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

  if (typeof stdin.setRawMode !== 'function') {
    throw new InputError(
      'La terminal no permite ocultar la contraseña; usa una terminal interactiva compatible o la entrada stdin segura.',
    )
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
      stdin.pause()
    }
    stdin.on('data', onData)
  })
}
