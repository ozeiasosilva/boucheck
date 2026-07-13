import vine from '@vinejs/vine'
import { passwordRule } from './auth_validators.js'

/**
 * POST /api/admin/admin-users
 */
export const createAdminValidator = vine.compile(
  vine.object({
    nome: vine.string().trim().minLength(1),
    email: vine.string().email(),
    password: passwordRule.optional(),
  })
)

/**
 * PUT /api/admin/admin-users/:id/password
 */
export const resetPasswordValidator = vine.compile(
  vine.object({
    password: passwordRule,
  })
)

/**
 * PUT /api/admin/me/password
 */
export const changePasswordValidator = vine.compile(
  vine.object({
    current_password: vine.string(),
    new_password: passwordRule,
  })
)
