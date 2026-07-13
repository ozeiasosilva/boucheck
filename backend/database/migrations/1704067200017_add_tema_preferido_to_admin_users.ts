import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'admin_users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('tema_preferido', 10).notNullable().defaultTo('claro')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('tema_preferido')
    })
  }
}
