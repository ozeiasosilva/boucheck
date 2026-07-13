import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'response_checklist'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table.uuid('response_id').notNullable().references('id').inTable('responses')
      table
        .bigInteger('checklist_item_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('checklist_items')

      // Indexes on FK columns
      table.index(['response_id'], 'response_checklist_response_id_index')
      table.index(['checklist_item_id'], 'response_checklist_checklist_item_id_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
