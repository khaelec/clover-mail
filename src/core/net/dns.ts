/* eslint-disable @typescript-eslint/no-explicit-any */
import dns from 'node:dns'

/**
 * nodejs-mobile's resolver (and some networks/routers) intermittently fail with
 * `getaddrinfo ENOTFOUND` where the device's own apps resolve fine — notably
 * after the Android app has been backgrounded. Wrap `dns.lookup` (which
 * net.connect/imapflow use) so a failed lookup retries through public DNS
 * servers via c-ares instead of failing the sync.
 */
let installed = false

export function installResilientDns(): void {
  if (installed) return
  installed = true

  const original = dns.lookup.bind(dns)
  const publicServers = ['8.8.8.8', '1.1.1.1', '9.9.9.9']

  const fallback = (
    hostname: string,
    callback: (err: Error | null, address?: string, family?: number) => void
  ): void => {
    try {
      dns.setServers(publicServers)
    } catch {
      // ignore
    }
    dns.resolve4(hostname, (err, addresses) => {
      if (err || !addresses || addresses.length === 0) {
        callback(new Error(`getaddrinfo ENOTFOUND ${hostname}`))
        return
      }
      callback(null, addresses[0], 4)
    })
  }

  dns.lookup = ((hostname: string, options: any, callback: any) => {
    const cb = typeof options === 'function' ? options : callback
    const opts = typeof options === 'function' ? {} : options
    original(hostname, opts, (err: Error | null, address: string, family: number) => {
      if (!err) {
        cb(null, address, family)
        return
      }
      fallback(hostname, cb)
    })
  }) as typeof dns.lookup
}
