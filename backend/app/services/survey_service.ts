import Survey from '#models/survey'
import Question from '#models/question'
import QuestionOption from '#models/question_option'
import QuestionRule from '#models/question_rule'
import ChecklistItem from '#models/checklist_item'
import Response from '#models/response'
import type { SurveyStatus, ConfigVisual, SurveyTema } from '#models/types'
import {
  uploadLogo as uploadLogoHelper,
  InvalidLogoTypeError,
  LogoTooLargeError,
} from '../support/logo_upload.js'
import type { LogoFile, S3ClientLike } from '../support/logo_upload.js'
import { RuleGraph } from '../support/rule_graph.js'
import type { QuestionNode, RuleEdge } from '../support/rule_graph.js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import db from '@adonisjs/lucid/services/db'

export type { LogoFile } from '../support/logo_upload.js'

/**
 * Thrown when a survey slug is already taken by a different survey.
 * HTTP 422 — Req 2.3
 */
export class SlugConflictError extends Error {
  status = 422
  constructor(slug: string) {
    super(`Slug "${slug}" is already in use`)
  }
}

/**
 * Thrown when a resource is not found.
 * HTTP 404
 */
export class NotFoundError extends Error {
  status = 404
  constructor(message = 'Survey not found') {
    super(message)
  }
}

/**
 * Thrown when a structure change on a Has_Responses survey requires confirmation
 * but `confirmed` was not set to true.
 * HTTP 409 — Req 5.1
 */
export class StructureChangeRequiresConfirmationError extends Error {
  status = 409
  constructor() {
    super(
      'This survey has existing responses that reference the current structure. Confirm to apply the change and increment the version.'
    )
  }
}

/**
 * Thrown when attempting to activate a survey that has zero questions.
 * HTTP 422 — Req 3.2
 */
export class EmptySurveyActivationError extends Error {
  status = 422
  constructor() {
    super('Survey requires at least one question to be activated')
  }
}

/**
 * Thrown when attempting to activate a survey where a Choice_Question has fewer than 2 options.
 * HTTP 422 — Req 11.3
 */
export class InsufficientOptionsError extends Error {
  status = 422
  questionId: number
  constructor(questionId: number) {
    super(
      `Choice question ${questionId} must have at least 2 options to activate the survey`
    )
    this.questionId = questionId
  }
}

/**
 * Thrown when attempting to activate a survey that has invalid cascade rules.
 * HTTP 422 — Req 18.3
 */
export class InvalidRulesError extends Error {
  status = 422
  ruleIds: number[]
  constructor(ruleIds: number[]) {
    super(
      `Survey has invalid rules that must be corrected before activation: [${ruleIds.join(', ')}]`
    )
    this.ruleIds = ruleIds
  }
}

export interface CreateSurveyInput {
  nome: string
  slug: string
  categoria_id?: number | null
  mensagem_objetivo?: string
  tempo_estimado_min?: number
  link_agendamento?: string
  email_notificacao?: string
  usar_ia_no_relatorio?: boolean
  telefone_whatsapp?: string | null
}

export interface UpdateSurveyInput {
  nome?: string
  slug?: string
  categoria_id?: number
  mensagem_objetivo?: string
  tempo_estimado_min?: number
  link_agendamento?: string
  email_notificacao?: string
  usar_ia_no_relatorio?: boolean
  mostrar_btn_relatorio?: boolean
  mostrar_btn_email?: boolean
  mostrar_btn_whatsapp?: boolean
  mostrar_btn_consultor?: boolean
  telefone_whatsapp?: string | null
}

export interface StructureChangeOptions {
  confirmed: boolean
}

export interface SurveyView {
  id: number
  slug: string
  nome: string
  categoria_id: number | null
  status: SurveyStatus
  version: number
  mensagem_objetivo: string | null
  tempo_estimado_min: number | null
  link_agendamento: string | null
  email_notificacao: string | null
  config_visual: ConfigVisual | null
  usar_ia_no_relatorio: boolean
  mostrar_btn_relatorio: boolean
  mostrar_btn_email: boolean
  mostrar_btn_whatsapp: boolean
  mostrar_btn_consultor: boolean
  telefone_whatsapp: string | null
  created_at: string | null
  updated_at: string | null
}

function toView(survey: Survey): SurveyView {
  return {
    id: survey.id,
    slug: survey.slug,
    nome: survey.nome,
    categoria_id: survey.categoriaId,
    status: survey.status,
    version: survey.version,
    mensagem_objetivo: survey.mensagemObjetivo,
    tempo_estimado_min: survey.tempoEstimadoMin,
    link_agendamento: survey.linkAgendamento,
    email_notificacao: survey.emailNotificacao,
    config_visual: survey.configVisual,
    usar_ia_no_relatorio: survey.usarIaNoRelatorio,
    mostrar_btn_relatorio: survey.mostrarBtnRelatorio,
    mostrar_btn_email: survey.mostrarBtnEmail,
    mostrar_btn_whatsapp: survey.mostrarBtnWhatsapp,
    mostrar_btn_consultor: survey.mostrarBtnConsultor,
    telefone_whatsapp: survey.telefoneWhatsapp ?? null,
    created_at: survey.createdAt?.toISO() ?? null,
    updated_at: survey.updatedAt?.toISO() ?? null,
  }
}

export class SurveyService {
  /**
   * Create a new survey with status='rascunho' and version=1.
   * Validates slug uniqueness before persisting.
   * Req 1.1, 1.2, 2.3
   */
  async create(input: CreateSurveyInput): Promise<SurveyView> {
    await this.assertSlugUnique(input.slug)

    const survey = await Survey.create({
      slug: input.slug,
      nome: input.nome,
      categoriaId: input.categoria_id ?? null,
      status: 'rascunho' as SurveyStatus,
      version: 1,
      mensagemObjetivo: input.mensagem_objetivo ?? null,
      tempoEstimadoMin: input.tempo_estimado_min ?? null,
      linkAgendamento: input.link_agendamento ?? null,
      emailNotificacao: input.email_notificacao ?? null,
      usarIaNoRelatorio: input.usar_ia_no_relatorio ?? false,
      telefoneWhatsapp: input.telefone_whatsapp ?? null,
    })

    return toView(survey)
  }

  /**
   * Read a survey by id. Throws NotFoundError if not found.
   */
  async read(id: number): Promise<SurveyView> {
    const survey = await Survey.find(id)
    if (!survey) throw new NotFoundError()
    return toView(survey)
  }

  /**
   * Update an existing survey's descriptive fields.
   * Validates slug uniqueness if slug is being changed.
   * Req 1.3, 2.3
   */
  async update(id: number, input: UpdateSurveyInput): Promise<SurveyView> {
    const survey = await Survey.find(id)
    if (!survey) throw new NotFoundError()

    // If slug is being changed, check uniqueness against other surveys
    if (input.slug !== undefined && input.slug !== survey.slug) {
      await this.assertSlugUnique(input.slug, id)
    }

    if (input.nome !== undefined) survey.nome = input.nome
    if (input.slug !== undefined) survey.slug = input.slug
    if (input.categoria_id !== undefined) survey.categoriaId = input.categoria_id
    if (input.mensagem_objetivo !== undefined) survey.mensagemObjetivo = input.mensagem_objetivo ?? null
    if (input.tempo_estimado_min !== undefined) survey.tempoEstimadoMin = input.tempo_estimado_min ?? null
    if (input.link_agendamento !== undefined) survey.linkAgendamento = input.link_agendamento ?? null
    if (input.email_notificacao !== undefined) survey.emailNotificacao = input.email_notificacao ?? null
    if (input.usar_ia_no_relatorio !== undefined) survey.usarIaNoRelatorio = input.usar_ia_no_relatorio
    if (input.mostrar_btn_relatorio !== undefined) survey.mostrarBtnRelatorio = input.mostrar_btn_relatorio
    if (input.mostrar_btn_email !== undefined) survey.mostrarBtnEmail = input.mostrar_btn_email
    if (input.mostrar_btn_whatsapp !== undefined) survey.mostrarBtnWhatsapp = input.mostrar_btn_whatsapp
    if (input.mostrar_btn_consultor !== undefined) survey.mostrarBtnConsultor = input.mostrar_btn_consultor
    if (input.telefone_whatsapp !== undefined) survey.telefoneWhatsapp = input.telefone_whatsapp ?? null

    await survey.save()

    return toView(survey)
  }

  /**
   * List all surveys.
   */
  async list(): Promise<SurveyView[]> {
    const surveys = await Survey.query().orderBy('id', 'asc')
    return surveys.map(toView)
  }

  /**
   * Archive a survey by setting status to 'arquivado'.
   * Retains all responses, response_answers, response_checklist, response_events,
   * questions, options, rules, checklist items, and score ranges unchanged.
   * Req 4.1, 4.2, 4.3
   */
  async archive(id: number): Promise<SurveyView> {
    const survey = await Survey.find(id)
    if (!survey) throw new NotFoundError()

    survey.status = 'arquivado' as SurveyStatus
    await survey.save()

    return toView(survey)
  }

  /**
   * Set the lifecycle status of a survey.
   * If the target status is 'ativo', runs the activation guard (assertActivatable) first.
   * For any other status, sets it directly without structural checks (Req 3.1).
   * Req 3.1, 3.2, 3.3, 11.3, 18.3
   */
  async setStatus(id: number, status: SurveyStatus): Promise<SurveyView> {
    const survey = await Survey.find(id)
    if (!survey) throw new NotFoundError()

    if (status === 'ativo') {
      await this.assertActivatable(survey)
    }

    survey.status = status
    await survey.save()

    return toView(survey)
  }

  /**
   * Duplicate a survey into a new draft with deep copy of structure.
   * Copies questions, options, rules (with remapped ids), and checklist items.
   * Does NOT copy responses, response_answers, response_checklist, response_events, or score_ranges.
   * Req 6.1, 6.2, 6.4
   */
  async duplicate(id: number, newSlug: string): Promise<SurveyView> {
    await this.assertSlugUnique(newSlug)

    const source = await Survey.find(id)
    if (!source) throw new NotFoundError()

    const newSurvey = await db.transaction(async (trx) => {
      // 1. Create new survey: copy descriptive fields + config_visual, set status=rascunho, version=1
      const [created] = await trx
        .insertQuery()
        .table('surveys')
        .insert({
          slug: newSlug,
          nome: source.nome,
          categoria_id: source.categoriaId,
          status: 'rascunho',
          version: 1,
          mensagem_objetivo: source.mensagemObjetivo,
          tempo_estimado_min: source.tempoEstimadoMin,
          config_visual: source.configVisual ? JSON.stringify(source.configVisual) : null,
          link_agendamento: source.linkAgendamento,
          email_notificacao: source.emailNotificacao,
          mostrar_btn_relatorio: source.mostrarBtnRelatorio,
          mostrar_btn_email: source.mostrarBtnEmail,
          mostrar_btn_whatsapp: source.mostrarBtnWhatsapp,
          mostrar_btn_consultor: source.mostrarBtnConsultor,
          telefone_whatsapp: source.telefoneWhatsapp,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning('id')

      const newSurveyId: number = created.id

      // 2. Copy questions → build questionIdMap
      const questionIdMap = new Map<number, number>()
      const sourceQuestions = await Question.query({ client: trx })
        .where('survey_id', source.id)
        .orderBy('ordem', 'asc')

      for (const q of sourceQuestions) {
        const [newQ] = await trx
          .insertQuery()
          .table('questions')
          .insert({
            survey_id: newSurveyId,
            survey_version: 1,
            texto: q.texto,
            descricao: q.descricao,
            tipo: q.tipo,
            obrigatoria: q.obrigatoria,
            ordem: q.ordem,
            peso: q.peso,
            dimensao: q.dimensao,
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returning('id')

        questionIdMap.set(q.id, newQ.id)
      }

      // 3. Copy question_options → build optionIdMap
      const optionIdMap = new Map<number, number>()
      const sourceQuestionIds = Array.from(questionIdMap.keys())

      if (sourceQuestionIds.length > 0) {
        const sourceOptions = await QuestionOption.query({ client: trx })
          .whereIn('question_id', sourceQuestionIds)
          .orderBy('id', 'asc')

        for (const opt of sourceOptions) {
          const newQuestionId = questionIdMap.get(opt.questionId)!
          const [newOpt] = await trx
            .insertQuery()
            .table('question_options')
            .insert({
              question_id: newQuestionId,
              texto: opt.texto,
              pontuacao: opt.pontuacao,
              ordem: opt.ordem,
            })
            .returning('id')

          optionIdMap.set(opt.id, newOpt.id)
        }

        // 4. Copy question_rules with remapped ids
        const sourceOptionIds = Array.from(optionIdMap.keys())

        if (sourceOptionIds.length > 0) {
          const sourceRules = await QuestionRule.query({ client: trx })
            .whereIn('question_option_id', sourceOptionIds)
            .orderBy('id', 'asc')

          for (const rule of sourceRules) {
            const newOptionId = optionIdMap.get(rule.questionOptionId)!
            const newNextQuestionId =
              rule.nextQuestionId === null ? null : questionIdMap.get(rule.nextQuestionId) ?? null

            await trx
              .insertQuery()
              .table('question_rules')
              .insert({
                question_option_id: newOptionId,
                next_question_id: newNextQuestionId,
                finalizar: rule.finalizar,
                priority: rule.priority,
              })
          }
        }
      }

      // 5. Copy checklist_items
      const sourceChecklist = await ChecklistItem.query({ client: trx })
        .where('survey_id', source.id)
        .orderBy('id', 'asc')

      for (const item of sourceChecklist) {
        await trx
          .insertQuery()
          .table('checklist_items')
          .insert({
            survey_id: newSurveyId,
            nome: item.nome,
            grupo: item.grupo,
          })
      }

      // Load the newly created survey to return
      return Survey.query({ client: trx }).where('id', newSurveyId).firstOrFail()
    })

    return toView(newSurvey)
  }

  /**
   * Set visual identity colors for a survey.
   * Merges submitted color values into the existing config_visual JSONB,
   * preserving logo_s3_key if already present.
   * Req 7.1, 7.2
   */
  async setVisualIdentity(
    id: number,
    colors: { cor_primaria?: string; cor_secundaria?: string; cor_fundo?: string; tema?: SurveyTema }
  ): Promise<SurveyView> {
    const survey = await Survey.find(id)
    if (!survey) throw new NotFoundError()

    // Merge with existing config_visual (preserve logo_s3_key if present)
    const currentVisual = survey.configVisual ?? {}
    const merged: ConfigVisual = { ...currentVisual }
    if (colors.cor_primaria !== undefined) merged.cor_primaria = colors.cor_primaria
    if (colors.cor_secundaria !== undefined) merged.cor_secundaria = colors.cor_secundaria
    if (colors.cor_fundo !== undefined) merged.cor_fundo = colors.cor_fundo
    if (colors.tema !== undefined) merged.tema = colors.tema
    survey.configVisual = merged

    await survey.save()
    return toView(survey)
  }

  /**
   * Upload a logo file for a survey and persist its S3 key in config_visual.
   * On S3 failure, the key write is skipped (no broken key persisted).
   * Type/size validation errors (422) from the logo_upload helper propagate as-is.
   * Req 8.1
   */
  async uploadLogo(id: number, file: LogoFile): Promise<SurveyView> {
    const survey = await Survey.find(id)
    if (!survey) throw new NotFoundError()

    const s3Client = this.buildS3Client()
    const bucket = process.env.S3_LOGOS_BUCKET ?? 'boucheck-logos'

    let key: string
    try {
      key = await uploadLogoHelper({
        surveyId: id,
        file,
        s3Client,
        bucket,
      })
    } catch (error) {
      // Type/size validation errors (422) propagate to the caller
      if (error instanceof InvalidLogoTypeError || error instanceof LogoTooLargeError) {
        throw error
      }
      // S3 failure: skip the key write — don't persist a broken key
      return toView(survey)
    }

    // Merge logo_s3_key into config_visual preserving colors
    const currentVisual = survey.configVisual ?? {}
    survey.configVisual = {
      ...currentVisual,
      logo_s3_key: key,
    }

    await survey.save()
    return toView(survey)
  }

  /**
   * Set the survey to use the default logo (public/logo_completo.png).
   * Stores '__default__' as the logo_s3_key marker.
   */
  async setDefaultLogo(id: number): Promise<SurveyView> {
    const survey = await Survey.find(id)
    if (!survey) throw new NotFoundError()

    const currentVisual = survey.configVisual ?? {}
    survey.configVisual = {
      ...currentVisual,
      logo_s3_key: '__default__',
    }

    await survey.save()
    return toView(survey)
  }

  /**
   * Remove logo from a survey (clears logo_s3_key).
   */
  async removeLogo(id: number): Promise<SurveyView> {
    const survey = await Survey.find(id)
    if (!survey) throw new NotFoundError()

    const currentVisual = survey.configVisual ?? {}
    const { logo_s3_key: _, ...rest } = currentVisual
    survey.configVisual = rest

    await survey.save()
    return toView(survey)
  }

  /**
   * Determine whether a survey has at least one response.
   * Used to decide whether structural changes need versioning.
   * Req 5 (Has_Responses condition)
   */
  async hasResponses(surveyId: number): Promise<boolean> {
    const count = await Response.query().where('survey_id', surveyId).count('* as total')
    const total = Number(count[0].$extras.total)
    return total > 0
  }

  /**
   * Structure-versioning gate used by QuestionService/RuleService/OptionsController mutations.
   *
   * Logic:
   * 1. Load the survey. Determine hasResponses.
   * 2. If NOT hasResponses → run mutate() directly; do NOT touch version (Req 5.4).
   * 3. If hasResponses:
   *    - If confirmed === false → throw StructureChangeRequiresConfirmationError (HTTP 409) (Req 5.1)
   *    - If confirmed === true → in one transaction: run mutate(), then version += 1,
   *      stamp questions.survey_version = new version for all questions (Req 5.2).
   *      Existing responses rows and their survey_version are left untouched (Req 5.3).
   *
   * Req 5.1, 5.2, 5.3, 5.4, 13.2
   */
  async applyStructureChange<T>(
    surveyId: number,
    opts: StructureChangeOptions,
    mutate: () => Promise<T>
  ): Promise<T> {
    const survey = await Survey.find(surveyId)
    if (!survey) throw new NotFoundError()

    const hasResp = await this.hasResponses(surveyId)

    // No responses → apply directly without version bump (Req 5.4)
    if (!hasResp) {
      return mutate()
    }

    // Has responses + not confirmed → 409 alert (Req 5.1)
    if (!opts.confirmed) {
      throw new StructureChangeRequiresConfirmationError()
    }

    // Has responses + confirmed → transactional mutate + version bump (Req 5.2, 5.3)
    return db.transaction(async (trx) => {
      const result = await mutate()

      // Increment survey version
      const surveyInTrx = await Survey.query({ client: trx })
        .where('id', surveyId)
        .forUpdate()
        .firstOrFail()

      surveyInTrx.version = surveyInTrx.version + 1
      await surveyInTrx.save()

      // Stamp all questions of this survey with the new version
      await Question.query({ client: trx })
        .where('survey_id', surveyId)
        .update({ survey_version: surveyInTrx.version })

      return result
    })
  }

  /**
   * Build a minimal S3ClientLike adapter from the AWS SDK S3Client.
   * Reads AWS_REGION from process.env (same pattern as MailQueue).
   */
  private buildS3Client(): S3ClientLike {
    const region = process.env.AWS_REGION ?? 'us-east-1'
    const client = new S3Client({ region })

    return {
      async putObject(params) {
        await client.send(
          new PutObjectCommand({
            Bucket: params.Bucket,
            Key: params.Key,
            Body: params.Body as Buffer,
            ContentType: params.ContentType,
          })
        )
      },
    }
  }

  /**
   * Activation guard: validates a survey's structure before allowing 'ativo' status.
   *
   * 1. Count questions. If 0 → throw EmptySurveyActivationError (Req 3.2)
   * 2. For each Choice_Question (tipo in ['escolha_unica', 'multipla_escolha']),
   *    count options. If any < 2 → throw InsufficientOptionsError with offending question (Req 11.3)
   * 3. Run RuleGraph.flagInvalid on the survey's rules.
   *    If any rule ids returned → throw InvalidRulesError (Req 18.3)
   *
   * Req 3.2, 3.3, 11.3, 18.3
   */
  private async assertActivatable(survey: Survey): Promise<void> {
    // 1. Load all questions for this survey
    const questions = await Question.query()
      .where('survey_id', survey.id)
      .orderBy('ordem', 'asc')

    if (questions.length === 0) {
      throw new EmptySurveyActivationError()
    }

    // 2. For each Choice_Question, check option count >= 2
    const choiceQuestions = questions.filter(
      (q) => q.tipo === 'escolha_unica' || q.tipo === 'multipla_escolha'
    )

    for (const q of choiceQuestions) {
      const optionCount = await QuestionOption.query()
        .where('question_id', q.id)
        .count('* as total')
      const total = Number(optionCount[0].$extras.total)
      if (total < 2) {
        throw new InsufficientOptionsError(q.id)
      }
    }

    // 3. Check for invalid rules via RuleGraph.flagInvalid
    const questionIds = questions.map((q) => q.id)

    // Load all options for these questions to find their rules
    const options = await QuestionOption.query()
      .whereIn('question_id', questionIds)

    const optionIds = options.map((o) => o.id)

    // Load all rules attached to these options
    const rules = optionIds.length > 0
      ? await QuestionRule.query().whereIn('question_option_id', optionIds)
      : []

    // Build QuestionNode[] and RuleEdge[] for RuleGraph
    const questionNodes: QuestionNode[] = questions.map((q) => ({
      id: q.id,
      ordem: q.ordem,
    }))

    // Build a map from optionId → questionId for owner resolution
    const optionToQuestionMap = new Map<number, number>()
    for (const opt of options) {
      optionToQuestionMap.set(opt.id, opt.questionId)
    }

    const ruleEdges: RuleEdge[] = rules.map((r) => ({
      id: r.id,
      ownerQuestionId: optionToQuestionMap.get(r.questionOptionId) ?? 0,
      nextQuestionId: r.nextQuestionId,
      finalizar: r.finalizar,
    }))

    const invalidRuleIds = RuleGraph.flagInvalid(questionNodes, ruleEdges)

    if (invalidRuleIds.length > 0) {
      throw new InvalidRulesError(invalidRuleIds)
    }
  }

  /**
   * Check that a slug is not already assigned to a different survey.
   * Throws SlugConflictError (422) if the slug is taken.
   */
  private async assertSlugUnique(slug: string, excludeId?: number): Promise<void> {
    const query = Survey.query().where('slug', slug)
    if (excludeId !== undefined) {
      query.whereNot('id', excludeId)
    }
    const existing = await query.first()
    if (existing) {
      throw new SlugConflictError(slug)
    }
  }
}

export default new SurveyService()
