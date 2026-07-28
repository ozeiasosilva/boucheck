import type { HttpContext } from '@adonisjs/core/http'
import Setting from '#models/setting'
import { validateSettingsBody } from '#validators/setting_validators'

export default class SettingsController {
  /**
   * GET /api/admin/settings
   *
   * Returns all settings as an array of { key, value, updatedAt }.
   * Requirements: 5.2
   */
  async index({ response }: HttpContext) {
    const settings = await Setting.all()
    return response.ok(settings)
  }

  /**
   * PUT /api/admin/settings
   *
   * Upserts key-value pairs from the request body.
   * Body format: { "key_name": "value" | null }
   * Keys must match ^[a-z_]+$, values must be string or null.
   * Requirements: 5.2, 5.4
   */
  async update({ request, response }: HttpContext) {
    const body = request.body()
    const { valid, errors, entries } = validateSettingsBody(body)

    if (!valid) {
      return response.unprocessableEntity({ errors })
    }

    for (const { key, value } of entries) {
      await Setting.updateOrCreate({ key }, { value })
    }

    return response.ok({ message: 'ok' })
  }
}
