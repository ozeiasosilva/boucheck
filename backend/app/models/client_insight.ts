import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Response from './response.js'
import AdminUser from './admin_user.js'

export default class ClientInsight extends BaseModel {
  static table = 'client_insights'

  @column({ isPrimary: true })
  declare id: number

  @column({ columnName: 'response_id' })
  declare responseId: string

  @column({ columnName: 'admin_user_id' })
  declare adminUserId: number

  @column()
  declare conteudo: string

  @column({ columnName: 'tokens_input' })
  declare tokensInput: number | null

  @column({ columnName: 'tokens_output' })
  declare tokensOutput: number | null

  @column.dateTime({ autoCreate: true, columnName: 'created_at' })
  declare createdAt: DateTime

  @belongsTo(() => Response, { foreignKey: 'responseId' })
  declare response: BelongsTo<typeof Response>

  @belongsTo(() => AdminUser, { foreignKey: 'adminUserId' })
  declare adminUser: BelongsTo<typeof AdminUser>
}
