import { BaseSeeder } from '@adonisjs/lucid/seeders'
import AdminUser from '#models/admin_user'

/**
 * Seeds a reserved "system" admin user row used as `ai_generation_logs.admin_user_id`
 * for respondent-triggered actions (e.g., Recommendation_Generator) that have no
 * real admin actor.
 *
 * This account is never used for login — the password is an unusable bcrypt hash
 * and `ativo` is set to `false`.
 *
 * Idempotent: uses `updateOrCreate` keyed on the email address.
 */
export default class SystemAdminUserSeeder extends BaseSeeder {
  async run() {
    await AdminUser.updateOrCreate(
      { email: 'system@boucheck.internal' },
      {
        nome: 'Sistema',
        // Unusable bcrypt hash — not a valid password encoding
        passwordHash: '$2a$10$SYSTEM.NOLOGIN.000000000000000000000000000000000000000',
        role: 'system',
        ativo: false,
        mustChangePassword: false,
      }
    )
  }
}
