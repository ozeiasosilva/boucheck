import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'

/**
 * Property-based tests for event timeline completeness and ordering.
 *
 * Property 9: Event timeline completeness and ordering
 * Validates: Requirements 5.1, 5.2
 *
 * These tests verify the timeline contract as pure functions:
 * 1. Every event appears in the timeline (Req 5.1): Given N events, timeline has N entries
 * 2. Events are ordered by createdAt ascending (Req 5.1): timeline[i].createdAt <= timeline[i+1].createdAt
 * 3. Each entry includes tipo, createdAt, and payload (Req 5.2): all three fields are present (not undefined)
 * 4. Event tipo values are preserved: timeline[i].tipo matches input[i].tipo
 * 5. Event payload is preserved: timeline[i].payload matches input[i].payload
 */

// ---------------------------------------------------------------------------
// Types simulating the data involved in the timeline mapping
// ---------------------------------------------------------------------------

/**
 * Simulates a raw response_events row as loaded from the database.
 */
interface RawEvent {
  tipo: string
  createdAt: string // ISO timestamp
  payload: unknown
}

/**
 * Simulates the timeline entry shape as returned in SessionDetail.
 */
interface TimelineEntry {
  tipo: string
  createdAt: string
  payload: unknown
}

// ---------------------------------------------------------------------------
// Pure functions replicating the ResponseTrackingService.detail() timeline logic
// ---------------------------------------------------------------------------

/**
 * Sorts raw events by createdAt ascending (replicating the DB ORDER BY created_at ASC).
 * This is the ordering guarantee from Req 5.1.
 */
function sortEventsByCreatedAt(events: RawEvent[]): RawEvent[] {
  return [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/**
 * Maps sorted events to the timeline shape.
 * Replicates:
 *   session.events.map((event) => ({
 *     tipo: event.tipo,
 *     createdAt: event.createdAt.toISO()!,
 *     payload: event.payload,
 *   }))
 */
function mapTimeline(sortedEvents: RawEvent[]): TimelineEntry[] {
  return sortedEvents.map((event) => ({
    tipo: event.tipo,
    createdAt: event.createdAt,
    payload: event.payload,
  }))
}

/**
 * Full pipeline: sort events, then map to timeline entries.
 */
function buildTimeline(events: RawEvent[]): TimelineEntry[] {
  const sorted = sortEventsByCreatedAt(events)
  return mapTimeline(sorted)
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Known event types from the BouCheck system */
const EVENT_TYPES = [
  'pagina_acessada',
  'privacidade_aceita',
  'pergunta_respondida',
  'questionario_completo',
  'relatorio_visualizado',
  'relatorio_email_enviado',
  'relatorio_whatsapp_enviado',
  'relatorio_envio_falhou',
  'consultor_solicitado',
  'relatorio_reenvio_solicitado',
]

/**
 * Generator for a random event tipo.
 */
function tipoArbitrary(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.constantFrom(...EVENT_TYPES),
    fc.string({ minLength: 3, maxLength: 30 }) // also allow arbitrary strings for robustness
  )
}

/**
 * Generator for a random payload (JSON-like structure).
 */
function payloadArbitrary(): fc.Arbitrary<unknown> {
  return fc.oneof(
    fc.constant(null),
    fc.constant({}),
    fc.record({
      question_id: fc.integer({ min: 1, max: 10000 }),
    }),
    fc.record({
      canal: fc.constantFrom('email', 'whatsapp'),
      motivo: fc.string({ minLength: 1, maxLength: 100 }),
    }),
    fc.record({
      admin_user_id: fc.integer({ min: 1, max: 1000 }),
      canal: fc.constantFrom('email', 'whatsapp'),
    }),
    fc.dictionary(
      fc.string({ minLength: 1, maxLength: 20 }),
      fc.oneof(fc.string({ minLength: 0, maxLength: 50 }), fc.integer(), fc.boolean())
    )
  )
}

/**
 * Generator for a random ISO timestamp within a reasonable range.
 */
function timestampArbitrary(): fc.Arbitrary<string> {
  return fc.integer({ min: 1_000_000_000_000, max: 2_000_000_000_000 }).map((ms) => {
    return new Date(ms).toISOString()
  })
}

/**
 * Generator for a single raw event.
 */
function rawEventArbitrary(): fc.Arbitrary<RawEvent> {
  return fc.record({
    tipo: tipoArbitrary(),
    createdAt: timestampArbitrary(),
    payload: payloadArbitrary(),
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Property 9: Event timeline completeness and ordering', () => {
  it('every event appears in the timeline — given N events, timeline has N entries (Req 5.1)', () => {
    fc.assert(
      fc.property(
        fc.array(rawEventArbitrary(), { minLength: 0, maxLength: 50 }),
        (events) => {
          const timeline = buildTimeline(events)
          assert.strictEqual(
            timeline.length,
            events.length,
            `Expected ${events.length} timeline entries, got ${timeline.length}`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('events are ordered by createdAt ascending (Req 5.1)', () => {
    fc.assert(
      fc.property(
        fc.array(rawEventArbitrary(), { minLength: 2, maxLength: 50 }),
        (events) => {
          const timeline = buildTimeline(events)
          for (let i = 0; i < timeline.length - 1; i++) {
            assert.ok(
              timeline[i].createdAt <= timeline[i + 1].createdAt,
              `Timeline not ordered at index ${i}: "${timeline[i].createdAt}" should be <= "${timeline[i + 1].createdAt}"`
            )
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it('each entry includes tipo, createdAt, and payload — none are undefined (Req 5.2)', () => {
    fc.assert(
      fc.property(
        fc.array(rawEventArbitrary(), { minLength: 1, maxLength: 50 }),
        (events) => {
          const timeline = buildTimeline(events)
          for (let i = 0; i < timeline.length; i++) {
            const entry = timeline[i]
            assert.notStrictEqual(
              entry.tipo,
              undefined,
              `Timeline entry[${i}].tipo must not be undefined`
            )
            assert.notStrictEqual(
              entry.createdAt,
              undefined,
              `Timeline entry[${i}].createdAt must not be undefined`
            )
            assert.ok(
              'payload' in entry,
              `Timeline entry[${i}] must have a 'payload' field`
            )
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it('event tipo values are preserved: timeline[i].tipo matches the sorted input[i].tipo', () => {
    fc.assert(
      fc.property(
        fc.array(rawEventArbitrary(), { minLength: 1, maxLength: 50 }),
        (events) => {
          const sorted = sortEventsByCreatedAt(events)
          const timeline = buildTimeline(events)
          for (let i = 0; i < timeline.length; i++) {
            assert.strictEqual(
              timeline[i].tipo,
              sorted[i].tipo,
              `Timeline[${i}].tipo "${timeline[i].tipo}" should equal sorted input[${i}].tipo "${sorted[i].tipo}"`
            )
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it('event payload is preserved: timeline[i].payload matches the sorted input[i].payload', () => {
    fc.assert(
      fc.property(
        fc.array(rawEventArbitrary(), { minLength: 1, maxLength: 50 }),
        (events) => {
          const sorted = sortEventsByCreatedAt(events)
          const timeline = buildTimeline(events)
          for (let i = 0; i < timeline.length; i++) {
            assert.deepStrictEqual(
              timeline[i].payload,
              sorted[i].payload,
              `Timeline[${i}].payload should match sorted input[${i}].payload`
            )
          }
        }
      ),
      { numRuns: 200 }
    )
  })
})
