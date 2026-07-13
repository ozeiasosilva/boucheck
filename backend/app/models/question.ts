import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Survey from './survey.js'
import QuestionOption from './question_option.js'
import type { QuestionTipo } from './types.js'

export default class Question extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column({ columnName: 'survey_id' })
  declare surveyId: number

  @column({ columnName: 'survey_version' })
  declare surveyVersion: number

  @column()
  declare texto: string

  @column()
  declare descricao: string | null

  @column()
  declare tipo: QuestionTipo

  @column()
  declare obrigatoria: boolean

  @column()
  declare ordem: number

  @column()
  declare peso: number

  @column()
  declare dimensao: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Survey, { foreignKey: 'surveyId' })
  declare survey: BelongsTo<typeof Survey>

  @hasMany(() => QuestionOption, { foreignKey: 'questionId' })
  declare options: HasMany<typeof QuestionOption>
}
