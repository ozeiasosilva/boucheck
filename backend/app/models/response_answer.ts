import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Response from './response.js'
import Question from './question.js'
import QuestionOption from './question_option.js'

export default class ResponseAnswer extends BaseModel {
  static table = 'response_answers'

  @column({ isPrimary: true })
  declare id: number

  @column({ columnName: 'response_id' })
  declare responseId: string

  @column({ columnName: 'question_id' })
  declare questionId: number

  @column({ columnName: 'question_option_id' })
  declare questionOptionId: number | null

  @column({ columnName: 'texto_livre' })
  declare textoLivre: string | null

  @belongsTo(() => Response, { foreignKey: 'responseId' })
  declare response: BelongsTo<typeof Response>

  @belongsTo(() => Question, { foreignKey: 'questionId' })
  declare question: BelongsTo<typeof Question>

  @belongsTo(() => QuestionOption, { foreignKey: 'questionOptionId' })
  declare questionOption: BelongsTo<typeof QuestionOption>
}
