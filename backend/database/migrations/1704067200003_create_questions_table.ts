import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'questions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table
        .bigInteger('survey_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('surveys')
      table.integer('survey_version').notNullable().defaultTo(1)
      table.text('texto').notNullable()
      table.text('descricao').nullable()
      table.string('tipo', 20).notNullable()
      table.boolean('obrigatoria').notNullable().defaultTo(true)
      table.integer('ordem').notNullable().defaultTo(0)
      table.decimal('peso', 10, 2).notNullable().defaultTo(1)
      table.string('dimensao', 255).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())

      // Index on FK column
      table.index(['survey_id'], 'questions_survey_id_index')
    })

    // CHECK constraint on tipo
    this.schema.raw(
      `ALTER TABLE questions ADD CONSTRAINT questions_tipo_check CHECK (tipo IN ('escolha_unica','multipla_escolha','aberta'))`
    )
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
