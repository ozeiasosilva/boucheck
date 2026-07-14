import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'ai_prompt_configs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table.string('tipo', 30).notNullable().unique()
      table.text('conteudo').notNullable()
      table
        .bigInteger('admin_user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('admin_users')
        .onDelete('CASCADE')
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
