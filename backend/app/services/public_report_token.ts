import { randomBytes } from 'node:crypto'

/**
 * Generate a cryptographically random Public_Report_Token.
 *
 * Uses 32 bytes (256 bits) of entropy encoded as base64url — enough to make
 * brute-force/guessing infeasible. The token is never derived from any
 * sequential identifier (`reports.id`, `responses.id`, etc.).
 *
 * Uniqueness is enforced at the DB level by the `reports_public_token_unique`
 * constraint; collision handling (bounded regenerate-on-collision loop) is
 * performed by the caller (`findOrCreateReport`), not here.
 *
 * Validates: Requirement 17.1
 */
export function generatePublicReportToken(): string {
  return randomBytes(32).toString('base64url')
}
