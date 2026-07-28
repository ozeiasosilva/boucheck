import type { HttpContext } from '@adonisjs/core/http'
import Setting from '#models/setting'

export default class SettingsController {
  /**
   * GET /api/public/settings/:key
   *
   * Returns the setting value for the given key.
   * If the key does not exist, returns { key, value: null } with HTTP 200.
   * Requirements: 5.1, 5.3, 5.5
   */
  async show({ params, response }: HttpContext) {
    const setting = await Setting.query().where('key', params.key).first()

    return response.ok({
      key: params.key,
      value: setting?.value ?? null,
    })
  }
}
