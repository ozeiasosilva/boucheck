import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'survey_insights'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table
        .bigInteger('survey_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('surveys')
        .onDelete('CASCADE')
      table
        .bigInteger('admin_user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('admin_users')
        .onDelete('CASCADE')
      table.text('conteudo').notNullable()
      table.integer('tokens_input').nullable()
      table.integer('tokens_output').nullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())

      table.index(['survey_id', 'created_at'], 'idx_survey_insights_survey_latest')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
