// Registry of live app webviews so other surfaces (the bell) can send a message
// to an app — e.g. to trigger a notification's onclick and jump to the chat.
const webviews = new Map<string, HTMLElement>()

export function registerAppWebview(appId: string, el: HTMLElement): void {
  webviews.set(appId, el)
}

export function unregisterAppWebview(appId: string): void {
  webviews.delete(appId)
}

export function sendToApp(appId: string, channel: string, ...args: unknown[]): void {
  const el = webviews.get(appId) as unknown as
    | { send?: (channel: string, ...args: unknown[]) => void }
    | undefined
  try {
    el?.send?.(channel, ...args)
  } catch {
    // webview not ready
  }
}
