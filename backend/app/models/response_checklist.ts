import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Response from './response.js'
import ChecklistItem from './checklist_item.js'

export default class ResponseChecklist extends BaseModel {
  static table = 'response_checklist'

  @column({ isPrimary: true })
  declare id: number

  @column({ columnName: 'response_id' })
  declare responseId: string

  @column({ columnName: 'checklist_item_id' })
  declare checklistItemId: number

  @belongsTo(() => Response, { foreignKey: 'responseId' })
  declare response: BelongsTo<typeof Response>

  @belongsTo(() => ChecklistItem, { foreignKey: 'checklistItemId' })
  declare checklistItem: BelongsTo<typeof ChecklistItem>
}
