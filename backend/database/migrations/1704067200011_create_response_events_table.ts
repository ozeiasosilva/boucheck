import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'response_events'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table.uuid('response_id').notNullable().references('id').inTable('responses')
      table.string('tipo', 50).notNullable()
      table.jsonb('payload').nullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())

      // Index on FK column (Req 8.2)
      table.index(['response_id'], 'response_events_response_id_index')
      // Composite index for timeline retrieval (Req 8.4)
      table.index(['response_id', 'created_at'], 'response_events_response_created_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
