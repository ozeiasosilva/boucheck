import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'surveys'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table.string('slug', 255).notNullable().unique()
      table.string('nome', 255).notNullable()
      table
        .bigInteger('categoria_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('categories')
      table.string('status', 20).notNullable().defaultTo('rascunho')
      table.integer('version').notNullable().defaultTo(1)
      table.text('mensagem_objetivo').nullable()
      table.integer('tempo_estimado_min').nullable()
      table.jsonb('config_visual').nullable()
      table.string('link_agendamento', 1024).nullable()
      table.string('email_notificacao', 255).nullable()
      table.boolean('usar_ia_no_relatorio').notNullable().defaultTo(false)
      table
        .bigInteger('created_by')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('admin_users')
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())

      // Indexes on FK columns and slug
      table.index(['slug'], 'surveys_slug_index')
      table.index(['categoria_id'], 'surveys_categoria_id_index')
      table.index(['created_by'], 'surveys_created_by_index')
    })

    // CHECK constraint on status
    this.schema.raw(
      `ALTER TABLE surveys ADD CONSTRAINT surveys_status_check CHECK (status IN ('rascunho','ativo','inativo','arquivado'))`
    )
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
