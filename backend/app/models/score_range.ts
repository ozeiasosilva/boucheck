import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Survey from './survey.js'

export default class ScoreRange extends BaseModel {
  static table = 'score_ranges'

  @column({ isPrimary: true })
  declare id: number

  @column({ columnName: 'survey_id' })
  declare surveyId: number

  @column()
  declare nome: string

  @column()
  declare min: number

  @column()
  declare max: number

  @column()
  declare descricao: string | null

  @column()
  declare cor: string | null

  @belongsTo(() => Survey, { foreignKey: 'surveyId' })
  declare survey: BelongsTo<typeof Survey>
}
