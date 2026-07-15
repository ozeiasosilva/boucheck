import vine from '@vinejs/vine'
import { slugRule, SLUG_REGEX, HEX_COLOR_REGEX } from './shared.js'

/**
 * POST /api/admin/surveys
 * Requirements: 1.4, 1.5, 1.6, 2.1
 */
export const createSurveyValidator = vine.compile(
  vine.object({
    nome: vine.string().trim().minLength(1).maxLength(255),
    slug: slugRule,
    categoria_id: vine.number().positive().nullable().optional(),
    mensagem_objetivo: vine.string().maxLength(1000).optional(),
    tempo_estimado_min: vine.number().positive().optional(),
    link_agendamento: vine.string().url().optional(),
    email_notificacao: vine.string().email().optional(),
    usar_ia_no_relatorio: vine.boolean().optional(),
    telefone_whatsapp: vine.string().trim().maxLength(20).nullable().optional(),
  })
)

/**
 * PUT /api/admin/surveys/:id
 * Requirements: 1.4, 1.5, 1.6, 2.1, 3.1, 3.2
 */
export const updateSurveyValidator = vine.compile(
  vine.object({
    nome: vine.string().trim().minLength(1).maxLength(255).optional(),
    slug: vine.string().trim().regex(SLUG_REGEX).optional(),
    categoria_id: vine.number().positive().optional(),
    mensagem_objetivo: vine.string().maxLength(1000).optional(),
    tempo_estimado_min: vine.number().positive().optional(),
    link_agendamento: vine.string().url().optional(),
    email_notificacao: vine.string().email().optional(),
    usar_ia_no_relatorio: vine.boolean().optional(),
    mostrar_btn_relatorio: vine.boolean().optional(),
    mostrar_btn_email: vine.boolean().optional(),
    mostrar_btn_whatsapp: vine.boolean().optional(),
    mostrar_btn_consultor: vine.boolean().optional(),
    telefone_whatsapp: vine.string().trim().maxLength(20).nullable().optional(),
  })
)

/**
 * PUT /api/admin/surveys/:id/status
 * Requirement: 3.1
 */
export const setStatusValidator = vine.compile(
  vine.object({
    status: vine.enum(['rascunho', 'ativo', 'inativo', 'arquivado'] as const),
  })
)

/**
 * POST /api/admin/surveys/:id/duplicate
 * Requirement: 6.3
 */
export const duplicateSurveyValidator = vine.compile(
  vine.object({
    slug: slugRule,
  })
)

/**
 * PUT /api/admin/surveys/:id/visual
 * Requirement: 7.3
 */
export const visualIdentityValidator = vine.compile(
  vine.object({
    cor_primaria: vine.string().trim().regex(HEX_COLOR_REGEX).optional(),
    cor_secundaria: vine.string().trim().regex(HEX_COLOR_REGEX).optional(),
    cor_fundo: vine.string().trim().regex(HEX_COLOR_REGEX).optional(),
    tema: vine.enum(['claro', 'escuro'] as const).optional(),
  })
)
