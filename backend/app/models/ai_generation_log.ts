import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import AdminUser from './admin_user.js'
import Survey from './survey.js'

export default class AiGenerationLog extends BaseModel {
  static table = 'ai_generation_logs'

  @column({ isPrimary: true })
  declare id: number

  @column({ columnName: 'admin_user_id' })
  declare adminUserId: number

  @column({ columnName: 'survey_id' })
  declare surveyId: number | null

  @column()
  declare prompt: string

  @column({
    prepare: (value: Record<string, unknown> | null) => (value ? JSON.stringify(value) : null),
    consume: (value: unknown) =>
      value == null ? null : typeof value === 'string' ? JSON.parse(value) : value,
  })
  declare resultado: Record<string, unknown> | null

  @column({ columnName: 'tokens_input' })
  declare tokensInput: number | null

  @column({ columnName: 'tokens_output' })
  declare tokensOutput: number | null

  @column()
  declare sucesso: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @belongsTo(() => AdminUser, { foreignKey: 'adminUserId' })
  declare adminUser: BelongsTo<typeof AdminUser>

  @belongsTo(() => Survey, { foreignKey: 'surveyId' })
  declare survey: BelongsTo<typeof Survey>
}
