import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import AdminUser from './admin_user.js'

export type AgentType = 'survey_agent' | 'client_agent'

export default class AiPromptConfig extends BaseModel {
  static table = 'ai_prompt_configs'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare tipo: AgentType

  @column()
  declare conteudo: string

  @column({ columnName: 'admin_user_id' })
  declare adminUserId: number

  @column.dateTime({ autoUpdate: true, columnName: 'updated_at' })
  declare updatedAt: DateTime

  @belongsTo(() => AdminUser, { foreignKey: 'adminUserId' })
  declare adminUser: BelongsTo<typeof AdminUser>
}
