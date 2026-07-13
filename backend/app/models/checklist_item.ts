import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Survey from './survey.js'
import type { ChecklistGrupo } from './types.js'

export default class ChecklistItem extends BaseModel {
  static table = 'checklist_items'

  @column({ isPrimary: true })
  declare id: number

  @column({ columnName: 'survey_id' })
  declare surveyId: number

  @column()
  declare nome: string

  @column()
  declare grupo: ChecklistGrupo

  @belongsTo(() => Survey, { foreignKey: 'surveyId' })
  declare survey: BelongsTo<typeof Survey>
}
