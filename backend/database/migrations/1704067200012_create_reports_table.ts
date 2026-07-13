import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'reports'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table.uuid('response_id').notNullable().references('id').inTable('responses')
      table.string('html_s3_key', 1024).notNullable()
      table.string('pdf_s3_key', 1024).nullable()
      table.string('public_token', 255).notNullable()
      table.timestamp('expires_at', { useTz: true }).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())

      // UNIQUE constraints
      table.unique(['response_id'], 'reports_response_id_unique')
      table.unique(['public_token'], 'reports_public_token_unique')

      // Indexes on FK and lookup columns
      table.index(['response_id'], 'reports_response_id_index')
      table.index(['public_token'], 'reports_public_token_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
