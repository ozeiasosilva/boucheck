import type { HttpContext } from '@adonisjs/core/http'
import {
  createSurveyValidator,
  updateSurveyValidator,
  setStatusValidator,
  duplicateSurveyValidator,
  visualIdentityValidator,
} from '../validators/survey_validators.js'
import surveyService, {
  NotFoundError,
  SlugConflictError,
  StructureChangeRequiresConfirmationError,
  EmptySurveyActivationError,
  InsufficientOptionsError,
  InvalidRulesError,
} from '../services/survey_service.js'
import { InvalidLogoTypeError, LogoTooLargeError } from '../support/logo_upload.js'

export default class SurveysController {
  /**
   * GET /api/admin/surveys
   *
   * Returns the list of all surveys.
   * Req 22.1
   */
  async index({ response }: HttpContext) {
    const surveys = await surveyService.list()
    return response.ok(surveys)
  }

  /**
   * GET /api/admin/surveys/:id
   *
   * Returns a single survey by id.
   * Req 22.1
   */
  async show({ params, response }: HttpContext) {
    try {
      const survey = await surveyService.read(Number(params.id))
      return response.ok(survey)
    } catch (error) {
      if (error instanceof NotFoundError) {
        return response.notFound({ error: 'Survey not found' })
      }
      throw error
    }
  }

  /**
   * POST /api/admin/surveys
   *
   * Creates a new survey with status='rascunho' and version=1.
   * Req 1.1, 2.1, 2.3, 22.1
   */
  async store({ request, response }: HttpContext) {
    const input = await request.validateUsing(createSurveyValidator)

    try {
      const survey = await surveyService.create(input)
      return response.created(survey)
    } catch (error) {
      if (error instanceof SlugConflictError) {
        return response.unprocessableEntity({ error: error.message })
      }
      throw error
    }
  }

  /**
   * PUT /api/admin/surveys/:id
   *
   * Updates descriptive fields of an existing survey.
   * Req 1.3, 2.3, 22.1
   */
  async update({ params, request, response }: HttpContext) {
    const input = await request.validateUsing(updateSurveyValidator)

    try {
      const survey = await surveyService.update(Number(params.id), input)
      return response.ok(survey)
    } catch (error) {
      if (error instanceof NotFoundError) {
        return response.notFound({ error: 'Survey not found' })
      }
      if (error instanceof SlugConflictError) {
        return response.unprocessableEntity({ error: error.message })
      }
      if (error instanceof StructureChangeRequiresConfirmationError) {
        return response.conflict({ error: error.message })
      }
      throw error
    }
  }

  /**
   * PUT /api/admin/surveys/:id/status
   *
   * Sets the lifecycle status of a survey.
   * If target is 'ativo', runs the activation guard first.
   * Req 3.1, 3.2, 3.3, 11.3, 18.3, 22.1
   */
  async setStatus({ params, request, response }: HttpContext) {
    const { status } = await request.validateUsing(setStatusValidator)

    try {
      const survey = await surveyService.setStatus(Number(params.id), status)
      return response.ok(survey)
    } catch (error) {
      if (error instanceof NotFoundError) {
        return response.notFound({ error: 'Survey not found' })
      }
      if (error instanceof EmptySurveyActivationError) {
        return response.unprocessableEntity({ error: error.message })
      }
      if (error instanceof InsufficientOptionsError) {
        return response.unprocessableEntity({ error: error.message })
      }
      if (error instanceof InvalidRulesError) {
        return response.unprocessableEntity({ error: error.message })
      }
      throw error
    }
  }

  /**
   * PUT /api/admin/surveys/:id/archive
   *
   * Archives a survey (sets status to 'arquivado', retains all data).
   * Req 4.1, 4.2, 4.3, 22.1
   */
  async archive({ params, response }: HttpContext) {
    try {
      const survey = await surveyService.archive(Number(params.id))
      return response.ok(survey)
    } catch (error) {
      if (error instanceof NotFoundError) {
        return response.notFound({ error: 'Survey not found' })
      }
      throw error
    }
  }

  /**
   * POST /api/admin/surveys/:id/duplicate
   *
   * Duplicates a survey into a new draft with deep copy of structure.
   * Req 6.1, 6.2, 6.3, 6.4, 22.1
   */
  async duplicate({ params, request, response }: HttpContext) {
    const { slug } = await request.validateUsing(duplicateSurveyValidator)

    try {
      const survey = await surveyService.duplicate(Number(params.id), slug)
      return response.created(survey)
    } catch (error) {
      if (error instanceof NotFoundError) {
        return response.notFound({ error: 'Survey not found' })
      }
      if (error instanceof SlugConflictError) {
        return response.unprocessableEntity({ error: error.message })
      }
      throw error
    }
  }

  /**
   * PUT /api/admin/surveys/:id/visual
   *
   * Sets the visual identity colors for a survey.
   * Req 7.1, 7.2, 7.3, 22.1
   */
  async setVisualIdentity({ params, request, response }: HttpContext) {
    const colors = await request.validateUsing(visualIdentityValidator)

    try {
      const survey = await surveyService.setVisualIdentity(Number(params.id), colors)
      return response.ok(survey)
    } catch (error) {
      if (error instanceof NotFoundError) {
        return response.notFound({ error: 'Survey not found' })
      }
      throw error
    }
  }

  /**
   * POST /api/admin/surveys/:id/logo
   *
   * Uploads a logo file for a survey. Accepts multipart/form-data.
   * Req 8.1, 8.2, 8.3, 8.4, 22.1
   */
  /**
   * PUT /api/admin/surveys/:id/logo/default
   *
   * Sets the survey to use the default logo (public/logo_completo.png).
   */
  async setDefaultLogo({ params, response }: HttpContext) {
    try {
      const survey = await surveyService.setDefaultLogo(Number(params.id))
      return response.ok(survey)
    } catch (error) {
      if (error instanceof NotFoundError) {
        return response.notFound({ error: 'Survey not found' })
      }
      throw error
    }
  }

  /**
   * DELETE /api/admin/surveys/:id/logo
   *
   * Removes the logo from a survey (clears logo_s3_key).
   */
  async removeLogo({ params, response }: HttpContext) {
    try {
      const survey = await surveyService.removeLogo(Number(params.id))
      return response.ok(survey)
    } catch (error) {
      if (error instanceof NotFoundError) {
        return response.notFound({ error: 'Survey not found' })
      }
      throw error
    }
  }

  async uploadLogo({ params, request, response }: HttpContext) {
    const file = request.file('logo')

    if (!file) {
      return response.unprocessableEntity({ error: 'Logo file is required' })
    }

    const logoFile = {
      type: file.headers?.['content-type'] ?? `image/${file.extname}`,
      size: file.size,
      extname: file.extname ?? '',
      tmpPath: file.tmpPath,
    }

    try {
      const survey = await surveyService.uploadLogo(Number(params.id), logoFile)
      return response.ok(survey)
    } catch (error) {
      if (error instanceof NotFoundError) {
        return response.notFound({ error: 'Survey not found' })
      }
      if (error instanceof InvalidLogoTypeError) {
        return response.unprocessableEntity({ error: error.message })
      }
      if (error instanceof LogoTooLargeError) {
        return response.unprocessableEntity({ error: error.message })
      }
      throw error
    }
  }
}
