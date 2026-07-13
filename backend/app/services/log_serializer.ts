/**
 * Log serializer for PII masking and secret redaction.
 *
 * - Masks email addresses: replaces the local part with first char + '***'
 *   e.g. "user@example.com" → "u***@example.com"
 * - Redacts sensitive fields: password, new_password, current_password,
 *   password_hash, passwordHash, token, token_hash, tokenHash, hash,
 *   resetLink, tempPassword
 * - Works recursively on nested objects and arrays
 *
 * Requirements: 11.4, 11.5
 */

const SENSITIVE_FIELDS = new Set([
  'password',
  'new_password',
  'current_password',
  'password_hash',
  'passwordHash',
  'token',
  'token_hash',
  'tokenHash',
  'hash',
  'resetLink',
  'tempPassword',
])

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/**
 * Masks an email address by keeping only the first character of the local part.
 * e.g. "ana@beonup.com.br" → "a***@beonup.com.br"
 */
export function maskEmail(email: string): string {
  const atIndex = email.indexOf('@')
  if (atIndex <= 0) return email
  const domain = email.substring(atIndex)
  return `${email[0]}***${domain}`
}

/**
 * Recursively sanitizes an object, masking emails and redacting sensitive fields.
 * Returns a new object (does not mutate the input).
 */
export function sanitize(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj
  if (typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(sanitize)

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_FIELDS.has(key)) {
      result[key] = '[REDACTED]'
    } else if (key === 'email' && typeof value === 'string') {
      result[key] = maskEmail(value)
    } else if (typeof value === 'string' && EMAIL_REGEX.test(value)) {
      // Mask email-like values even if the key is not 'email'
      result[key] = maskEmail(value)
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitize(value)
    } else {
      result[key] = value
    }
  }
  return result
}

/**
 * Pino serializer that sanitizes request body objects.
 * Used as a custom serializer in the logger configuration.
 */
export const logSerializers = {
  req(req: Record<string, unknown>) {
    const serialized: Record<string, unknown> = {
      method: req.method,
      url: req.url,
    }

    if (req.headers && typeof req.headers === 'object') {
      const headers = { ...(req.headers as Record<string, unknown>) }
      // Redact authorization header (contains access tokens)
      if ('authorization' in headers) {
        headers['authorization'] = '[REDACTED]'
      }
      serialized.headers = headers
    }

    if (req.body && typeof req.body === 'object') {
      serialized.body = sanitize(req.body)
    }

    return serialized
  },
}
