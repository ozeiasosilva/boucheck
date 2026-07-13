import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  WhatsAppDeliveryService,
  type WhatsAppCloudApiClient,
  type WhatsAppMessagePayload,
  type WhatsAppApiResponse,
} from '../../app/services/whatsapp_delivery_service.js'

/**
 * Unit tests for WhatsAppDeliveryService.deliver
 * Validates: Requirement 14.2 — approved template call containing the
 * Public_Report_Endpoint link.
 */

/**
 * Spy-based mock that captures the payload sent to the WhatsApp Cloud API
 * and resolves successfully.
 */
function createMockClient(): WhatsAppCloudApiClient & {
  calls: WhatsAppMessagePayload[]
} {
  const calls: WhatsAppMessagePayload[] = []
  return {
    calls,
    async sendMessage(payload: WhatsAppMessagePayload): Promise<WhatsAppApiResponse> {
      calls.push(payload)
      return { messages: [{ id: 'wamid.test123' }] }
    },
  }
}

/**
 * Mock that rejects with an error, simulating a Cloud API failure.
 */
function createFailingClient(errorMessage: string): WhatsAppCloudApiClient {
  return {
    async sendMessage(): Promise<WhatsAppApiResponse> {
      throw new Error(errorMessage)
    },
  }
}

describe('WhatsAppDeliveryService', () => {
  const toPhone = '5511999998888'
  const reportUrl = 'https://app.boucheck.com/r/abc123token'

  describe('deliver() sends an approved template message', () => {
    it('calls the client with messaging_product = whatsapp', async () => {
      const client = createMockClient()
      const service = new WhatsAppDeliveryService(client)

      await service.deliver(toPhone, reportUrl)

      assert.strictEqual(client.calls.length, 1)
      assert.strictEqual(client.calls[0].messaging_product, 'whatsapp')
    })

    it('sends to the correct phone number', async () => {
      const client = createMockClient()
      const service = new WhatsAppDeliveryService(client)

      await service.deliver(toPhone, reportUrl)

      assert.strictEqual(client.calls[0].to, toPhone)
    })

    it('uses message type template', async () => {
      const client = createMockClient()
      const service = new WhatsAppDeliveryService(client)

      await service.deliver(toPhone, reportUrl)

      assert.strictEqual(client.calls[0].type, 'template')
    })

    it('includes the report URL as a body parameter in the template', async () => {
      const client = createMockClient()
      const service = new WhatsAppDeliveryService(client)

      await service.deliver(toPhone, reportUrl)

      const template = client.calls[0].template
      assert.ok(template.components, 'template should have components')
      assert.strictEqual(template.components!.length, 1)

      const bodyComponent = template.components![0]
      assert.strictEqual(bodyComponent.type, 'body')
      assert.strictEqual(bodyComponent.parameters.length, 1)
      assert.strictEqual(bodyComponent.parameters[0].type, 'text')
      assert.strictEqual(bodyComponent.parameters[0].text, reportUrl)
    })

    it('uses the default template name and pt_BR language', async () => {
      const client = createMockClient()
      const service = new WhatsAppDeliveryService(client)

      await service.deliver(toPhone, reportUrl)

      const template = client.calls[0].template
      assert.strictEqual(template.name, 'report_delivery')
      assert.strictEqual(template.language.code, 'pt_BR')
    })

    it('contains the exact Public_Report_Endpoint URL for the given token', async () => {
      const client = createMockClient()
      const service = new WhatsAppDeliveryService(client)
      const specificUrl = 'https://app.boucheck.com/r/xyz789specific'

      await service.deliver(toPhone, specificUrl)

      const bodyParams = client.calls[0].template.components![0].parameters
      assert.strictEqual(bodyParams[0].text, specificUrl)
    })
  })

  describe('deliver() propagates errors for retry handling', () => {
    it('throws when the Cloud API client rejects', async () => {
      const client = createFailingClient('WhatsApp Cloud API error: rate limited (status 429)')
      const service = new WhatsAppDeliveryService(client)

      await assert.rejects(
        () => service.deliver(toPhone, reportUrl),
        (err: Error) => {
          assert.ok(err.message.includes('rate limited'))
          return true
        }
      )
    })

    it('does not swallow network failures', async () => {
      const client = createFailingClient('fetch failed: ECONNREFUSED')
      const service = new WhatsAppDeliveryService(client)

      await assert.rejects(() => service.deliver(toPhone, reportUrl))
    })
  })

  describe('deliver() handles various phone formats', () => {
    it('passes E.164 phone format as-is', async () => {
      const client = createMockClient()
      const service = new WhatsAppDeliveryService(client)

      await service.deliver('5521987654321', reportUrl)

      assert.strictEqual(client.calls[0].to, '5521987654321')
    })
  })
})
