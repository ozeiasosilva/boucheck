/**
 * WhatsApp Cloud API delivery service.
 *
 * Sends a pre-approved template message containing the Report's Public_Report_Endpoint
 * link to a respondent's phone number via Meta's WhatsApp Cloud API.
 *
 * Requirement 14.2: Use an approved WhatsApp Cloud API template containing the
 * Report's Public_Report_Endpoint link.
 */

/**
 * Injectable interface for the HTTP client that calls Meta's WhatsApp Cloud API.
 * Allows the real `fetch`-based implementation to be swapped for a test double.
 */
export interface WhatsAppCloudApiClient {
  /**
   * Send a request to the WhatsApp Cloud API messages endpoint.
   *
   * @param payload - The full JSON body per Meta's Messages API spec.
   * @returns The parsed JSON response from the API.
   * @throws On non-2xx responses or network failures.
   */
  sendMessage(payload: WhatsAppMessagePayload): Promise<WhatsAppApiResponse>
}

export interface WhatsAppMessagePayload {
  messaging_product: 'whatsapp'
  to: string
  type: 'template'
  template: {
    name: string
    language: { code: string }
    components?: Array<{
      type: 'body' | 'header' | 'button'
      parameters: Array<{ type: 'text'; text: string }>
    }>
  }
}

export interface WhatsAppApiResponse {
  messages?: Array<{ id: string }>
  error?: { message: string; code: number }
}

/**
 * Default HTTP-based WhatsApp Cloud API client using `fetch`.
 *
 * Configuration is sourced from environment variables:
 * - WHATSAPP_PHONE_NUMBER_ID: The phone number ID registered in Meta Business Manager.
 * - WHATSAPP_ACCESS_TOKEN: Permanent or system-user access token for the Cloud API.
 * - WHATSAPP_API_VERSION: Graph API version (defaults to `v18.0`).
 */
export class DefaultWhatsAppCloudApiClient implements WhatsAppCloudApiClient {
  private baseUrl: string
  private accessToken: string

  constructor(config?: { phoneNumberId?: string; accessToken?: string; apiVersion?: string }) {
    const phoneNumberId = config?.phoneNumberId ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? ''
    const apiVersion = config?.apiVersion ?? process.env.WHATSAPP_API_VERSION ?? 'v18.0'
    this.accessToken = config?.accessToken ?? process.env.WHATSAPP_ACCESS_TOKEN ?? ''
    this.baseUrl = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`
  }

  async sendMessage(payload: WhatsAppMessagePayload): Promise<WhatsAppApiResponse> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const body = (await response.json()) as WhatsAppApiResponse

    if (!response.ok) {
      const errorMsg = body.error?.message ?? `HTTP ${response.status}`
      throw new Error(`WhatsApp Cloud API error: ${errorMsg} (status ${response.status})`)
    }

    return body
  }
}

/**
 * WhatsApp delivery service.
 *
 * Sends a report link to a respondent's phone number using an approved
 * WhatsApp Cloud API message template (Requirement 14.2).
 *
 * The template name is sourced from the WHATSAPP_TEMPLATE_NAME env var
 * (defaults to `report_delivery`). The template must be pre-approved in
 * Meta Business Manager and contain a body parameter slot for the report URL.
 */
export class WhatsAppDeliveryService {
  private templateName: string
  private templateLanguage: string

  constructor(private client: WhatsAppCloudApiClient) {
    this.templateName = process.env.WHATSAPP_TEMPLATE_NAME ?? 'report_delivery'
    this.templateLanguage = process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? 'pt_BR'
  }

  /**
   * Deliver the report link to the respondent via an approved WhatsApp template message.
   *
   * @param toPhone - The respondent's phone number (E.164 format without the leading `+`).
   * @param reportUrl - The full Public_Report_Endpoint URL (e.g. `https://app.boucheck.com/r/{token}`).
   * @throws On non-success responses from the WhatsApp Cloud API so that the
   *         failure handler can manage retries (Requirement 16).
   */
  async deliver(toPhone: string, reportUrl: string): Promise<void> {
    await this.client.sendMessage({
      messaging_product: 'whatsapp',
      to: toPhone,
      type: 'template',
      template: {
        name: this.templateName,
        language: { code: this.templateLanguage },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: reportUrl }],
          },
        ],
      },
    })
  }
}

/**
 * Default singleton instance backed by the real HTTP client.
 * In production, env vars are populated from Secrets Manager / SSM.
 */
export default new WhatsAppDeliveryService(new DefaultWhatsAppCloudApiClient())
