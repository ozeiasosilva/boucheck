import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import { createAdminValidator, resetPasswordValidator } from '../validators/admin_user_validators.js'
import adminUserService, {
  NotFoundError,
  DuplicateEmailError,
  LastActiveAdminError,
  PasswordPolicyError,
} from '../services/admin_user_service.js'

const updateAdminValidator = vine.compile(vine.object({ ativo: vine.boolean() }))

export default class AdminUsersController {
  /**
   * GET /api/admin/admin-users
   *
   * Returns the list of all admin users with the AdminUserView projection.
   * Req 10.1, 10.3 — password_hash is never included.
   */
  async index({ response }: HttpContext) {
    const users = await adminUserService.list()
    return response.ok(users)
  }

  /**
   * GET /api/admin/admin-users/:id
   *
   * Returns a single admin user by id.
   * Req 10.2, 10.3, 10.4 — 404 for unknown ids.
   */
  async show({ params, response }: HttpContext) {
    try {
      const user = await adminUserService.get(Number(params.id))
      return response.ok(user)
    } catch (error) {
      if (error instanceof NotFoundError) {
        return response.notFound({ error: 'Not found' })
      }
      throw error
    }
  }

  /**
   * POST /api/admin/admin-users
   *
   * Creates a new admin user. If password is provided, uses it directly.
   * Otherwise generates a temporary password emailed to them.
   * Req 6.1, 6.3 — 201 on success, 422 on duplicate email or policy violation.
   */
  async store({ request, response }: HttpContext) {
    const { nome, email, password } = await request.validateUsing(createAdminValidator)

    try {
      const user = await adminUserService.create(nome, email, password)
      return response.created(user)
    } catch (error) {
      if (error instanceof DuplicateEmailError) {
        return response.unprocessableEntity({ error: 'Email already in use' })
      }
      if (error instanceof PasswordPolicyError) {
        return response.unprocessableEntity({
          error: 'A senha não atende à política de segurança',
          unmet: error.unmet,
        })
      }
      throw error
    }
  }

  /**
   * PUT /api/admin/admin-users/:id
   *
   * (De)activates an admin user.
   * Req 7.1, 7.3, 7.4 — 200 on success, 404 for unknown ids, 422 for last-active guard.
   */
  async update({ params, request, response }: HttpContext) {
    const { ativo } = await request.validateUsing(updateAdminValidator)

    try {
      const user = await adminUserService.setActive(Number(params.id), ativo)
      return response.ok(user)
    } catch (error) {
      if (error instanceof NotFoundError) {
        return response.notFound({ error: 'Not found' })
      }
      if (error instanceof LastActiveAdminError) {
        return response.unprocessableEntity({
          error: 'Cannot deactivate the last active administrator',
        })
      }
      throw error
    }
  }

  /**
   * PUT /api/admin/admin-users/:id/password
   *
   * Resets an admin user's password (admin action, no current password required).
   * 200 on success, 404 for unknown ids, 422 if policy not met.
   */
  async resetPassword({ params, request, response }: HttpContext) {
    const { password } = await request.validateUsing(resetPasswordValidator)

    try {
      const user = await adminUserService.resetPassword(Number(params.id), password)
      return response.ok(user)
    } catch (error) {
      if (error instanceof NotFoundError) {
        return response.notFound({ error: 'Not found' })
      }
      if (error instanceof PasswordPolicyError) {
        return response.unprocessableEntity({
          error: 'A senha não atende à política de segurança',
          unmet: error.unmet,
        })
      }
      throw error
    }
  }
}
