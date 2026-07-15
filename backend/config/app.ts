import env from '#start/env'
import { defineConfig } from '@adonisjs/core/http'
import { Secret } from '@adonisjs/core/helpers'

export const appKey = new Secret(env.get('APP_KEY'))

export const http = defineConfig({
  generateRequestId: true,
  allowMethodSpoofing: false,

  /*
  |--------------------------------------------------------------------------
  | Proxy trust
  |--------------------------------------------------------------------------
  |
  | Required by request.ip() / proxy-addr. In development we trust the
  | direct connection; in production adjust to the reverse-proxy CIDR.
  |
  */
  trustProxy: () => true,

  /*
  |--------------------------------------------------------------------------
  | Redirects
  |--------------------------------------------------------------------------
  |
  | Required by response.redirect() (used by ForceHttpsMiddleware, among
  | others). `allowedHosts` restricts which referrer hosts are trusted for
  | redirect-back helpers; empty means only the request's own host.
  |
  */
  redirect: {
    allowedHosts: [],
    forwardQueryString: false,
  },
})
