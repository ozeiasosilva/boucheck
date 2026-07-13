import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import QuestionOption from './question_option.js'
import Question from './question.js'

export default class QuestionRule extends BaseModel {
  static table = 'question_rules'

  @column({ isPrimary: true })
  declare id: number

  @column({ columnName: 'question_option_id' })
  declare questionOptionId: number

  @column({ columnName: 'next_question_id' })
  declare nextQuestionId: number | null

  @column()
  declare finalizar: boolean

  @column()
  declare priority: number

  @belongsTo(() => QuestionOption, { foreignKey: 'questionOptionId' })
  declare questionOption: BelongsTo<typeof QuestionOption>

  @belongsTo(() => Question, { foreignKey: 'nextQuestionId' })
  declare nextQuestion: BelongsTo<typeof Question>
}
