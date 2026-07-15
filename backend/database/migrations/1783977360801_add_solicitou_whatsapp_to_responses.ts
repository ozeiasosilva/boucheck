import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'responses'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('solicitou_whatsapp').notNullable().defaultTo(false)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('solicitou_whatsapp')
    })
  }
}
