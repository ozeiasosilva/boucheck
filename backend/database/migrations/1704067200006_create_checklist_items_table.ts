import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'checklist_items'

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
      table.string('grupo', 20).notNullable()

      // Index on FK column
      table.index(['survey_id'], 'checklist_items_survey_id_index')
    })

    // CHECK constraint on grupo
    this.schema.raw(
      `ALTER TABLE checklist_items ADD CONSTRAINT checklist_items_grupo_check CHECK (grupo IN ('servico_cloud','fabricante','solucao'))`
    )
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
