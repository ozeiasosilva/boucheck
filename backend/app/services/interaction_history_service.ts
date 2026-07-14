import InteractionHistory from '#models/interaction_history'
import { INTERACTION_TYPES } from '#models/interaction_history'
import type { InteractionType } from '#models/interaction_history'

// Re-export for convenience
export { INTERACTION_TYPES }
export type { InteractionType }

export interface CreateInteractionData {
  responseId: string
  adminUserId: number
  tipo: InteractionType
  observacao?: string | null
}

export interface PaginatedResult {
  data: InteractionHistory[]
  meta: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
  }
}

export class InteractionHistoryService {
  /**
   * Cria uma nova entrada de histórico (append-only, imutável).
   * Req 3.2
   */
  async create(data: CreateInteractionData): Promise<InteractionHistory> {
    const record = await InteractionHistory.create({
      responseId: data.responseId,
      adminUserId: data.adminUserId,
      tipo: data.tipo,
      observacao: data.observacao ?? null,
    })
    return record
  }

  /**
   * Lista histórico paginado por response_id, ordenado por created_at DESC.
   * Req 3.4
   */
  async list(responseId: string, page: number, perPage: number = 20): Promise<PaginatedResult> {
    const result = await InteractionHistory.query()
      .where('responseId', responseId)
      .orderBy('created_at', 'desc')
      .paginate(page, perPage)

    return {
      data: result.all(),
      meta: {
        total: result.total,
        perPage: result.perPage,
        currentPage: result.currentPage,
        lastPage: result.lastPage,
      },
    }
  }

  /**
   * Retorna todos os registros de histórico para inclusão no prompt do agente.
   * Req 3.5
   */
  async getAllForPrompt(responseId: string): Promise<InteractionHistory[]> {
    return InteractionHistory.query()
      .where('responseId', responseId)
      .orderBy('created_at', 'desc')
  }
}

export default new InteractionHistoryService()
