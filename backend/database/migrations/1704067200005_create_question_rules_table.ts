import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'question_rules'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table
        .bigInteger('question_option_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('question_options')
      table
        .bigInteger('next_question_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('questions')
      table.boolean('finalizar').notNullable().defaultTo(false)
      table.integer('priority').notNullable().defaultTo(0)

      // Indexes on FK columns
      table.index(['question_option_id'], 'question_rules_question_option_id_index')
      table.index(['next_question_id'], 'question_rules_next_question_id_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
