/**
 * True inside the Capacitor native shell (Android), false in Electron or a
 * plain browser. The phone app runs the engine in nodejs-mobile and talks to it
 * over the message channel; there is no desktop to connect to.
 */
interface CapacitorGlobal {
  isNativePlatform?: () => boolean
}

export function isNative(): boolean {
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor
  return cap?.isNativePlatform?.() === true
}
