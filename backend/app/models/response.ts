import { DateTime } from 'luxon'
import { BaseModel, column, hasMany, hasOne, belongsTo, beforeCreate } from '@adonisjs/lucid/orm'
import type { HasMany, HasOne, BelongsTo } from '@adonisjs/lucid/types/relations'
import Survey from './survey.js'
import ScoreRange from './score_range.js'
import type { ResponseStatus } from './types.js'
import { randomUUID } from 'node:crypto'

export default class Response extends BaseModel {
  static selfAssignPrimaryKey = true

  @beforeCreate()
  static assignUuids(response: Response) {
    if (!response.id) {
      response.id = randomUUID()
    }
    if (!response.token) {
      response.token = randomUUID()
    }
  }

  @column({ isPrimary: true })
  declare id: string

  @column({ columnName: 'survey_id' })
  declare surveyId: number

  @column({ columnName: 'survey_version' })
  declare surveyVersion: number

  @column()
  declare token: string

  @column()
  declare nome: string | null

  @column()
  declare telefone: string | null

  @column()
  declare empresa: string | null

  @column()
  declare email: string | null

  @column()
  declare cargo: string | null

  @column()
  declare cidade: string | null

  @column({ columnName: 'politica_versao' })
  declare politicaVersao: string | null

  @column()
  declare status: ResponseStatus

  @column()
  declare pontuacao: number | null

  @column({ columnName: 'faixa_id' })
  declare faixaId: number | null

  @column.dateTime({ columnName: 'started_at' })
  declare startedAt: DateTime | null

  @column.dateTime({ columnName: 'completed_at' })
  declare completedAt: DateTime | null

  @column({ columnName: 'solicitou_whatsapp' })
  declare solicitouWhatsapp: boolean

  @column()
  declare anonimizado: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @hasMany(() => ResponseAnswer, { foreignKey: 'responseId' })
  declare answers: HasMany<typeof ResponseAnswer>

  @hasMany(() => ResponseChecklist, { foreignKey: 'responseId' })
  declare checklistSelections: HasMany<typeof ResponseChecklist>

  @hasMany(() => ResponseEvent, { foreignKey: 'responseId' })
  declare events: HasMany<typeof ResponseEvent>

  @hasOne(() => Report, { foreignKey: 'responseId' })
  declare report: HasOne<typeof Report>

  @belongsTo(() => Survey, { foreignKey: 'surveyId' })
  declare survey: BelongsTo<typeof Survey>

  @belongsTo(() => ScoreRange, { foreignKey: 'faixaId' })
  declare faixa: BelongsTo<typeof ScoreRange>
}

// Lazy imports to avoid circular dependencies
import ResponseAnswer from './response_answer.js'
import ResponseChecklist from './response_checklist.js'
import ResponseEvent from './response_event.js'
import Report from './report.js'
