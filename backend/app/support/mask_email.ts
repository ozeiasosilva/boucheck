/**
 * E-mail masking — pure module.
 *
 * Masks all characters of the local part except the first, preserving
 * the domain portion unchanged.
 *
 * Example: "joao.silva@empresa.com.br" → "j*********@empresa.com.br"
 *
 * Validates: Requirements 13.4
 */

/**
 * Returns a masked version of an e-mail address: first character of the
 * local part visible, remaining local-part characters replaced with `*`,
 * domain unchanged.
 *
 * - Single-character local parts return that character plus the domain.
 * - Empty strings or strings without `@` return an empty string.
 */
export function maskEmail(email: string): string {
  if (!email) {
    return ''
  }

  const atIndex = email.indexOf('@')
  if (atIndex === -1) {
    return ''
  }

  const localPart = email.slice(0, atIndex)
  const domain = email.slice(atIndex) // includes the '@'

  if (localPart.length === 0) {
    return domain
  }

  if (localPart.length === 1) {
    return localPart + domain
  }

  const masked = localPart[0] + '*'.repeat(localPart.length - 1)
  return masked + domain
}
