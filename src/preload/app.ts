/// <reference lib="dom" />
import { ipcRenderer, webFrame } from 'electron'

/**
 * Injected into every embedded-app webview (see will-attach-webview in main).
 *
 * Runs in the isolated world, so it can't touch the page's `window.Notification`
 * directly. Instead it injects a tiny wrapper into the page's own world, which
 * forwards each notification here; we relay it to the host and, when the host
 * asks, tell the page world to run the notification's onclick (so clicking a bell
 * item jumps to the chat). The page gets nothing but the wrapped Notification.
 */
const PAGE_WRAPPER = `
(function () {
  if (window.__cloverNotifWrapped) return;
  window.__cloverNotifWrapped = true;
  var Original = window.Notification;
  if (!Original) return;
  var kept = new Map();
  var seq = 0;
  function Wrapped(title, options) {
    options = options || {};
    var n = new Original(title, options);
    // The host may ask us to suppress the app's own OS popup (to avoid a double
    // when Clover Mail shows its own).
    if (window.__cloverSuppressOs) { try { n.close(); } catch (e) {} }
    var id = 'n' + (++seq);
    kept.set(id, n);
    try {
      window.postMessage({
        __clover: 'notification',
        id: id,
        title: String(title == null ? '' : title),
        body: String(options.body == null ? '' : options.body),
        tag: options.tag == null ? null : String(options.tag)
      }, '*');
    } catch (e) {}
    return n;
  }
  try {
    Wrapped.requestPermission = Original.requestPermission
      ? function () { return Original.requestPermission(); }
      : function () { return Promise.resolve('denied'); };
  } catch (e) {}
  try {
    Object.defineProperty(Wrapped, 'permission', {
      get: function () { return Original.permission; }
    });
  } catch (e) {}
  try { window.Notification = Wrapped; } catch (e) {}
  window.addEventListener('message', function (e) {
    if (e.source !== window || !e.data) return;
    if (e.data.__clover === 'settings') {
      window.__cloverSuppressOs = !e.data.osPopup;
      return;
    }
    if (e.data.__clover !== 'trigger') return;
    var n = kept.get(e.data.id);
    if (!n) return;
    try { if (typeof n.onclick === 'function') n.onclick.call(n, new Event('click')); } catch (err) {}
  });
})();
`

try {
  webFrame.executeJavaScript(PAGE_WRAPPER)
} catch {
  // Page not ready / blocked — notifications just won't be captured.
}

interface PageNotification {
  __clover?: string
  id?: string
  title?: string
  body?: string
  tag?: string | null
}

window.addEventListener('message', (event: MessageEvent) => {
  const data = event.data as PageNotification | undefined
  if (!data || data.__clover !== 'notification') return
  ipcRenderer.sendToHost('clover-app-notification', {
    id: data.id,
    title: data.title,
    body: data.body,
    tag: data.tag
  })
})

ipcRenderer.on('clover-trigger-notification', (_event, id: string) => {
  window.postMessage({ __clover: 'trigger', id }, '*')
})

ipcRenderer.on('clover-app-settings', (_event, settings: { osPopup?: boolean }) => {
  window.postMessage({ __clover: 'settings', osPopup: settings?.osPopup ?? true }, '*')
})
