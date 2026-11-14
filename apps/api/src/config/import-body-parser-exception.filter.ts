import { ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common'

interface BodyParserError extends Error {
  status?: number
  type?: string
}

@Catch()
export class ImportBodyParserExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host
      .switchToHttp()
      .getResponse<{ status(code: number): { json(body: unknown): void } }>()
    const error = exception as BodyParserError
    if (error?.type === 'entity.too.large' || error?.status === 413) {
      response.status(413).json({ code: 'BODY_TOO_LARGE', message: 'El archivo supera el límite de 1 MiB.' })
      return
    }
    if (error?.type === 'entity.parse.failed') {
      response.status(400).json({ code: 'INVALID_JSON', message: 'La solicitud no contiene JSON válido.' })
      return
    }
    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json(exception.getResponse())
      return
    }
    response.status(500).json({ code: 'INTERNAL_ERROR', message: 'No se pudo completar la solicitud.' })
  }
}
