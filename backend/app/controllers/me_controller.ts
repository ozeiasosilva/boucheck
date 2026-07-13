import type { HttpContext } from '@adonisjs/core/http'
import { changePasswordValidator } from '../validators/admin_user_validators.js'
import adminUserService, {
  CurrentPasswordError,
  PasswordPolicyError,
} from '../services/admin_user_service.js'

export default class MeController {
  /**
   * GET /api/admin/me
   *
   * Returns the authenticated admin user's profile including theme preference.
   */
  async show({ response, auth }: HttpContext) {
    const user = auth.user!
    return response.ok({
      id: user.id,
      nome: user.nome,
      email: user.email,
      role: user.role,
      tema_preferido: user.temaPreferido ?? 'claro',
    })
  }

  /**
   * PUT /api/admin/me/tema
   *
   * Updates the authenticated user's theme preference (claro | escuro).
   */
  async setTheme({ request, response, auth }: HttpContext) {
    const { tema } = request.only(['tema'])

    if (!tema || !['claro', 'escuro'].includes(tema)) {
      return response.unprocessableEntity({ error: 'Tema inválido. Use "claro" ou "escuro".' })
    }

    const user = auth.user!
    user.temaPreferido = tema
    await user.save()

    return response.ok({ tema_preferido: user.temaPreferido })
  }

  /**
   * PUT /api/admin/me/password
   *
   * Validates current + new password via VineJS, delegates to
   * AdminUserService.changeOwnPassword.
   * - 204 (no content) on success (Req 8.1; clears must_change_password — Req 6.4)
   * - 422 { error: "Current password incorrect" } (Req 8.2)
   * - 422 { errors: [{ field, unmet }] } (Req 8.3)
   */
  async changePassword({ request, response, auth }: HttpContext) {
    const { current_password, new_password } = await request.validateUsing(changePasswordValidator)
    const user = auth.user!

    try {
      await adminUserService.changeOwnPassword(user, current_password, new_password)
      return response.noContent()
    } catch (error) {
      if (error instanceof CurrentPasswordError) {
        return response.unprocessableEntity({ error: 'Current password incorrect' })
      }
      if (error instanceof PasswordPolicyError) {
        return response.unprocessableEntity({
          errors: [{ field: 'new_password', unmet: error.unmet }],
        })
      }
      throw error
    }
  }
}
