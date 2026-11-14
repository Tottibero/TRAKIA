export function safeLocalRedirect(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\'))
    return undefined
  try {
    const destination = new URL(value, 'https://trakia.local')
    if (destination.origin !== 'https://trakia.local') return undefined
    return `${destination.pathname}${destination.search}${destination.hash}`
  } catch {
    return undefined
  }
}
