import vine from '@vinejs/vine'

/**
 * Brazilian phone/WhatsApp mask validation (Req 3.1, 3.10).
 *
 * Accepts the canonical mask `+55 (00) 00000-0000` as well as reasonable
 * variations respondents may type or paste:
 * - optional `+55` country code, with or without a following space
 * - optional parentheses around the 2-digit DDD
 * - optional space between the DDD and the subscriber number
 * - optional hyphen before the last 4 digits
 * - 8-digit (landline) or 9-digit (mobile) subscriber numbers
 */
const BR_PHONE_REGEX = /^(\+?55\s?)?\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/

/**
 * POST /api/public/surveys/{slug}/responses
 *
 * Identification_Form submission (Req 3.1, 3.2, 3.5, 3.7):
 * - Nome, Telefone, Empresa, E-mail, Cargo, Cidade are all required.
 * - Telefone must match the Brazilian phone format.
 * - E-mail must be syntactically valid.
 * - `aceite_politica` represents the privacy-policy acceptance checkbox and
 *   must be checked/truthy (Req 3.2, 3.3, 3.5).
 * - `politica_versao` is the Policy_Version in effect at acceptance time,
 *   persisted to `responses.politica_versao` (Req 3.7).
 *
 * VineJS returns HTTP 422 automatically when a required field is missing or
 * malformed (Req 3.9, 3.10, 3.11).
 */
export const identificationValidator = vine.compile(
  vine.object({
    nome: vine.string().trim().minLength(1),
    telefone: vine.string().trim().regex(BR_PHONE_REGEX),
    empresa: vine.string().trim().minLength(1),
    email: vine.string().trim().email(),
    cargo: vine.string().trim().minLength(1),
    cidade: vine.string().trim().minLength(1),
    aceite_politica: vine.accepted(),
    politica_versao: vine.string().trim().minLength(1),
  })
)
