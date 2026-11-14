import { createRequire } from 'node:module'

interface JsonParser {
  (request: { path?: string }, response: JsonResponse, next: (error?: unknown) => void): void
}

interface JsonResponse {
  status(code: number): JsonResponse
  json(body: unknown): void
}

interface ExpressJsonModule {
  json(options: { limit: number }): JsonParser
}

interface MiddlewareApplication {
  use(
    middleware: (request: { path?: string }, response: JsonResponse, next: (error?: unknown) => void) => void,
  ): unknown
}

const requireFromApplication = createRequire(import.meta.url)
const requireFromPlatformExpress = createRequire(requireFromApplication.resolve('@nestjs/platform-express'))
const expressJson = (requireFromPlatformExpress('express') as ExpressJsonModule).json
const defaultJsonParser = expressJson({ limit: 100 * 1024 })
const importJsonParser = expressJson({ limit: 1024 * 1024 })

export function registerJsonBodyParser(application: MiddlewareApplication): void {
  application.use((request, response, next) => {
    const path = request.path ?? ''
    const isImportRequest =
      path === '/api/training-plan-imports/reviews' || path === '/api/training-plan-imports/confirmations'
    const parser = isImportRequest ? importJsonParser : defaultJsonParser
    return parser(request, response, (error) => {
      const parserError = error as { status?: number; type?: string } | undefined
      if (parserError?.type === 'entity.too.large' || parserError?.status === 413) {
        response.status(413).json({
          code: 'BODY_TOO_LARGE',
          message: isImportRequest
            ? 'El archivo supera el límite de 1 MiB.'
            : 'La solicitud supera el tamaño máximo permitido.',
        })
        return
      }
      if (parserError?.type === 'entity.parse.failed') {
        response.status(400).json({ code: 'INVALID_JSON', message: 'La solicitud no contiene JSON válido.' })
        return
      }
      next(error)
    })
  })
}
