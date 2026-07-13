import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'ai_generation_logs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table
        .bigInteger('admin_user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('admin_users')
      table
        .bigInteger('survey_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('surveys')
      table.text('prompt').notNullable()
      table.jsonb('resultado').nullable()
      table.integer('tokens_input').nullable()
      table.integer('tokens_output').nullable()
      table.boolean('sucesso').notNullable().defaultTo(false)
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())

      // Indexes on FK columns
      table.index(['admin_user_id'], 'ai_generation_logs_admin_user_id_index')
      table.index(['survey_id'], 'ai_generation_logs_survey_id_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
