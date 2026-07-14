import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'interaction_histories'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table
        .uuid('response_id')
        .notNullable()
        .references('id')
        .inTable('responses')
        .onDelete('CASCADE')
      table
        .bigInteger('admin_user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('admin_users')
        .onDelete('CASCADE')
      table.string('tipo', 50).notNullable()
      table.text('observacao').nullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())

      table.index(['response_id', 'created_at'], 'idx_interaction_histories_response_date')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
