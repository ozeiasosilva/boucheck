import vine from '@vinejs/vine'
import { SimpleMessagesProvider } from '@vinejs/vine'

// ---------------------------------------------------------------------------
// Shared constant
// ---------------------------------------------------------------------------

export const ALLOWED_TYPES = ['escolha_unica', 'multipla_escolha', 'aberta'] as const

// ---------------------------------------------------------------------------
// POST /api/admin/surveys/:id/ai/generate-questions
// Req 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3
// ---------------------------------------------------------------------------

export const generateQuestionsValidator = vine.compile(
  vine.object({
    tema: vine.string().trim().minLength(1).maxLength(2000),
    quantidade: vine.number().withoutDecimals().min(1).max(20),
    tipos_permitidos: vine.array(vine.enum(ALLOWED_TYPES)).minLength(1).distinct(),
    publico_alvo: vine.string().trim().minLength(1).maxLength(500),
  })
)

generateQuestionsValidator.messagesProvider = new SimpleMessagesProvider({
  'quantidade.max': 'entre 1 e 20 perguntas podem ser geradas por requisição',
})

// ---------------------------------------------------------------------------
// Generated_Questions_Schema — validates AI model output
// Req 4.2, 4.3, 4.4, 4.5
// ---------------------------------------------------------------------------

export const Generated_Questions_Schema = vine.compile(
  vine.array(
    vine.object({
      texto: vine.string().minLength(1),
      tipo: vine.enum(ALLOWED_TYPES),
      obrigatoria: vine.boolean(),
      opcoes: vine.array(
        vine.object({
          texto: vine.string().minLength(1),
          pontuacao: vine.number(),
        })
      ),
    })
  )
)

// ---------------------------------------------------------------------------
// POST /api/admin/surveys/:id/ai/confirm-questions
// Req 5.5, 9.3, 9.4
// ---------------------------------------------------------------------------

export const confirmQuestionsValidator = vine.compile(
  vine.object({
    questions: vine.array(
      vine.object({
        texto: vine.string().minLength(1),
        tipo: vine.enum(ALLOWED_TYPES),
        obrigatoria: vine.boolean(),
        opcoes: vine.array(
          vine.object({
            texto: vine.string().minLength(1),
            pontuacao: vine.number(),
          })
        ),
      })
    ),
  })
)

// ---------------------------------------------------------------------------
// TypeScript types
// ---------------------------------------------------------------------------

export type GenerationRequest = {
  tema: string
  quantidade: number
  tipos_permitidos: Array<(typeof ALLOWED_TYPES)[number]>
  publico_alvo: string
}

export type GeneratedQuestion = {
  texto: string
  tipo: (typeof ALLOWED_TYPES)[number]
  obrigatoria: boolean
  opcoes: Array<{ texto: string; pontuacao: number }>
}
