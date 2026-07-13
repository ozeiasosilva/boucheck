import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'question_options'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table
        .bigInteger('question_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('questions')
      table.text('texto').notNullable()
      table.decimal('pontuacao', 10, 2).notNullable().defaultTo(0)
      table.integer('ordem').notNullable().defaultTo(0)

      // Index on FK column
      table.index(['question_id'], 'question_options_question_id_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
