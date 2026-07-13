import ChecklistItem from '#models/checklist_item'
import Survey from '#models/survey'
import type { ChecklistGrupo } from '#models/types'

export class NotFoundError extends Error {
  status = 404
  constructor(message = 'Not found') {
    super(message)
  }
}

export interface ChecklistView {
  id: number
  surveyId: number
  nome: string
  grupo: ChecklistGrupo
}

function toView(item: ChecklistItem): ChecklistView {
  return {
    id: item.id,
    surveyId: item.surveyId,
    nome: item.nome,
    grupo: item.grupo,
  }
}

export class ChecklistService {
  /**
   * List all checklist items for a survey.
   * Zero items is a valid configuration (Req 14.4).
   */
  async list(surveyId: number): Promise<ChecklistView[]> {
    const items = await ChecklistItem.query().where('survey_id', surveyId)
    return items.map(toView)
  }

  /**
   * Create a new checklist item under a survey (Req 14.1, 14.2).
   * Verifies that the survey exists before creating.
   */
  async create(surveyId: number, nome: string, grupo: ChecklistGrupo): Promise<ChecklistView> {
    const survey = await Survey.find(surveyId)
    if (!survey) throw new NotFoundError('Survey not found')

    const item = await ChecklistItem.create({
      surveyId,
      nome,
      grupo,
    })

    return toView(item)
  }

  /**
   * Update an existing checklist item (Req 14.3).
   * Throws NotFoundError (404) if not found.
   */
  async update(
    id: number,
    input: { nome?: string; grupo?: ChecklistGrupo }
  ): Promise<ChecklistView> {
    const item = await ChecklistItem.find(id)
    if (!item) throw new NotFoundError()

    if (input.nome !== undefined) {
      item.nome = input.nome
    }
    if (input.grupo !== undefined) {
      item.grupo = input.grupo
    }

    await item.save()
    return toView(item)
  }

  /**
   * Delete a checklist item (Req 14.3).
   * Throws NotFoundError (404) if not found.
   */
  async delete(id: number): Promise<void> {
    const item = await ChecklistItem.find(id)
    if (!item) throw new NotFoundError()

    await item.delete()
  }

  /**
   * Import checklist items from a source survey into a target survey (Req 15).
   * Copies each source checklist_items row preserving nome and grupo (Req 15.1).
   * Throws NotFoundError (404) if source survey does not exist (Req 15.2).
   * Source items remain unchanged (Req 15.3).
   */
  async import(targetSurveyId: number, sourceSurveyId: number): Promise<ChecklistView[]> {
    const sourceSurvey = await Survey.find(sourceSurveyId)
    if (!sourceSurvey) throw new NotFoundError('Source survey not found')

    const sourceItems = await ChecklistItem.query().where('survey_id', sourceSurveyId)

    const created: ChecklistView[] = []
    for (const sourceItem of sourceItems) {
      const newItem = await ChecklistItem.create({
        surveyId: targetSurveyId,
        nome: sourceItem.nome,
        grupo: sourceItem.grupo,
      })
      created.push(toView(newItem))
    }

    return created
  }
}

export default new ChecklistService()
