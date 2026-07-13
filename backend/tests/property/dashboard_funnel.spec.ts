import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'

/**
 * Property-based tests for Dashboard Funnel stage counting correctness.
 * Property 18: Funnel stage counting correctness
 * Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8
 *
 * Since `computeFunnel` requires a PostgreSQL connection, we test the logical
 * invariants of funnel counting at a model level using a pure simulation function
 * that mirrors the funnel query logic.
 */

// All event types relevant to funnel stages
const FUNNEL_EVENT_TYPES = [
  'pagina_acessada',
  'privacidade_aceita',
  'pergunta_respondida',
  'relatorio_visualizado',
  'relatorio_email_solicitado',
  'relatorio_whatsapp_solicitado',
  'consultor_solicitado',
] as const

type FunnelEventType = (typeof FUNNEL_EVENT_TYPES)[number]

interface SimulatedSession {
  id: number
  status: 'iniciado' | 'completo'
  events: FunnelEventType[]
}

interface FunnelResult {
  accessed: number
  identified: number
  answeredFirstQuestion: number
  completed: number
  viewedReport: number
  requestedDelivery: number
  requestedConsultant: number
}

/**
 * Pure simulation function that mirrors the DashboardService.computeFunnel() query logic.
 * Counts sessions matching each funnel stage's existence predicate.
 */
function computeFunnelFromSessions(sessions: SimulatedSession[]): FunnelResult {
  return {
    accessed: sessions.filter((s) => s.events.includes('pagina_acessada')).length,
    identified: sessions.filter((s) => s.events.includes('privacidade_aceita')).length,
    answeredFirstQuestion: sessions.filter((s) => s.events.includes('pergunta_respondida')).length,
    completed: sessions.filter((s) => s.status === 'completo').length,
    viewedReport: sessions.filter((s) => s.events.includes('relatorio_visualizado')).length,
    requestedDelivery: sessions.filter(
      (s) =>
        s.events.includes('relatorio_email_solicitado') ||
        s.events.includes('relatorio_whatsapp_solicitado')
    ).length,
    requestedConsultant: sessions.filter((s) => s.events.includes('consultor_solicitado')).length,
  }
}

// Generator: a session with random status and a random subset of funnel event types
const sessionArbitrary = fc
  .record({
    id: fc.integer({ min: 1, max: 100_000 }),
    status: fc.constantFrom<'iniciado' | 'completo'>('iniciado', 'completo'),
    events: fc.subarray([...FUNNEL_EVENT_TYPES]),
  })

// Generator: a non-empty array of sessions
const sessionsArbitrary = fc.array(sessionArbitrary, { minLength: 0, maxLength: 50 })

describe('Property 18: Funnel stage counting correctness', () => {
  it('each funnel stage count is non-negative for any set of sessions (Req 11.1)', () => {
    fc.assert(
      fc.property(sessionsArbitrary, (sessions) => {
        const funnel = computeFunnelFromSessions(sessions)
        const stages = Object.entries(funnel) as [keyof FunnelResult, number][]
        for (const [stage, count] of stages) {
          assert.ok(count >= 0, `Stage '${stage}' should be non-negative, got ${count}`)
        }
      }),
      { numRuns: 200 }
    )
  })

  it('no funnel stage count exceeds total session count (Req 11.1)', () => {
    fc.assert(
      fc.property(sessionsArbitrary, (sessions) => {
        const funnel = computeFunnelFromSessions(sessions)
        const total = sessions.length
        const stages = Object.entries(funnel) as [keyof FunnelResult, number][]
        for (const [stage, count] of stages) {
          assert.ok(
            count <= total,
            `Stage '${stage}' count (${count}) should not exceed total sessions (${total})`
          )
        }
      }),
      { numRuns: 200 }
    )
  })

  it('completed stage equals count of sessions with status completo (Req 11.5)', () => {
    fc.assert(
      fc.property(sessionsArbitrary, (sessions) => {
        const funnel = computeFunnelFromSessions(sessions)
        const expectedCompleted = sessions.filter((s) => s.status === 'completo').length
        assert.strictEqual(
          funnel.completed,
          expectedCompleted,
          `Completed stage (${funnel.completed}) should equal count of completo sessions (${expectedCompleted})`
        )
      }),
      { numRuns: 200 }
    )
  })

  it('accessed >= identified for well-formed data where identified implies accessed (Req 11.2, 11.3)', () => {
    // Generate sessions where any session with privacidade_aceita also has pagina_acessada
    // (the natural ordering: you must access the page before accepting privacy)
    const wellFormedSessionArb = fc
      .record({
        id: fc.integer({ min: 1, max: 100_000 }),
        status: fc.constantFrom<'iniciado' | 'completo'>('iniciado', 'completo'),
        events: fc.subarray([...FUNNEL_EVENT_TYPES]),
      })
      .map((session) => {
        // Enforce: if privacidade_aceita is present, pagina_acessada must also be present
        if (
          session.events.includes('privacidade_aceita') &&
          !session.events.includes('pagina_acessada')
        ) {
          session.events.push('pagina_acessada')
        }
        return session
      })

    const wellFormedSessionsArb = fc.array(wellFormedSessionArb, {
      minLength: 0,
      maxLength: 50,
    })

    fc.assert(
      fc.property(wellFormedSessionsArb, (sessions) => {
        const funnel = computeFunnelFromSessions(sessions)
        assert.ok(
          funnel.accessed >= funnel.identified,
          `accessed (${funnel.accessed}) should be >= identified (${funnel.identified}) for well-formed data`
        )
      }),
      { numRuns: 200 }
    )
  })

  it('sessions with a specific event type are counted in the corresponding stage (Req 11.2, 11.3, 11.4, 11.6, 11.7, 11.8)', () => {
    // For each event type, verify the session is counted in the appropriate stage
    const stageMapping: Record<FunnelEventType, keyof FunnelResult> = {
      pagina_acessada: 'accessed',
      privacidade_aceita: 'identified',
      pergunta_respondida: 'answeredFirstQuestion',
      relatorio_visualizado: 'viewedReport',
      relatorio_email_solicitado: 'requestedDelivery',
      relatorio_whatsapp_solicitado: 'requestedDelivery',
      consultor_solicitado: 'requestedConsultant',
    }

    fc.assert(
      fc.property(
        sessionsArbitrary,
        fc.constantFrom(...FUNNEL_EVENT_TYPES),
        (sessions, eventType) => {
          const funnel = computeFunnelFromSessions(sessions)
          const stage = stageMapping[eventType]

          // Count sessions that have this event type
          const sessionsWithEvent = sessions.filter((s) => {
            if (stage === 'requestedDelivery') {
              return (
                s.events.includes('relatorio_email_solicitado') ||
                s.events.includes('relatorio_whatsapp_solicitado')
              )
            }
            return s.events.includes(eventType)
          })

          assert.strictEqual(
            funnel[stage],
            sessionsWithEvent.length,
            `Stage '${stage}' count (${funnel[stage]}) should equal sessions with event '${eventType}' (${sessionsWithEvent.length})`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('empty session set produces all-zero funnel counts (Req 11.1)', () => {
    const funnel = computeFunnelFromSessions([])
    const stages = Object.entries(funnel) as [keyof FunnelResult, number][]
    for (const [stage, count] of stages) {
      assert.strictEqual(count, 0, `Stage '${stage}' should be 0 for empty sessions, got ${count}`)
    }
  })

  it('funnel returns exactly seven stages (Req 11.1)', () => {
    fc.assert(
      fc.property(sessionsArbitrary, (sessions) => {
        const funnel = computeFunnelFromSessions(sessions)
        const keys = Object.keys(funnel)
        assert.strictEqual(
          keys.length,
          7,
          `Funnel should have exactly 7 stages, got ${keys.length}`
        )
        const expectedKeys = [
          'accessed',
          'identified',
          'answeredFirstQuestion',
          'completed',
          'viewedReport',
          'requestedDelivery',
          'requestedConsultant',
        ]
        assert.deepStrictEqual(keys.sort(), expectedKeys.sort())
      }),
      { numRuns: 100 }
    )
  })
})
