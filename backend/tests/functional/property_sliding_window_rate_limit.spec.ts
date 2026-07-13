// Feature: public-response-flow, Property 1.3
/**
 * Property: Sliding-window rate limit enforcement
 *
 * For any sequence of timestamped requests from a single IP, requests beyond
 * the 30th within any 60-second window receive a rejection (allowed=false),
 * and all requests within the limit receive a pass-through (allowed=true).
 *
 * Tests the `RateLimitMiddleware.check(ip, now)` method directly using
 * a constructor-injectable store Map for test isolation.
 *
 * **Validates: Requirements 9.2**
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'
import { RateLimitMiddleware } from '../../app/middleware/rate_limit_middleware.js'

describe('Property 1.3: Sliding-window rate limit enforcement', () => {
  it('requests within the 30-request limit are always allowed (≥100 runs)', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a sequence of 1-30 timestamps all within a 60-second window
        fc.integer({ min: 1, max: 30 }).chain((count) =>
          fc.tuple(
            fc.constant(count),
            fc.array(fc.integer({ min: 0, max: 59_999 }), {
              minLength: count,
              maxLength: count,
            })
          )
        ),
        async ([count, offsets]) => {
          const store = new Map<string, number[]>()
          const middleware = new RateLimitMiddleware(store)
          const baseTime = 1_000_000_000_000 // arbitrary epoch ms
          const ip = '192.168.1.1'

          // Sort offsets so timestamps are in ascending order
          const sortedOffsets = [...offsets].sort((a, b) => a - b)

          // All requests within the limit should be allowed
          for (let i = 0; i < count; i++) {
            const now = baseTime + sortedOffsets[i]
            const result = middleware.check(ip, now)
            assert.strictEqual(
              result.allowed,
              true,
              `Request ${i + 1} of ${count} within 60s window should be allowed`
            )
          }
        }
      ),
      { numRuns: 150 }
    )
  })

  it('the 31st+ request within any 60-second window is rejected (≥100 runs)', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 31-50 timestamps all within a 60-second window
        fc.integer({ min: 31, max: 50 }).chain((count) =>
          fc.tuple(
            fc.constant(count),
            fc.array(fc.integer({ min: 0, max: 59_999 }), {
              minLength: count,
              maxLength: count,
            })
          )
        ),
        async ([count, offsets]) => {
          const store = new Map<string, number[]>()
          const middleware = new RateLimitMiddleware(store)
          const baseTime = 1_000_000_000_000
          const ip = '10.0.0.42'

          // Sort offsets so timestamps are in ascending order
          const sortedOffsets = [...offsets].sort((a, b) => a - b)

          for (let i = 0; i < count; i++) {
            const now = baseTime + sortedOffsets[i]
            const result = middleware.check(ip, now)

            if (i < 30) {
              assert.strictEqual(
                result.allowed,
                true,
                `Request ${i + 1} (within limit) should be allowed`
              )
            } else {
              assert.strictEqual(
                result.allowed,
                false,
                `Request ${i + 1} (beyond limit of 30) should be rejected`
              )
              // Verify retryAfterSeconds is a positive number
              assert.ok(
                'retryAfterSeconds' in result && result.retryAfterSeconds >= 1,
                `Rejected request should include retryAfterSeconds >= 1, got ${(result as any).retryAfterSeconds}`
              )
            }
          }
        }
      ),
      { numRuns: 150 }
    )
  })

  it('requests outside the 60-second window do not count against the limit (≥100 runs)', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a "first burst" size (fill window to capacity) and a gap > 60s
        fc.record({
          burstSize: fc.integer({ min: 25, max: 30 }),
          gapMs: fc.integer({ min: 60_001, max: 120_000 }), // gap beyond the 60s window
          secondBurstSize: fc.integer({ min: 1, max: 30 }),
        }),
        async ({ burstSize, gapMs, secondBurstSize }) => {
          const store = new Map<string, number[]>()
          const middleware = new RateLimitMiddleware(store)
          const baseTime = 1_000_000_000_000
          const ip = '172.16.0.1'

          // First burst: all within first second to keep them in the same window
          for (let i = 0; i < burstSize; i++) {
            const result = middleware.check(ip, baseTime + i)
            assert.strictEqual(result.allowed, true, `First burst request ${i + 1} should be allowed`)
          }

          // After the gap (> 60s), old timestamps should have expired
          const afterGapTime = baseTime + gapMs

          // Second burst should all be allowed (old requests are outside the window)
          for (let i = 0; i < secondBurstSize; i++) {
            const now = afterGapTime + i
            const result = middleware.check(ip, now)
            assert.strictEqual(
              result.allowed,
              true,
              `Second burst request ${i + 1} after ${gapMs}ms gap should be allowed (window expired)`
            )
          }
        }
      ),
      { numRuns: 150 }
    )
  })

  it('sliding window correctly tracks requests across overlapping intervals (≥100 runs)', async () => {
    /**
     * This test verifies true sliding-window behavior: at any point in time,
     * the count is determined by how many requests fall within the trailing
     * 60-second window from "now", not from a fixed bucket boundary.
     */
    await fc.assert(
      fc.asyncProperty(
        // Generate a sequence of timestamps spread across a wider range
        fc.array(fc.integer({ min: 0, max: 180_000 }), { minLength: 10, maxLength: 60 }),
        async (offsets) => {
          const store = new Map<string, number[]>()
          const middleware = new RateLimitMiddleware(store)
          const baseTime = 1_000_000_000_000
          const ip = '192.168.100.1'

          // Sort to simulate chronological order
          const sortedOffsets = [...offsets].sort((a, b) => a - b)

          // Track all accepted timestamps to verify sliding window
          const acceptedTimestamps: number[] = []

          for (const offset of sortedOffsets) {
            const now = baseTime + offset
            const windowStart = now - 60_000

            // Count how many previously accepted requests are still within the window
            const inWindow = acceptedTimestamps.filter((ts) => ts > windowStart).length

            const result = middleware.check(ip, now)

            if (inWindow < 30) {
              // Should be allowed
              assert.strictEqual(
                result.allowed,
                true,
                `With ${inWindow} requests in window (< 30), request at offset ${offset}ms should be allowed`
              )
              acceptedTimestamps.push(now)
            } else {
              // Should be rejected
              assert.strictEqual(
                result.allowed,
                false,
                `With ${inWindow} requests in window (>= 30), request at offset ${offset}ms should be rejected`
              )
            }
          }
        }
      ),
      { numRuns: 150 }
    )
  })
})
