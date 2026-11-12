export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.method && init.method !== 'GET' ? { 'X-Trakia-CSRF': '1' } : {}),
      ...init.headers,
    },
  })

  if (!response.ok) {
    let message = 'No se pudo completar la solicitud.'
    try {
      const body = (await response.json()) as { message?: unknown }
      if (typeof body.message === 'string' && response.status < 500) message = body.message
    } catch {
      // Keep a safe generic message for responses without a JSON body.
    }
    throw new ApiError(response.status, message)
  }

  if (response.status === 204) return undefined as T
  const text = await response.text()
  return text ? (JSON.parse(text) as T) : (undefined as T)
}
