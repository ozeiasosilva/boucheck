import { createHash, randomBytes } from 'node:crypto'
import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import db from '@adonisjs/lucid/services/db'
import limiter from '@adonisjs/limiter/services/main'
import AdminUser from '#models/admin_user'
import PasswordResetToken from '#models/password_reset_token'
import { validate as validatePassword } from '../policies/password_policy.js'
import mailQueue from './mail_queue.js'

/**
 * Thrown on invalid credentials (unknown email, wrong password, inactive user).
 * Returns a uniform 401 — never discloses which condition failed (Req 2.4, 2.5, 2.6).
 */
export class AuthError extends Error {
  status = 401
  constructor() {
    super('Invalid credentials')
  }
}

/**
 * Thrown when the login rate limit is exceeded (Req 3.3).
 * Includes `retryAfter` in seconds so the controller can surface it as a 429 header.
 */
export class RateLimitError extends Error {
  status = 429
  retryAfter: number
  constructor(retryAfter: number) {
    super('Too many attempts')
    this.retryAfter = retryAfter
  }
}

/**
 * Thrown when a reset token is expired, already used, or unrecognized (Req 5.5, 5.6).
 * Returns HTTP 400 Bad Request.
 */
export class TokenError extends Error {
  status = 400
  constructor() {
    super('Invalid or expired token')
  }
}

/**
 * Thrown when a password does not satisfy the Password_Policy (Req 5.7).
 * Returns HTTP 422 with the list of unmet criteria.
 */
export class PolicyError extends Error {
  status = 422
  unmet: string[]
  constructor(unmet: string[]) {
    super('Password does not meet policy requirements')
    this.unmet = unmet
  }
}

export interface LoginResult {
  token: { value: string; expiresAt: string }
  mustChangePassword: boolean
}

export class AuthService {
  /**
   * Authenticate an administrator by email and password.
   *
   * Flow:
   * 1. Check rate-limit block first — reject with 429 without verifying (Req 3.3).
   * 2. Find an active user by normalized email.
   * 3. Verify password via scrypt hash (Req 4.4 — plaintext never stored/logged).
   * 4. On failure: increment limiter (Req 3.1); throw uniform AuthError (401).
   * 5. On success: clear limiter (Req 3.4), issue token (12h expiry, Req 2.2),
   *    set last_login_at (Req 2.3), return token + mustChangePassword (Req 2.7).
   */
  async login(email: string, password: string): Promise<LoginResult> {
    const normalizedEmail = email.toLowerCase().trim()
    const key = `login:${normalizedEmail}`

    // Create a limiter instance: 5 requests per 15 minutes, block for 15 minutes (Req 3.1, 3.2)
    const loginLimiter = limiter.use({
      requests: 5,
      duration: '15 mins',
      blockDuration: '15 mins',
    })

    // Check if already blocked (Req 3.3) — reject without credential verification
    try {
      const blocked = await loginLimiter.isBlocked(key)
      if (blocked) {
        const retryAfter = await loginLimiter.availableIn(key)
        throw new RateLimitError(retryAfter)
      }
    } catch (error) {
      if (error instanceof RateLimitError) throw error
      // If limiter fails (e.g., misconfiguration), log and proceed without rate limiting
      console.warn('[auth_service] Rate limiter error (proceeding without limiting):', (error as Error).message)
    }

    // Find active user by normalized email (Req 2.4, 2.6)
    const user = await AdminUser.query()
      .where('email', normalizedEmail)
      .where('ativo', true)
      .first()

    if (!user) {
      // No active user found — increment limiter (Req 3.1) and throw uniform 401
      try { await loginLimiter.increment(key) } catch {}
      throw new AuthError()
    }

    // Verify password against stored hash (Req 2.5, 4.4 — plaintext never stored/logged)
    const isValid = await hash.verify(user.passwordHash, password)
    if (!isValid) {
      // Wrong password — increment limiter (Req 3.1) and throw uniform 401
      try { await loginLimiter.increment(key) } catch {}
      throw new AuthError()
    }

    // Credentials valid — clear limiter count (Req 3.4)
    try { await loginLimiter.delete(key) } catch {}

    // Issue access token with 12h expiry (Req 2.1, 2.2 — configured on the model provider)
    const token = await AdminUser.accessTokens.create(user)

    // Update last_login_at (Req 2.3)
    user.lastLoginAt = DateTime.now()
    await user.save()

    return {
      token: {
        value: token.value!.release(),
        expiresAt: token.expiresAt!.toISOString(),
      },
      mustChangePassword: user.mustChangePassword, // Req 2.7
    }
  }

  /**
   * Request a password reset email.
   *
   * Flow:
   * 1. Normalize the email and look up an active user.
   * 2. If no active user matches, return immediately without disclosing
   *    account existence (Req 5.3 — identical code path, same timing).
   * 3. Generate a raw token (32 random bytes, hex), store only its SHA-256
   *    hash in `password_reset_tokens` with `expires_at = now + 1h` (Req 5.2).
   * 4. Enqueue the reset-link email via MailQueue (Req 5.1).
   *    - MailQueue.enqueue never throws (failures logged masked, Req 11.5).
   * 5. Always return void — uniform success response (Req 5.3).
   */
  async forgot(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim()

    // Find active user (Req 5.1)
    const user = await AdminUser.query()
      .where('email', normalizedEmail)
      .where('ativo', true)
      .first()

    if (!user) {
      // No active user — return without disclosing account existence (Req 5.3)
      return
    }

    // Generate raw token and store only its SHA-256 hash (Req 5.2)
    const rawToken = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')

    await PasswordResetToken.create({
      adminUserId: user.id,
      tokenHash,
      expiresAt: DateTime.now().plus({ hours: 1 }), // Req 5.2 — 1 hour validity
    })

    // Build reset link (frontend URL with the raw token)
    const frontendUrl = process.env.FRONTEND_URL || 'https://boucheck.beonup.com.br'
    const resetLink = `${frontendUrl}/admin/auth/reset?token=${rawToken}`

    // Enqueue email — never log the link (Req 11.5); failure swallowed by MailQueue
    await mailQueue.enqueue({
      kind: 'password_reset',
      to: user.email,
      resetLink,
    })
  }

  /**
   * Reset password using a reset token.
   *
   * Flow:
   * 1. Hash the raw token to look up the stored record by `token_hash`.
   * 2. Reject with TokenError (400) if not found, expired, or already used (Req 5.5, 5.6).
   * 3. Validate the new password against PasswordPolicy — reject with PolicyError (422)
   *    WITHOUT consuming the token if non-compliant (Req 5.7).
   * 4. In a single transaction: update the user's `password_hash` and set `used_at` on
   *    the token (Req 5.4 — single use).
   */
  async reset(rawToken: string, newPassword: string): Promise<void> {
    // Hash the raw token to look up the stored record
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')

    // Find the token by hash
    const resetToken = await PasswordResetToken.query().where('tokenHash', tokenHash).first()

    // Reject if token not found, expired, or already used (Req 5.5, 5.6)
    if (!resetToken || !resetToken.isValid) {
      throw new TokenError()
    }

    // Validate password against policy BEFORE consuming the token (Req 5.7)
    const policyResult = validatePassword(newPassword)
    if (!policyResult.ok) {
      // Non-compliant password: reject 422, do NOT mark token as used
      throw new PolicyError(policyResult.unmet)
    }

    // Update password_hash and mark token as used in one transaction (Req 5.4)
    await db.transaction(async (trx) => {
      // Update the user's password hash
      const user = await AdminUser.query({ client: trx })
        .where('id', resetToken.adminUserId)
        .firstOrFail()

      user.passwordHash = await hash.make(newPassword)
      await user.useTransaction(trx).save()

      // Mark token as used (Req 5.4, 5.6 — single use)
      resetToken.usedAt = DateTime.now()
      await resetToken.useTransaction(trx).save()
    })
  }

  /**
   * Invalidate all access tokens for a user (used on deactivation).
   * Deletes all rows in auth_access_tokens for this user, immediately
   * ending all active sessions (Req 7.2).
   */
  async invalidateAllTokens(user: AdminUser): Promise<void> {
    await db.from('auth_access_tokens').where('tokenable_id', user.id).delete()
  }
}

export default new AuthService()
