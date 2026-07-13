import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'response_answers'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table.uuid('response_id').notNullable().references('id').inTable('responses')
      table
        .bigInteger('question_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('questions')
      table
        .bigInteger('question_option_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('question_options')
      table.text('texto_livre').nullable()

      // Composite UNIQUE constraint (Req 4.6)
      table.unique(['response_id', 'question_id', 'question_option_id'], {
        indexName: 'response_answers_unique',
      })

      // Indexes on FK columns (Req 8.2)
      table.index(['response_id'], 'response_answers_response_id_index')
      table.index(['question_id'], 'response_answers_question_id_index')
      table.index(['question_option_id'], 'response_answers_question_option_id_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
