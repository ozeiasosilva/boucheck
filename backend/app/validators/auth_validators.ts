import vine from '@vinejs/vine'

/**
 * Shared password rule (Req 4.2):
 * - At least 10 characters
 * - At least one letter (A-Z or a-z)
 * - At least one number (0-9)
 */
export const passwordRule = vine.string().minLength(10).regex(/[A-Za-z]/).regex(/[0-9]/)

/**
 * POST /api/admin/auth/login
 */
export const loginValidator = vine.compile(
  vine.object({
    email: vine.string().email(),
    password: vine.string(),
  })
)

/**
 * POST /api/admin/auth/forgot
 */
export const forgotValidator = vine.compile(
  vine.object({
    email: vine.string().email(),
  })
)

/**
 * POST /api/admin/auth/reset
 */
export const resetValidator = vine.compile(
  vine.object({
    token: vine.string(),
    password: passwordRule,
  })
)
