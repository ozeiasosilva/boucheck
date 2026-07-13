import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'

export default class AdminUser extends BaseModel {
  static table = 'admin_users'

  static accessTokens = DbAccessTokensProvider.forModel(AdminUser, {
    expiresIn: '12 hours',
    table: 'auth_access_tokens',
  })

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare nome: string

  @column()
  declare email: string

  @column({ columnName: 'password_hash', serializeAs: null })
  declare passwordHash: string

  @column()
  declare role: string

  @column()
  declare ativo: boolean

  @column({ columnName: 'must_change_password' })
  declare mustChangePassword: boolean

  @column({ columnName: 'tema_preferido' })
  declare temaPreferido: string

  @column.dateTime({ columnName: 'last_login_at' })
  declare lastLoginAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
