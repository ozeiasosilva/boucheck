import AdminUser from '#models/admin_user'
import hash from '@adonisjs/core/services/hash'
import db from '@adonisjs/lucid/services/db'
import { generateCompliant, validate as validatePassword } from '../policies/password_policy.js'
import authService from './auth_service.js'
import mailQueue from './mail_queue.js'

export class NotFoundError extends Error {
  status = 404
  constructor(message = 'Not found') {
    super(message)
  }
}

export class DuplicateEmailError extends Error {
  status = 422
  constructor() {
    super('Email already in use')
  }
}

export class LastActiveAdminError extends Error {
  status = 422
  constructor() {
    super('Cannot deactivate the last active administrator')
  }
}

export class CurrentPasswordError extends Error {
  status = 422
  constructor() {
    super('Current password incorrect')
  }
}

export class PasswordPolicyError extends Error {
  status = 422
  unmet: string[]
  constructor(unmet: string[]) {
    super('New password does not meet policy requirements')
    this.unmet = unmet
  }
}

export interface AdminUserView {
  id: number
  nome: string
  email: string
  role: string
  ativo: boolean
  last_login_at: string | null
}

function toView(user: AdminUser): AdminUserView {
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    role: user.role,
    ativo: user.ativo,
    last_login_at: user.lastLoginAt?.toISO() ?? null,
  }
}

export class AdminUserService {
  async list(): Promise<AdminUserView[]> {
    const users = await AdminUser.all()
    return users.map(toView)
  }

  async get(id: number): Promise<AdminUserView> {
    const user = await AdminUser.find(id)
    if (!user) throw new NotFoundError()
    return toView(user)
  }

  async create(nome: string, email: string, password?: string): Promise<AdminUserView> {
    const normalizedEmail = email.toLowerCase().trim()

    // Check for duplicate email (Req 6.3)
    const existing = await AdminUser.query().where('email', normalizedEmail).first()

    if (existing) {
      throw new DuplicateEmailError()
    }

    let finalPassword: string
    let mustChangePassword: boolean

    if (password) {
      // Admin provided a password explicitly — validate policy
      const policyResult = validatePassword(password)
      if (!policyResult.ok) {
        throw new PasswordPolicyError(policyResult.unmet)
      }
      finalPassword = password
      mustChangePassword = false
    } else {
      // Generate a compliant temporary password (Req 6.2)
      finalPassword = generateCompliant()
      mustChangePassword = true
    }

    // Hash the password (scrypt) — never store plaintext
    const passwordHash = await hash.make(finalPassword)

    // Create the new admin user (Req 6.1, 9.1)
    const user = await AdminUser.create({
      nome,
      email: normalizedEmail,
      passwordHash,
      role: 'admin',
      ativo: true,
      mustChangePassword,
    })

    // If using temp password, enqueue email (Req 6.2)
    if (!password) {
      await mailQueue.enqueue({
        kind: 'temp_password',
        to: normalizedEmail,
        nome,
        tempPassword: finalPassword,
      })
    }

    return toView(user)
  }

  async setActive(id: number, ativo: boolean): Promise<AdminUserView> {
    const user = await AdminUser.find(id)
    if (!user) throw new NotFoundError()

    if (!ativo) {
      // Deactivation — check last-active guard (Req 7.3)
      await db.transaction(async (trx) => {
        const activeCount = await AdminUser.query({ client: trx })
          .where('ativo', true)
          .count('* as total')

        const count = Number(activeCount[0].$extras.total)

        if (count <= 1 && user.ativo === true) {
          // This user is the last active admin — reject
          throw new LastActiveAdminError()
        }

        // Safe to deactivate (Req 7.1)
        user.ativo = false
        await user.useTransaction(trx).save()
      })

      // Revoke all tokens outside the transaction (Req 7.2)
      await authService.invalidateAllTokens(user)
    } else {
      // Reactivation (Req 7.4)
      user.ativo = true
      await user.save()
    }

    // Refresh to get latest state
    await user.refresh()
    return toView(user)
  }

  async resetPassword(id: number, newPassword: string): Promise<AdminUserView> {
    const user = await AdminUser.find(id)
    if (!user) throw new NotFoundError()

    // Enforce policy on new password
    const policyResult = validatePassword(newPassword)
    if (!policyResult.ok) {
      throw new PasswordPolicyError(policyResult.unmet)
    }

    user.passwordHash = await hash.make(newPassword)
    user.mustChangePassword = false
    await user.save()

    return toView(user)
  }

  async changeOwnPassword(user: AdminUser, current: string, next: string): Promise<void> {
    // Verify current password (Req 8.2)
    const isCurrentValid = await hash.verify(user.passwordHash, current)
    if (!isCurrentValid) {
      throw new CurrentPasswordError()
    }

    // Enforce policy on new password (Req 8.3)
    const policyResult = validatePassword(next)
    if (!policyResult.ok) {
      throw new PasswordPolicyError(policyResult.unmet)
    }

    // Update password_hash and clear must_change_password (Req 8.1, 6.4)
    user.passwordHash = await hash.make(next)
    user.mustChangePassword = false
    await user.save()
  }
}

export default new AdminUserService()
