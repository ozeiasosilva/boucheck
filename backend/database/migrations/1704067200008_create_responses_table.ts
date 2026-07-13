import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'responses'

  async up() {
    // Ensure gen_random_uuid() is available (safe if already exists or on PG 13+)
    this.schema.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')

    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table
        .bigInteger('survey_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('surveys')
      table.integer('survey_version').notNullable().defaultTo(1)
      table.uuid('token').notNullable().unique().defaultTo(this.raw('gen_random_uuid()'))
      table.string('nome', 255).nullable()
      table.string('telefone', 50).nullable()
      table.string('empresa', 255).nullable()
      table.string('email', 255).nullable()
      table.string('cargo', 255).nullable()
      table.string('cidade', 255).nullable()
      table.string('politica_versao', 50).nullable()
      table.string('status', 20).notNullable().defaultTo('iniciado')
      table.decimal('pontuacao', 10, 2).nullable()
      table
        .bigInteger('faixa_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('score_ranges')
      table.timestamp('started_at', { useTz: true }).nullable()
      table.timestamp('completed_at', { useTz: true }).nullable()
      table.boolean('anonimizado').notNullable().defaultTo(false)
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())

      // Indexes on FK columns and token
      table.index(['survey_id'], 'responses_survey_id_index')
      table.index(['faixa_id'], 'responses_faixa_id_index')
      table.index(['token'], 'responses_token_index')
    })

    // CHECK constraint on status
    this.schema.raw(
      `ALTER TABLE responses ADD CONSTRAINT responses_status_check CHECK (status IN ('iniciado','completo'))`
    )
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
