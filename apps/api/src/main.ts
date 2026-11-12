import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'
import { getCorsOrigins, getPort, getTrustedProxies } from './config/runtime-config.js'
import { HttpSecurityMiddleware } from './config/http-security.middleware.js'

async function bootstrap() {
  const port = getPort()
  const app = await NestFactory.create(AppModule)

  app.getHttpAdapter().getInstance().set('trust proxy', getTrustedProxies())
  app.use(new HttpSecurityMiddleware(getCorsOrigins()).use)
  app.setGlobalPrefix('api')
  app.enableCors({
    origin: getCorsOrigins(),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-TRAKIA-CSRF'],
    maxAge: 600,
  })

  await app.listen(port, '0.0.0.0')
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown startup error'
  console.error(`TRAKIA API failed to start: ${message}`)
  process.exitCode = 1
})
