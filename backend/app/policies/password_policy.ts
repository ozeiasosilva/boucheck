/**
 * Password policy module.
 *
 * Pure validation logic for administrator passwords.
 * Enforces: ≥10 characters, ≥1 letter (A-Za-z), ≥1 digit (0-9).
 *
 * @module app/policies/password_policy
 */

import { randomBytes } from 'node:crypto'

export type PolicyCriterion = 'min_length' | 'has_letter' | 'has_number'

export interface PolicyResult {
  ok: boolean
  unmet: PolicyCriterion[]
}

/**
 * Validates a password against the platform password policy.
 *
 * Checks three criteria independently:
 * - `min_length`: password must be at least 10 characters
 * - `has_letter`: password must contain at least one ASCII letter (A-Z or a-z)
 * - `has_number`: password must contain at least one digit (0-9)
 *
 * @param password - The password string to validate
 * @returns A `PolicyResult` with `ok: true` if all criteria pass,
 *          or `ok: false` with the exact subset of unmet criteria
 */
export function validate(password: string): PolicyResult {
  const unmet: PolicyCriterion[] = []

  if (password.length < 10) {
    unmet.push('min_length')
  }

  if (!/[A-Za-z]/.test(password)) {
    unmet.push('has_letter')
  }

  if (!/[0-9]/.test(password)) {
    unmet.push('has_number')
  }

  return {
    ok: unmet.length === 0,
    unmet,
  }
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const DIGITS = '0123456789'
const ALL_CHARS = LETTERS + DIGITS

/**
 * Generates a random password guaranteed to satisfy `validate()`.
 *
 * Uses `node:crypto` for cryptographically-secure random selection.
 * The result always contains ≥1 letter and ≥1 digit and is at least
 * 10 characters long (the minimum enforced length).
 *
 * @param length - Desired password length (clamped to a minimum of 10)
 * @returns A compliant random password string
 */
export function generateCompliant(length: number = 12): string {
  if (length < 10) {
    length = 10
  }

  const bytes = randomBytes(length)
  const chars: string[] = []

  // Guarantee at least one letter
  chars.push(LETTERS[bytes[0] % LETTERS.length])
  // Guarantee at least one digit
  chars.push(DIGITS[bytes[1] % DIGITS.length])

  // Fill remaining positions from the full charset
  for (let i = 2; i < length; i++) {
    chars.push(ALL_CHARS[bytes[i] % ALL_CHARS.length])
  }

  // Shuffle to avoid predictable positions for the guaranteed chars
  for (let i = chars.length - 1; i > 0; i--) {
    const j = bytes[i] % (i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }

  return chars.join('')
}
