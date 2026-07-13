import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'score_ranges'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table
        .bigInteger('survey_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('surveys')
      table.string('nome', 255).notNullable()
      table.decimal('min', 10, 2).notNullable()
      table.decimal('max', 10, 2).notNullable()
      table.text('descricao').nullable()
      table.string('cor', 20).nullable()

      // Index on FK column
      table.index(['survey_id'], 'score_ranges_survey_id_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
