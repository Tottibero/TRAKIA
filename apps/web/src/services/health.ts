import { HealthResponseSchema } from '@trakia/contracts'

export async function getHealth() {
  const response = await fetch('/api/health')

  if (!response.ok) {
    throw new Error(`La API respondió con HTTP ${response.status}`)
  }

  return HealthResponseSchema.parse(await response.json())
}
