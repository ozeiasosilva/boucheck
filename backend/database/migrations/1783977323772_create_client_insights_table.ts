import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'client_insights'

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
        .notNullable()
        .references('id')
        .inTable('admin_users')
        .onDelete('CASCADE')
      table.text('conteudo').notNullable()
      table.integer('tokens_input').nullable()
      table.integer('tokens_output').nullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())

      table.index(['response_id', 'created_at'], 'idx_client_insights_response_latest')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
