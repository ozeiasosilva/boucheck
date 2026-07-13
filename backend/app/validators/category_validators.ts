import vine from '@vinejs/vine'

/**
 * POST /api/admin/categories
 * Req 9.1
 */
export const createCategoryValidator = vine.compile(
  vine.object({
    nome: vine.string().trim().minLength(1).maxLength(255),
  })
)

/**
 * PUT /api/admin/categories/:id
 * Req 9.2
 */
export const updateCategoryValidator = vine.compile(
  vine.object({
    nome: vine.string().trim().minLength(1).maxLength(255),
  })
)
