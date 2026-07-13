import Category from '#models/category'
import Survey from '#models/survey'

export class NotFoundError extends Error {
  status = 404
  constructor(message = 'Not found') {
    super(message)
  }
}

export class CategoryInUseError extends Error {
  status = 422
  constructor(message = 'Category is in use') {
    super(message)
  }
}

export interface CategoryView {
  id: number
  nome: string
  created_at: string
  updated_at: string
}

function toView(category: Category): CategoryView {
  return {
    id: category.id,
    nome: category.nome,
    created_at: category.createdAt.toISO()!,
    updated_at: category.updatedAt.toISO()!,
  }
}

export class CategoryService {
  /**
   * Get a single category by id.
   * Req 22.2
   */
  async get(id: number): Promise<CategoryView> {
    const category = await Category.find(id)
    if (!category) throw new NotFoundError()
    return toView(category)
  }

  /**
   * List all categories.
   * Req 9.3
   */
  async list(): Promise<CategoryView[]> {
    const categories = await Category.all()
    return categories.map(toView)
  }

  /**
   * Create a new category.
   * Req 9.1
   */
  async create(nome: string): Promise<CategoryView> {
    const category = await Category.create({ nome })
    return toView(category)
  }

  /**
   * Update an existing category's name.
   * Req 9.2
   */
  async update(id: number, nome: string): Promise<CategoryView> {
    const category = await Category.find(id)
    if (!category) throw new NotFoundError()

    category.nome = nome
    await category.save()
    return toView(category)
  }

  /**
   * Delete a category if not referenced by any survey.
   * Req 9.4 — in-use guard: reject with 422 if any survey references this category.
   */
  async delete(id: number): Promise<void> {
    const category = await Category.find(id)
    if (!category) throw new NotFoundError()

    const surveyCount = await Survey.query()
      .where('categoria_id', id)
      .count('* as total')

    const count = Number(surveyCount[0].$extras.total)

    if (count > 0) {
      throw new CategoryInUseError()
    }

    await category.delete()
  }
}

export default new CategoryService()
