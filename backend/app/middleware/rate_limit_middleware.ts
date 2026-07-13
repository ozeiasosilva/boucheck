import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * RateLimit middleware.
 *
 * Enforces a true sliding-window rate limit per client IP address on
 * Public_API endpoints: at most `maxRequests` (30) requests are allowed
 * within any `windowMs` (60,000 ms) trailing window. Requests beyond the
 * limit within the window receive HTTP 429 with `retry_after_seconds`
 * indicating how long until the oldest request in the window expires.
 *
 * Implementation notes:
 * - Uses an in-memory store (Map<ip, timestamps[]>) acceptable for a
 *   single-instance v1 deployment (upgradeable to Redis later).
 * - The window is a genuine sliding window (timestamps of prior requests
 *   are retained and pruned lazily), not a fixed-bucket reset, so that a
 *   burst spanning a bucket boundary is still correctly rate limited.
 * - The clock is injectable (`now` param) to allow deterministic testing.
 *
 * Validates: Requirement 9.2
 */

/**
 * Module-level store shared across requests.
 *
 * AdonisJS resolves middleware classes through the IoC container, which may
 * construct a new instance per request. The counter state must outlive a
 * single request/instance, so it lives at module scope and is injected into
 * each `RateLimitMiddleware` instance by reference.
 */
const sharedStore: Map<string, number[]> = new Map()

export class RateLimitMiddleware {
  /** IP -> ascending list of request timestamps (ms) within the trailing window */
  private store: Map<string, number[]>

  readonly maxRequests = 30
  readonly windowMs = 60_000

  constructor(store: Map<string, number[]> = sharedStore) {
    this.store = store
  }

  /**
   * Records a request from `ip` at time `now` (ms since epoch) and reports
   * whether it should be allowed through.
   *
   * Returns `{ allowed: true }` when the request is within the limit, or
   * `{ allowed: false, retryAfterSeconds }` when the request is the 31st+
   * request within the trailing 60-second window for that IP.
   */
  check(ip: string, now: number = Date.now()): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
    const windowStart = now - this.windowMs

    const existing = this.store.get(ip) ?? []
    // Prune timestamps that have fallen outside the trailing window.
    const withinWindow = existing.filter((ts) => ts > windowStart)

    if (withinWindow.length >= this.maxRequests) {
      const oldest = withinWindow[0]
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000))
      // Do not record the rejected request; it did not consume a slot.
      this.store.set(ip, withinWindow)
      return { allowed: false, retryAfterSeconds }
    }

    withinWindow.push(now)
    this.store.set(ip, withinWindow)
    return { allowed: true }
  }

  /** Clears all recorded request timestamps. Intended for test isolation. */
  reset() {
    this.store.clear()
  }

  async handle(ctx: HttpContext, next: NextFn) {
    const ip = ctx.request.ip()
    const result = this.check(ip)

    if (!result.allowed) {
      return ctx.response.status(429).json({
        error: 'rate_limit_exceeded',
        retry_after_seconds: result.retryAfterSeconds,
      })
    }

    return next()
  }
}

export default RateLimitMiddleware
