/** @param {(online: boolean) => void} onChange @param {Window} target */
export function subscribeNetworkStatus(onChange, target = globalThis.window) {
  const update = () => onChange(target.navigator.onLine)
  target.addEventListener('online', update)
  target.addEventListener('offline', update)
  update()

  return () => {
    target.removeEventListener('online', update)
    target.removeEventListener('offline', update)
  }
}
