import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'surveys'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('mostrar_btn_relatorio').notNullable().defaultTo(true)
      table.boolean('mostrar_btn_email').notNullable().defaultTo(true)
      table.boolean('mostrar_btn_whatsapp').notNullable().defaultTo(true)
      table.boolean('mostrar_btn_consultor').notNullable().defaultTo(true)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('mostrar_btn_relatorio')
      table.dropColumn('mostrar_btn_email')
      table.dropColumn('mostrar_btn_whatsapp')
      table.dropColumn('mostrar_btn_consultor')
    })
  }
}
