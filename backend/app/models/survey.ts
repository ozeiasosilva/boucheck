import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Category from './category.js'
import AdminUser from './admin_user.js'
import Question from './question.js'
import type { SurveyStatus, ConfigVisual } from './types.js'

export default class Survey extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare slug: string

  @column()
  declare nome: string

  @column({ columnName: 'categoria_id' })
  declare categoriaId: number | null

  @column()
  declare status: SurveyStatus

  @column()
  declare version: number

  @column({ columnName: 'mensagem_objetivo' })
  declare mensagemObjetivo: string | null

  @column({ columnName: 'tempo_estimado_min' })
  declare tempoEstimadoMin: number | null

  @column({
    columnName: 'config_visual',
    prepare: (value: ConfigVisual | null) => (value ? JSON.stringify(value) : null),
    consume: (value: unknown) =>
      value == null ? null : typeof value === 'string' ? JSON.parse(value) : (value as ConfigVisual),
  })
  declare configVisual: ConfigVisual | null

  @column({ columnName: 'link_agendamento' })
  declare linkAgendamento: string | null

  @column({ columnName: 'email_notificacao' })
  declare emailNotificacao: string | null

  @column({ columnName: 'usar_ia_no_relatorio' })
  declare usarIaNoRelatorio: boolean

  @column({ columnName: 'created_by' })
  declare createdBy: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Category, { foreignKey: 'categoriaId' })
  declare categoria: BelongsTo<typeof Category>

  @belongsTo(() => AdminUser, { foreignKey: 'createdBy' })
  declare creator: BelongsTo<typeof AdminUser>

  @hasMany(() => Question, { foreignKey: 'surveyId' })
  declare questions: HasMany<typeof Question>

  @hasMany(() => ChecklistItem, { foreignKey: 'surveyId' })
  declare checklistItems: HasMany<typeof ChecklistItem>

  @hasMany(() => ScoreRange, { foreignKey: 'surveyId' })
  declare scoreRanges: HasMany<typeof ScoreRange>

  @hasMany(() => Response, { foreignKey: 'surveyId' })
  declare responses: HasMany<typeof Response>
}

// Lazy imports to avoid circular dependencies with models created in later tasks
import ChecklistItem from './checklist_item.js'
import ScoreRange from './score_range.js'
import Response from './response.js'
