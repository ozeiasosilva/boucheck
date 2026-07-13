// Feature: admin-tracking-dashboard, Property 13
/**
 * Property 13: Delivery_Channel resolution logic
 *
 * Validates: Requirements 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
 *
 * Verifies the pure `resolveChannel` function correctly resolves the delivery
 * channel based on the explicit channel parameter and the set of failed channels.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'
import { resolveChannel } from '../../app/services/resend_service.js'
import type { DeliveryChannel, ChannelResolution } from '../../app/services/resend_service.js'

const ALL_CHANNELS: DeliveryChannel[] = ['email', 'whatsapp']

// Arbitraries
const channelArb = fc.constantFrom<DeliveryChannel>(...ALL_CHANNELS)
const failedChannelsSetArb = fc.subarray(ALL_CHANNELS).map((arr) => new Set<DeliveryChannel>(arr))
const explicitArb = fc.option(channelArb, { nil: undefined })

describe('Property 13: Delivery_Channel resolution logic', () => {
  it('Explicit channel present in failedChannels → resolved (≥100 runs)', () => {
    /**
     * Validates: Requirement 8.2
     * When an explicit channel is provided AND failedChannels contains it,
     * the result must be { kind: 'resolved', channel: explicit }.
     */
    fc.assert(
      fc.property(channelArb, failedChannelsSetArb, (explicit, baseSet) => {
        // Ensure the explicit channel IS in failedChannels
        const failedChannels = new Set(baseSet)
        failedChannels.add(explicit)

        const result = resolveChannel(explicit, failedChannels)
        assert.deepStrictEqual(result, { kind: 'resolved', channel: explicit })
      }),
      { numRuns: 100 }
    )
  })

  it('Explicit channel not in failedChannels → not_found (≥100 runs)', () => {
    /**
     * Validates: Requirement 8.5
     * When an explicit channel is provided but failedChannels does NOT contain it,
     * the result must be { kind: 'not_found' }.
     */
    fc.assert(
      fc.property(channelArb, failedChannelsSetArb, (explicit, baseSet) => {
        // Ensure the explicit channel is NOT in failedChannels
        const failedChannels = new Set(baseSet)
        failedChannels.delete(explicit)

        const result = resolveChannel(explicit, failedChannels)
        assert.deepStrictEqual(result, { kind: 'not_found' })
      }),
      { numRuns: 100 }
    )
  })

  it('No explicit, exactly one failed channel → resolved with that channel (≥100 runs)', () => {
    /**
     * Validates: Requirement 8.3
     * When explicit is undefined and failedChannels has exactly one element,
     * the result must be { kind: 'resolved', channel: <the single channel> }.
     */
    fc.assert(
      fc.property(channelArb, (singleChannel) => {
        const failedChannels = new Set<DeliveryChannel>([singleChannel])

        const result = resolveChannel(undefined, failedChannels)
        assert.deepStrictEqual(result, { kind: 'resolved', channel: singleChannel })
      }),
      { numRuns: 100 }
    )
  })

  it('No explicit, two failed channels → ambiguous (≥100 runs)', () => {
    /**
     * Validates: Requirement 8.4
     * When explicit is undefined and failedChannels has both 'email' and 'whatsapp',
     * the result must be { kind: 'ambiguous' }.
     */
    fc.assert(
      fc.property(fc.constant(undefined), () => {
        const failedChannels = new Set<DeliveryChannel>(['email', 'whatsapp'])

        const result = resolveChannel(undefined, failedChannels)
        assert.deepStrictEqual(result, { kind: 'ambiguous' })
      }),
      { numRuns: 100 }
    )
  })

  it('No explicit, empty failedChannels → not_found (≥100 runs)', () => {
    /**
     * Validates: Requirement 8.5
     * When explicit is undefined and failedChannels is empty,
     * the result must be { kind: 'not_found' }.
     */
    fc.assert(
      fc.property(fc.constant(undefined), () => {
        const failedChannels = new Set<DeliveryChannel>()

        const result = resolveChannel(undefined, failedChannels)
        assert.deepStrictEqual(result, { kind: 'not_found' })
      }),
      { numRuns: 100 }
    )
  })

  it('Result is always one of the three tagged union variants (≥100 runs)', () => {
    /**
     * Validates: Requirements 8.2, 8.3, 8.4, 8.5 (completeness)
     * For any combination of explicit channel and failedChannels,
     * the result must have kind equal to 'resolved', 'ambiguous', or 'not_found'.
     */
    fc.assert(
      fc.property(explicitArb, failedChannelsSetArb, (explicit, failedChannels) => {
        const result = resolveChannel(explicit, failedChannels)
        const validKinds: ChannelResolution['kind'][] = ['resolved', 'ambiguous', 'not_found']

        assert.ok(
          validKinds.includes(result.kind),
          `Result kind "${result.kind}" must be one of ${validKinds.join(', ')}`
        )
      }),
      { numRuns: 100 }
    )
  })

  it('Resolved result always contains a channel that was in failedChannels (≥100 runs)', () => {
    /**
     * Validates: Requirements 8.6, 8.7 (no phantom channels)
     * When the result is { kind: 'resolved', channel }, then `channel`
     * must be a member of the `failedChannels` set that was passed in.
     */
    fc.assert(
      fc.property(explicitArb, failedChannelsSetArb, (explicit, failedChannels) => {
        const result = resolveChannel(explicit, failedChannels)

        if (result.kind === 'resolved') {
          assert.ok(
            failedChannels.has(result.channel),
            `Resolved channel "${result.channel}" must be in failedChannels: {${[...failedChannels].join(', ')}}`
          )
        }
      }),
      { numRuns: 100 }
    )
  })
})
