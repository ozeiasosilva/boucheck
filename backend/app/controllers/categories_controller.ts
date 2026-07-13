import type { HttpContext } from '@adonisjs/core/http'
import { createCategoryValidator, updateCategoryValidator } from '../validators/category_validators.js'
import categoryService, {
  NotFoundError,
  CategoryInUseError,
} from '../services/category_service.js'

export default class CategoriesController {
  /**
   * GET /api/admin/categories
   *
   * Returns the list of all categories.
   * Req 9.3, 22.2
   */
  async index({ response }: HttpContext) {
    const categories = await categoryService.list()
    return response.ok(categories)
  }

  /**
   * GET /api/admin/categories/:id
   *
   * Returns a single category by id.
   * Req 22.2 — 404 for unknown ids.
   */
  async show({ params, response }: HttpContext) {
    try {
      const category = await categoryService.get(Number(params.id))
      return response.ok(category)
    } catch (error) {
      if (error instanceof NotFoundError) {
        return response.notFound({ error: 'Not found' })
      }
      throw error
    }
  }

  /**
   * POST /api/admin/categories
   *
   * Creates a new category.
   * Req 9.1, 22.2 — 201 on success, 422 on validation failure.
   */
  async store({ request, response }: HttpContext) {
    const { nome } = await request.validateUsing(createCategoryValidator)

    const category = await categoryService.create(nome)
    return response.created(category)
  }

  /**
   * PUT /api/admin/categories/:id
   *
   * Updates an existing category's name.
   * Req 9.2, 22.2 — 200 on success, 404 for unknown ids.
   */
  async update({ params, request, response }: HttpContext) {
    const { nome } = await request.validateUsing(updateCategoryValidator)

    try {
      const category = await categoryService.update(Number(params.id), nome)
      return response.ok(category)
    } catch (error) {
      if (error instanceof NotFoundError) {
        return response.notFound({ error: 'Not found' })
      }
      throw error
    }
  }

  /**
   * DELETE /api/admin/categories/:id
   *
   * Deletes a category if not in use.
   * Req 9.4, 22.2 — 204 on success, 404 for unknown ids, 422 if in use.
   */
  async destroy({ params, response }: HttpContext) {
    try {
      await categoryService.delete(Number(params.id))
      return response.noContent()
    } catch (error) {
      if (error instanceof NotFoundError) {
        return response.notFound({ error: 'Not found' })
      }
      if (error instanceof CategoryInUseError) {
        return response.unprocessableEntity({ error: 'Category is in use' })
      }
      throw error
    }
  }
}
