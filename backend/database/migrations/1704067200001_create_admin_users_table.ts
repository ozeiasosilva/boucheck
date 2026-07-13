import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'admin_users'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table.string('nome', 255).notNullable()
      table.string('email', 255).notNullable().unique()
      table.string('password_hash', 255).notNullable()
      table.string('role', 20).notNullable().defaultTo('admin')
      table.boolean('ativo').notNullable().defaultTo(true)
      table.boolean('must_change_password').notNullable().defaultTo(false)
      table.timestamp('last_login_at', { useTz: true }).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
