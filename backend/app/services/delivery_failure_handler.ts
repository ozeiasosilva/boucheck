import ResponseEvent from '#models/response_event'

/**
 * Input for the shared delivery failure handler.
 */
export interface DeliveryFailureInput {
  responseId: string
  canal: 'email' | 'whatsapp'
  receiveCount: number
  err: unknown
}

/**
 * Shared handler invoked by Email_Delivery_Worker and WhatsApp_Delivery_Worker
 * on every delivery failure attempt.
 *
 * Behavior:
 * 1. Always emits a structured JSON log entry (Req 19.1).
 * 2. Always increments a per-channel failure metric (Req 19.2).
 * 3. If receiveCount < 3: returns silently (Req 16.1 — SQS redelivery handles retry).
 * 4. If receiveCount >= 3: idempotently writes a `relatorio_envio_falhou` response event
 *    keyed on (response_id, canal) so exactly one event exists per delivery failure episode
 *    (Req 16.2, 16.3).
 *
 * Requirements: 16.1, 16.2, 16.3, 19.1, 19.2
 */
export async function handleDeliveryFailure(input: DeliveryFailureInput): Promise<void> {
  const { responseId, canal, receiveCount, err } = input
  const errorMessage = err instanceof Error ? err.message : String(err)

  // Req 19.1 — structured JSON log entry per attempt with outcome
  const outcome = receiveCount >= 3 ? 'permanent_failure' : 'will_retry'
  console.error(
    JSON.stringify({
      event: 'delivery_attempt_failed',
      response_id: responseId,
      canal,
      receive_count: receiveCount,
      error: errorMessage,
      outcome,
    })
  )

  // Req 19.2 — per-channel failure metric increment
  // Uses EMF (Embedded Metric Format) for CloudWatch metric extraction from logs.
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: 'BouCheck/Delivery',
            Dimensions: [['Canal']],
            Metrics: [{ Name: 'DeliveryFailures', Unit: 'Count' }],
          },
        ],
      },
      Canal: canal,
      DeliveryFailures: 1,
    })
  )

  // Req 16.1 — below retry threshold, let SQS redeliver silently
  if (receiveCount < 3) {
    return
  }

  // Req 16.2, 16.3 — exactly one relatorio_envio_falhou per (response_id, canal)
  const alreadyLogged = await ResponseEvent.query()
    .where('response_id', responseId)
    .where('tipo', 'relatorio_envio_falhou')
    .whereRaw("payload->>'canal' = ?", [canal])
    .first()

  if (alreadyLogged) {
    return
  }

  try {
    await ResponseEvent.create({
      responseId,
      tipo: 'relatorio_envio_falhou',
      payload: { canal, motivo: errorMessage },
    })
  } catch (insertErr: unknown) {
    // If the response was deleted, the FK constraint will fail.
    // Log and move on — there's nothing to record the event against.
    const msg = insertErr instanceof Error ? insertErr.message : String(insertErr)
    if (msg.includes('response_events_response_id_foreign')) {
      console.error(
        JSON.stringify({
          event: 'delivery_failure_event_skipped',
          response_id: responseId,
          canal,
          reason: 'response_deleted',
        })
      )
      return
    }
    throw insertErr
  }
}
