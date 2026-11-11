import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'
import { getCorsOrigins, getPort } from './config/runtime-config.js'

async function bootstrap() {
  const port = getPort()
  const app = await NestFactory.create(AppModule)

  app.setGlobalPrefix('api')
  app.enableCors({ origin: getCorsOrigins() })

  await app.listen(port)
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown startup error'
  console.error(`TRAKIA API failed to start: ${message}`)
  process.exitCode = 1
})
