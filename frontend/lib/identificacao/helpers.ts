/**
 * Validation helpers for the LGPD identification form.
 * Extracted for testability and reuse.
 */

// ─── Phone mask helper ───────────────────────────────────────────────────────

/**
 * Applies the Brazilian phone mask +55 (XX) XXXXX-XXXX to raw input.
 * Strips non-digit characters and formats progressively.
 */
export function applyPhoneMask(raw: string): string {
  // Keep only digits
  const digits = raw.replace(/\D/g, '')

  // Limit to 13 digits (55 + 2-digit DDD + 9-digit number)
  const limited = digits.slice(0, 13)

  if (limited.length === 0) return ''
  if (limited.length <= 2) return `+${limited}`
  if (limited.length <= 4) return `+${limited.slice(0, 2)} (${limited.slice(2)}`
  if (limited.length <= 9)
    return `+${limited.slice(0, 2)} (${limited.slice(2, 4)}) ${limited.slice(4)}`
  return `+${limited.slice(0, 2)} (${limited.slice(2, 4)}) ${limited.slice(4, 9)}-${limited.slice(9)}`
}

/**
 * Returns true only when the phone value contains exactly 13 digits
 * (country code 55 + 2-digit DDD + 9-digit number).
 */
export function isPhoneComplete(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  return digits.length === 13
}

// ─── Email validation ────────────────────────────────────────────────────────

/**
 * Basic syntactic email validation: local@domain.tld
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// ─── Form validity ──────────────────────────────────────────────────────────

export interface IdentificationFields {
  nome: string
  telefone: string
  empresa: string
  email: string
  cargo: string
  cidade: string
  politicaAceita: boolean
}

/**
 * Determines whether the identification form is valid for submission.
 * All text fields must be non-empty (trimmed), phone must be complete,
 * email must be syntactically valid, and privacy policy must be accepted.
 */
export function isFormValid(fields: IdentificationFields): boolean {
  return (
    fields.nome.trim() !== '' &&
    isPhoneComplete(fields.telefone) &&
    fields.empresa.trim() !== '' &&
    isValidEmail(fields.email) &&
    fields.cargo.trim() !== '' &&
    fields.cidade.trim() !== '' &&
    fields.politicaAceita
  )
}
