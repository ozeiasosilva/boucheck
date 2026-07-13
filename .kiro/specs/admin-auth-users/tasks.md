# Implementation Plan: admin-auth-users

## Overview

This plan implements administrator authentication and administrator user management for the BouCheck admin area (spec 2 of 7) in **TypeScript on AdonisJS 6**, as specified by the design document. It builds incrementally: new persistence and configuration first, then the pure `PasswordPolicy` module, validators and the `MailQueue` producer, then the domain services (`AuthService`, `AdminUserService`), then middleware and log masking, and finally the controllers and route wiring. Property-based tests (`fast-check` + Japa, 100+ iterations) cover the fourteen correctness properties; example and smoke tests cover the transport/config criteria. Every task ends by integrating into the previous work so no code is left orphaned.

The `admin_users` table and `AdminUser` model come from the `foundation-data-model` spec and are consumed as-is; this spec only *extends* the model and adds new persistence (`auth_access_tokens`, `password_reset_tokens`, `rate_limits`).

## Tasks

- [x] 1. Create new persistence migrations
  - [x] 1.1 Create `auth_access_tokens` migration
    - Add `database/migrations/xxxx_create_auth_access_tokens_table.ts` matching the AdonisJS access-tokens shape (`id`, `tokenable_id` FK to `admin_users` with `ON DELETE CASCADE`, `type`, `name`, `hash`, `abilities`, `created_at`, `updated_at`, `last_used_at`, `expires_at`) plus the `tokenable_id` index
    - Do not modify the foundation `admin_users` table
    - _Requirements: 2.2, 7.2_

  - [x] 1.2 Create `password_reset_tokens` migration
    - Add `database/migrations/xxxx_create_password_reset_tokens_table.ts` with `id`, `admin_user_id` FK (`ON DELETE CASCADE`), `token_hash` (UNIQUE), `expires_at`, `used_at` (nullable), `created_at`, `updated_at`, plus indexes on `admin_user_id` and `token_hash`
    - _Requirements: 5.2, 5.4, 5.6_

  - [x] 1.3 Create `rate_limits` migration
    - Add `database/migrations/xxxx_create_rate_limits_table.ts` for the `@adonisjs/limiter` database store (`key`, `points`, `expire`) as required by the limiter package
    - _Requirements: 3.1, 3.2_

  - [x] 1.4 Write smoke test for the three new migrations
    - Assert each migration runs and creates its table, and that `admin_users` is unchanged from the foundation
    - _Requirements: 2.2, 3.1, 5.2_

- [x] 2. Extend model layer and add configuration
  - [x] 2.1 Extend `AdminUser` model with the access-tokens provider
    - In `app/models/admin_user.ts` add the `accessTokens` static `DbAccessTokensProvider.forModel` with `expiresIn: '12 hours'` and `table: 'auth_access_tokens'`; ensure `password_hash` has `serializeAs: null`
    - Additive change only — do not alter existing foundation columns
    - _Requirements: 2.2, 10.3_

  - [x] 2.2 Create the `PasswordResetToken` model
    - Add `app/models/password_reset_token.ts` with columns `adminUserId`, `tokenHash` (`serializeAs: null`), `expiresAt`, `usedAt`, timestamps, the `belongsTo(AdminUser)` relation, and an `isValid` getter (`usedAt === null && expiresAt > now`)
    - _Requirements: 5.2, 5.4, 5.6_

  - [x] 2.3 Configure the access-tokens auth guard
    - Add/adjust `config/auth.ts` to define the `api` tokens guard against the `AdminUser` model using the `accessTokens` provider (12h expiry)
    - _Requirements: 2.1, 2.2_

  - [x] 2.4 Configure the rate limiter database store
    - Add `config/limiter.ts` with the `db` store bound to `tableName: 'rate_limits'` and set as default
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 2.5 Configure CORS for admin routes
    - Add/adjust `config/cors.ts` to allow only `https://boucheck.beonup.com.br` for `/api/admin/*`, credentials on, methods limited to the endpoint table; no wildcard origin
    - _Requirements: 11.2_

- [x] 3. Implement the PasswordPolicy module
  - [x] 3.1 Implement `validate(password)`
    - Add `app/policies/password_policy.ts` exporting `PolicyResult`/`PolicyCriterion` and a pure `validate` returning `ok` plus the exact `unmet` subset of `{min_length, has_letter, has_number}` (≥10 chars, ≥1 letter, ≥1 digit)
    - _Requirements: 4.2, 4.3_

  - [x] 3.2 Write property test for password policy validation
    - **Property 1: Password policy validation**
    - **Validates: Requirements 4.2, 4.3**
    - Use `fast-check` over arbitrary strings (include whitespace/unicode edge cases), min 100 iterations

  - [x] 3.3 Implement `generateCompliant(length?)`
    - Add `generateCompliant` to `password_policy.ts` using `node:crypto` for random selection, guaranteeing ≥1 letter and ≥1 digit so every result passes `validate`
    - _Requirements: 6.2_

  - [x] 3.4 Write property test for generated temporary passwords
    - **Property 2: Generated temporary passwords are always compliant**
    - **Validates: Requirements 6.2**
    - Generate many passwords and assert all satisfy `validate` (`ok === true`)

- [x] 4. Implement VineJS validators
  - [x] 4.1 Implement auth and admin-user validators
    - Add `app/validators/auth_validators.ts` (login, forgot, reset) and `app/validators/admin_user_validators.ts` (create-admin, change-password), reusing a shared `passwordRule` (`minLength(10)` + letter regex + number regex) so policy failures surface as 422 with offending fields
    - _Requirements: 4.3, 5.7, 6.3, 8.3_

- [x] 5. Implement the MailQueue SQS producer
  - [x] 5.1 Implement `MailQueue.enqueue`
    - Add `app/services/mail_queue.ts` that serializes the `MailMessage` envelope (`password_reset` | `temp_password`) and puts JSON on the foundation SQS queue; source queue URL/region from configuration (SSM/Secrets Manager); never log reset links or temp passwords
    - _Requirements: 5.1, 6.2, 11.3, 11.5_

- [x] 6. Checkpoint - persistence, config, policy, validators, mail producer
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement AuthService
  - [x] 7.1 Implement `login` with rate limiting and forced-change flag
    - In `app/services/auth_service.ts` implement `login(email, password)`: check limiter block first (429 without verifying), verify against active user via `hash.verify`, on success issue a token (expiry now+12h), set `last_login_at`, clear the limiter key, and return `{ token, mustChangePassword }`; on failure increment the limiter and throw a uniform `AuthError` (401); never log/store plaintext
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 4.4_

  - [x] 7.2 Write property test for access-token expiry
    - **Property 3: Access token expiration is exactly 12 hours**
    - **Validates: Requirements 2.2**
    - Use a controllable clock; assert `expiresAt === issuedAt + 12h`

  - [x] 7.3 Write property test for successful login
    - **Property 4: Successful login issues a token and reflects forced-change**
    - **Validates: Requirements 2.1, 2.3, 2.7**
    - Generate active users with known passwords; assert token issued, `last_login_at` set, `mustChangePassword` mirrors stored flag

  - [x] 7.4 Write property test for uniform login failure
    - **Property 5: Uniform login failure**
    - **Validates: Requirements 2.4, 2.5, 2.6**
    - Assert unknown-email, wrong-password, and inactive-user cases return an indistinguishable 401 and issue no token

  - [x] 7.5 Write property test for the login rate-limit threshold
    - **Property 6: Login rate-limit threshold**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
    - Use arbitrary failed-attempt sequences and a controllable clock; assert first four verified, fifth blocks 15 min, blocked requests (even correct ones) return 429 without verification, and a success clears the count

  - [x] 7.6 Implement `forgot`
    - Implement `forgot(email)` in `auth_service.ts`: if an active user matches, create a `password_reset_tokens` row storing only the SHA-256 hash with `expires_at = now + 1h` and enqueue the reset-link email; always return `void` on the same path (enqueue failure logged masked, still uniform success)
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 7.7 Write property test for forgot-password non-disclosure
    - **Property 8: Forgot-password non-disclosure**
    - **Validates: Requirements 5.1, 5.3**
    - Mock the SQS producer; assert identical status/body for matching vs non-matching emails

  - [x] 7.8 Implement `reset`
    - Implement `reset(rawToken, newPassword)` in `auth_service.ts`: look up by `token_hash`; reject expired/used/unrecognized with `TokenError` (400); on a valid token with a compliant password, update `password_hash` and set `used_at` in one transaction; a non-compliant password is rejected (422) without consuming the token
    - _Requirements: 5.4, 5.5, 5.6, 5.7_

  - [x] 7.9 Write property test for reset-token lifecycle
    - **Property 7: Reset token single-use, expiry, and non-consumption on invalid input**
    - **Validates: Requirements 5.2, 5.4, 5.5, 5.6, 5.7**
    - Cover valid/expired/used/policy-fail branches with a controllable clock; assert single-use and non-consumption on 422

  - [x] 7.10 Implement `invalidateAllTokens`
    - Implement `invalidateAllTokens(user)` in `auth_service.ts` deleting all `auth_access_tokens` for the user (used by deactivation)
    - _Requirements: 7.2_

- [x] 8. Implement AdminUserService
  - [x] 8.1 Implement `list` and `get`
    - In `app/services/admin_user_service.ts` implement `list()` and `get(id)` returning the `AdminUserView` projection `{ id, nome, email, role, ativo, last_login_at }`; `get` throws `NotFoundError` (404) for unknown ids
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 8.2 Write property test for admin-user serialization
    - **Property 13: Admin-user responses never expose password_hash**
    - **Validates: Requirements 10.1, 10.2, 10.3**
    - Over arbitrary admin sets, assert every returned object has exactly the six view fields and never `password_hash`

  - [x] 8.3 Implement `create`
    - Implement `create(nome, email)` in `admin_user_service.ts`: reject duplicate email with `DuplicateEmailError` (422); otherwise persist with `ativo = true`, `must_change_password = true`, `role = 'admin'`, generate a compliant `Temporary_Password`, store only its scrypt hash, and enqueue exactly one temp-password email (persist + enqueue atomic)
    - _Requirements: 6.1, 6.2, 6.3, 9.1_

  - [x] 8.4 Write property test for administrator creation invariants
    - **Property 9: Administrator creation invariants**
    - **Validates: Requirements 6.1, 6.2, 6.3, 9.1**
    - Mock the SQS producer; assert defaults, hashed (never plaintext) temp password, exactly one enqueue, and duplicate-email 422 with no new row

  - [x] 8.5 Implement `setActive` with last-active guard and token revocation
    - Implement `setActive(id, ativo)` in `admin_user_service.ts`: within one transaction count active admins; reject a deactivation that would drop the count to zero with `LastActiveAdminError` (422) leaving `ativo` unchanged; otherwise set `ativo`, and on deactivation delete all of that user's access tokens; reactivation sets `ativo = true`
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 8.6 Write property test for the last-active-admin invariant
    - **Property 11: Last-active-admin invariant across (de)activation**
    - **Validates: Requirements 7.1, 7.3, 7.4**
    - Over arbitrary admin sets, assert the active count is never driven below one and that valid de/reactivations succeed

  - [x] 8.7 Write property test for deactivation token revocation
    - **Property 12: Deactivation revokes all tokens**
    - **Validates: Requirements 1.3, 7.2**
    - Over arbitrary token counts, assert deactivation removes all tokens so a later request with a previously-valid token is rejected 401

  - [x] 8.8 Implement `changeOwnPassword`
    - Implement `changeOwnPassword(user, current, next)` in `admin_user_service.ts`: verify `current` against stored hash (422 + unchanged on mismatch), enforce policy on `next` (422 + unchanged on violation), otherwise update `password_hash` and clear `must_change_password`
    - _Requirements: 6.4, 8.1, 8.2, 8.3_

  - [x] 8.9 Write property test for self-service password change
    - **Property 10: Self-service password change**
    - **Validates: Requirements 6.4, 8.1, 8.2, 8.3**
    - Assert correct-current + compliant-new updates hash (old fails, new verifies) and clears the flag; wrong-current or non-compliant-new yields 422 with hash unchanged

- [x] 9. Checkpoint - domain services complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement middleware
  - [x] 10.1 Implement `ForceHttps` middleware
    - Add `app/middleware/force_https_middleware.ts` inspecting `X-Forwarded-Proto`/protocol (trusting the proxy per config) and rejecting non-HTTPS admin traffic (redirect for browsers, 403/400 for API clients)
    - _Requirements: 11.1_

  - [x] 10.2 Implement `EnsureAdminActive` middleware
    - Add `app/middleware/ensure_admin_active_middleware.ts` asserting `auth.user.ativo === true` after the auth guard; otherwise 401
    - _Requirements: 1.3_

  - [x] 10.3 Write example tests for token rejection on admin routes
    - Assert missing-token and expired-token requests to a protected admin route return 401, and that both of two active admins can reach a protected route (no role differentiation)
    - _Requirements: 1.1, 1.2, 9.2_

- [x] 11. Implement log masking
  - [x] 11.1 Implement the log serializer for PII and secrets
    - Add a logger serializer/transform that masks email local parts and redacts `password`, `new_password`, `current_password`, `password_hash`, access-token, and reset-token values; drop those fields from auth request-body logging
    - _Requirements: 11.4, 11.5_

  - [x] 11.2 Write property test for log masking
    - **Property 14: Log masking of PII and secrets**
    - **Validates: Requirements 11.4, 11.5**
    - Over arbitrary payloads containing emails/secrets, assert no unmasked PII or secret is written

- [x] 12. Implement controllers and wire routes
  - [x] 12.1 Implement `AuthController`
    - Add `app/controllers/auth_controller.ts` with `login`/`forgot`/`reset`: validate via VineJS, call `AuthService`, map domain errors to 401/400/422/429, and shape the documented responses (uniform 401, identical forgot 200)
    - _Requirements: 2.1, 2.4, 2.5, 2.6, 2.7, 3.3, 5.3, 5.5, 5.7_

  - [x] 12.2 Implement `MeController`
    - Add `app/controllers/me_controller.ts` with the password-change action: validate, call `AdminUserService.changeOwnPassword`, return 204 on success and 422 on failure
    - _Requirements: 6.4, 8.1, 8.2, 8.3_

  - [x] 12.3 Implement `AdminUsersController`
    - Add `app/controllers/admin_users_controller.ts` with `index`/`show`/`store`/`update`: validate, call `AdminUserService`, return the `AdminUserView` shapes (201 on create, 200 on list/show/update, 404, 422)
    - _Requirements: 6.1, 6.3, 7.1, 7.3, 7.4, 10.1, 10.2, 10.3, 10.4_

  - [x] 12.4 Wire routes and the middleware chain
    - In `start/routes.ts` register `/api/admin/*` routes; apply `ForceHttps` + CORS to all, and the auth guard + `EnsureAdminActive` to everything except `/auth/login`, `/auth/forgot`, `/auth/reset`
    - _Requirements: 1.1, 1.2, 1.3, 11.1, 11.2_

- [x] 13. Example and smoke tests for transport/config criteria
  - [x] 13.1 Write smoke test for the scrypt hash driver
    - Assert the configured hash driver is scrypt and a stored hash differs from the plaintext
    - _Requirements: 4.1_

  - [x] 13.2 Write CORS example tests
    - Assert a preflight from `https://boucheck.beonup.com.br` is allowed and a different origin is denied
    - _Requirements: 11.2_

  - [x] 13.3 Write non-HTTPS rejection example test
    - Assert a non-HTTPS admin request is rejected
    - _Requirements: 11.1_

  - [x] 13.4 Write verify-without-logging example test
    - Assert a login run produces no log line containing the plaintext password (complements Property 14)
    - _Requirements: 4.4_

  - [x] 13.5 Write secrets-sourcing smoke test
    - Assert auth config resolves app key, DB creds, and SQS URL from Secrets Manager/SSM with no committed secret values
    - _Requirements: 11.3_

- [x] 14. Final checkpoint - full suite green
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP; core implementation sub-tasks are never optional.
- Each task references specific requirement sub-clauses for traceability, and every property test task names its design property number.
- Property-based tests use `fast-check` + Japa with a minimum of 100 iterations, tagged with a `// Feature: admin-auth-users, Property {n}` comment; persistence-touching properties run against a real PostgreSQL 16 test DB, pure properties (1, 2, 14) run in-memory, and time-sensitive properties (3, 6, 7) use a controllable clock.
- Requirements 1.4 (frontend redirect on 401) is a frontend behavior outside this backend plan and is verified in the frontend spec/test suite.
- Checkpoints ensure incremental validation at natural integration boundaries.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5", "3.1", "4.1", "5.1", "1.4"] },
    { "id": 2, "tasks": ["3.3", "3.2", "10.1", "10.2", "11.1", "7.1"] },
    { "id": 3, "tasks": ["3.4", "7.6", "8.1", "11.2", "7.2", "7.3", "7.4", "7.5"] },
    { "id": 4, "tasks": ["7.8", "8.3", "7.7", "8.2"] },
    { "id": 5, "tasks": ["7.10", "8.5", "7.9", "8.4"] },
    { "id": 6, "tasks": ["8.8", "8.6", "8.7", "12.1"] },
    { "id": 7, "tasks": ["12.2", "12.3", "8.9", "10.3"] },
    { "id": 8, "tasks": ["12.4"] },
    { "id": 9, "tasks": ["13.1", "13.2", "13.3", "13.4", "13.5"] }
  ]
}
```
