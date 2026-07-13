import type { HttpContext } from '@adonisjs/core/http'
import { loginValidator, forgotValidator, resetValidator } from '../validators/auth_validators.js'
import authService, {
  AuthError,
  RateLimitError,
  TokenError,
  PolicyError,
} from '../services/auth_service.js'

export default class AuthController {
  /**
   * POST /api/admin/auth/login
   *
   * Validates credentials via VineJS, delegates to AuthService.login,
   * and maps domain errors to uniform HTTP responses:
   * - 200 { token: { value, expiresAt }, mustChangePassword }
   * - 401 { error: "Invalid credentials" } (Req 2.4, 2.5, 2.6)
   * - 429 { error: "Too many attempts", retryAfter } (Req 3.3)
   */
  async login({ request, response }: HttpContext) {
    const { email, password } = await request.validateUsing(loginValidator)

    try {
      const result = await authService.login(email, password)
      return response.ok(result)
    } catch (error) {
      if (error instanceof RateLimitError) {
        return response.tooManyRequests({ error: 'Too many attempts', retryAfter: error.retryAfter })
      }
      if (error instanceof AuthError) {
        return response.unauthorized({ error: 'Invalid credentials' })
      }
      // Expose the actual error for debugging in development
      console.error('[LOGIN ERROR]', error)
      throw error
    }
  }

  /**
   * POST /api/admin/auth/forgot
   *
   * Validates email via VineJS, delegates to AuthService.forgot.
   * Always returns an identical 200 response regardless of whether
   * the account exists — non-disclosure of account existence (Req 5.3).
   */
  async forgot({ request, response }: HttpContext) {
    const { email } = await request.validateUsing(forgotValidator)
    await authService.forgot(email)
    return response.ok({ message: 'If the account exists, a reset email has been sent.' })
  }

  /**
   * POST /api/admin/auth/reset
   *
   * Validates token + new password via VineJS, delegates to AuthService.reset.
   * Maps domain errors:
   * - 200 { message: "Password updated." }
   * - 400 { error: "Invalid or expired token" } (Req 5.5, 5.6)
   * - 422 { errors: [{ field, unmet }] } (Req 5.7)
   */
  async reset({ request, response }: HttpContext) {
    const { token, password } = await request.validateUsing(resetValidator)

    try {
      await authService.reset(token, password)
      return response.ok({ message: 'Password updated.' })
    } catch (error) {
      if (error instanceof TokenError) {
        return response.badRequest({ error: 'Invalid or expired token' })
      }
      if (error instanceof PolicyError) {
        return response.unprocessableEntity({ errors: [{ field: 'password', unmet: error.unmet }] })
      }
      throw error
    }
  }
}
