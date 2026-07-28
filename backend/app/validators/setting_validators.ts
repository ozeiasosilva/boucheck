import vine from '@vinejs/vine'

/**
 * PUT /api/admin/settings
 *
 * Validates the request body as a record of key-value pairs where:
 * - Each key must match ^[a-z_]+$ (lowercase letters and underscores only)
 * - Each value must be a string or null
 *
 * Requirements: 5.2, 5.7
 */
export const updateSettingsValidator = vine.compile(
  vine.object({}).allowUnknownProperties()
)

/**
 * Custom validation logic applied after VineJS basic parsing.
 * Ensures all keys match ^[a-z_]+$ and values are string | null.
 */
export function validateSettingsBody(body: Record<string, unknown>): {
  valid: boolean
  errors: string[]
  entries: Array<{ key: string; value: string | null }>
} {
  const KEY_PATTERN = /^[a-z_]+$/
  const errors: string[] = []
  const entries: Array<{ key: string; value: string | null }> = []

  for (const [key, value] of Object.entries(body)) {
    if (!KEY_PATTERN.test(key)) {
      errors.push(`Key "${key}" must match pattern ^[a-z_]+$`)
      continue
    }
    if (value !== null && typeof value !== 'string') {
      errors.push(`Value for key "${key}" must be a string or null`)
      continue
    }
    entries.push({ key, value: value as string | null })
  }

  if (entries.length === 0 && errors.length === 0) {
    errors.push('Request body must contain at least one key-value pair')
  }

  return { valid: errors.length === 0, errors, entries }
}
