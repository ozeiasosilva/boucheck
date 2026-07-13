import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Question from './question.js'
import QuestionRule from './question_rule.js'

export default class QuestionOption extends BaseModel {
  static table = 'question_options'

  @column({ isPrimary: true })
  declare id: number

  @column({ columnName: 'question_id' })
  declare questionId: number

  @column()
  declare texto: string

  @column()
  declare pontuacao: number

  @column()
  declare ordem: number

  @belongsTo(() => Question, { foreignKey: 'questionId' })
  declare question: BelongsTo<typeof Question>

  @hasMany(() => QuestionRule, { foreignKey: 'questionOptionId' })
  declare rules: HasMany<typeof QuestionRule>
}
