import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Response from './response.js'
import AdminUser from './admin_user.js'

export const INTERACTION_TYPES = [
  'enviou_orcamento',
  'fechou_negocio',
  'nao_respondeu_contato',
  'agendou_reuniao',
  'em_negociacao',
  'perdeu_para_concorrente',
  'cliente_nao_qualificado',
  'retornar_futuramente',
] as const

export type InteractionType = (typeof INTERACTION_TYPES)[number]

export default class InteractionHistory extends BaseModel {
  static table = 'interaction_histories'

  @column({ isPrimary: true })
  declare id: number

  @column({ columnName: 'response_id' })
  declare responseId: string

  @column({ columnName: 'admin_user_id' })
  declare adminUserId: number

  @column()
  declare tipo: InteractionType

  @column()
  declare observacao: string | null

  @column.dateTime({ autoCreate: true, columnName: 'created_at' })
  declare createdAt: DateTime

  @belongsTo(() => Response, { foreignKey: 'responseId' })
  declare response: BelongsTo<typeof Response>

  @belongsTo(() => AdminUser, { foreignKey: 'adminUserId' })
  declare adminUser: BelongsTo<typeof AdminUser>
}
