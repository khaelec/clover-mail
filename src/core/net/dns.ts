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

  // Answers in the shape the caller asked for: net.connect (with Node's default
  // autoSelectFamily) calls lookup with `{ all: true }` and expects an array of
  // { address, family }; a bare string there breaks the connection.
  const fallback = (
    hostname: string,
    all: boolean,
    callback: (err: Error | null, address?: any, family?: number) => void
  ): void => {
    const resolver = new dns.Resolver()
    try {
      resolver.setServers(publicServers)
    } catch {
      // ignore
    }
    resolver.resolve4(hostname, (err, addresses) => {
      if (err || !addresses || addresses.length === 0) {
        const error = Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), {
          code: 'ENOTFOUND',
          hostname
        })
        callback(error)
        return
      }
      if (all) callback(null, addresses.map((address) => ({ address, family: 4 })))
      else callback(null, addresses[0], 4)
    })
  }

  dns.lookup = ((hostname: string, options: any, callback: any) => {
    const cb = typeof options === 'function' ? options : callback
    const opts = typeof options === 'function' ? {} : options
    original(hostname, opts, (err: Error | null, address: any, family: number) => {
      if (!err) {
        cb(null, address, family)
        return
      }
      fallback(hostname, Boolean(opts && typeof opts === 'object' && opts.all), cb)
    })
  }) as typeof dns.lookup
}
