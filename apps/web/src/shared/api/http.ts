import { TrainingPlanImportHttpErrorSchema } from '@trakia/contracts'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = 'HTTP_ERROR',
    readonly issues?: unknown[],
    readonly conflicts?: unknown[],
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export class ApiNetworkError extends Error {
  constructor() {
    super('The API request could not reach the server.')
    this.name = 'ApiNetworkError'
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      credentials: 'include',
      cache: 'no-store',
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.method && init.method !== 'GET' ? { 'X-Trakia-CSRF': '1' } : {}),
        ...init.headers,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new ApiNetworkError()
  }

  if (!response.ok) {
    const defaultCode =
      response.status === 401
        ? 'AUTHENTICATION_REQUIRED'
        : response.status === 403
          ? 'CSRF_FORBIDDEN'
          : response.status === 413
            ? 'BODY_TOO_LARGE'
            : 'HTTP_ERROR'
    let contractError: ReturnType<typeof TrainingPlanImportHttpErrorSchema.safeParse> | undefined
    try {
      contractError = TrainingPlanImportHttpErrorSchema.safeParse(await response.json())
    } catch {
      // Fall through to a safe status-specific code for non-contract errors.
    }
    if (contractError?.success)
      throw new ApiError(
        response.status,
        contractError.data.message,
        contractError.data.code,
        contractError.data.issues,
        contractError.data.conflicts,
      )
    throw new ApiError(response.status, 'No se pudo completar la solicitud.', defaultCode)
  }

  if (response.status === 204) return undefined as T
  let text: string
  try {
    text = await response.text()
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new ApiNetworkError()
  }
  return text ? (JSON.parse(text) as T) : (undefined as T)
}
