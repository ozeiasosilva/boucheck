import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Survey from './survey.js'
import AdminUser from './admin_user.js'

export default class SurveyInsight extends BaseModel {
  static table = 'survey_insights'

  @column({ isPrimary: true })
  declare id: number

  @column({ columnName: 'survey_id' })
  declare surveyId: number

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

  @belongsTo(() => Survey, { foreignKey: 'surveyId' })
  declare survey: BelongsTo<typeof Survey>

  @belongsTo(() => AdminUser, { foreignKey: 'adminUserId' })
  declare adminUser: BelongsTo<typeof AdminUser>
}
