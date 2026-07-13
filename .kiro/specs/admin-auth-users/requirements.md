# Requirements Document

## Introduction

This document specifies the requirements for the **admin-auth-users** spec, which is spec 2 of 7 for the BouCheck platform. It defines administrator authentication and administrator user management for the administrative area of the platform.

This spec covers exactly two master requirements: **REQ-ADM-001** (administrator authentication) and **REQ-ADM-009** (administrator user management), together with the section 9 admin authentication and admin-user API contracts, and the subset of **REQ-NFR-002** (security) that applies to authentication and credential handling.

This spec **depends on** the `foundation-data-model` spec (spec 1 of 7), which already defines the `admin_users` table and the `AdminUser` Lucid model. Those persistence structures are **consumed as-is** and are explicitly **not redefined** here. The `admin_users` schema provided by the foundation spec includes: `id`, `nome`, `email` (UNIQUE), `password_hash`, `role` (default `admin`), `ativo` (boolean, default `true`), `must_change_password` (boolean, default `false`), `last_login_at` (nullable), `created_at`, and `updated_at`. Where this spec requires additional persistence not present in the foundation schema (for example, password-reset tokens and login-attempt tracking), those structures are called out as new persistence introduced by this spec.

Out of scope for this spec: survey authoring (REQ-ADM-002 through REQ-ADM-006), the public respondent flow (REQ-PUB-*), response management and dashboards (REQ-ADM-007, REQ-ADM-008), and reporting (REQ-REP-*). Traceability to the master requirements document is preserved through references to master requirement codes (REQ-ADM-001, REQ-ADM-009, REQ-NFR-002) throughout.

## Glossary

- **Auth_Service**: The backend component responsible for administrator authentication — credential verification, access token issuance, session validation, and the forgot/reset password flow.
- **Admin_User**: An authenticated user of the administrative area, persisted as a row in the `admin_users` table defined by the foundation-data-model spec.
- **Access_Token**: An AdonisJS access token issued to an Admin_User upon successful login, used to authenticate subsequent requests to admin routes.
- **Admin_Route**: Any backend route under the `/api/admin` prefix (excluding the unauthenticated authentication endpoints `/api/admin/auth/login`, `/api/admin/auth/forgot`, and `/api/admin/auth/reset`) that requires a valid Access_Token.
- **Reset_Token**: A single-use, time-limited token issued during the forgot-password flow that authorizes a password reset. This is new persistence introduced by this spec (a `password_reset_tokens` structure), as the foundation schema does not define it.
- **Login_Attempt_Record**: The per-email tracking of failed login attempts used to enforce login rate limiting. This is new persistence or cache state introduced by this spec.
- **Password_Policy**: The rule that a password must contain at least 10 characters, including at least one letter and at least one number.
- **Admin_User_Management**: The backend component responsible for creating, deactivating, and reactivating administrators, and for the self-service password change.
- **Temporary_Password**: A system-generated password created when an administrator is created, emailed to the new administrator, and requiring a forced change on first login (`must_change_password` set to `true`).
- **Last_Active_Admin**: The state in which exactly one Admin_User has `ativo` set to `true`.
- **PII**: Personal data of an administrator, specifically email address, used for masking in application logs (REQ-NFR-002.6).
- **Frontend_Origin**: The configured domain of the BouCheck frontend (`boucheck.beonup.com.br`), the only origin permitted by CORS (REQ-NFR-002.3).
- **Secrets_Store**: AWS Secrets Manager or AWS SSM Parameter Store, where application secrets are held (REQ-NFR-002.5).

## Requirements

### Requirement 1: Protection of admin routes (REQ-ADM-001.1)

**User Story:** As an administrator, I want unauthenticated access to admin routes to be redirected to login, so that the administrative area is only reachable by authenticated users.

#### Acceptance Criteria

1. WHEN a request to an Admin_Route is received without a valid Access_Token, THE Auth_Service SHALL reject the request with an HTTP 401 Unauthorized response.
2. WHEN a request to an Admin_Route is received with an expired Access_Token, THE Auth_Service SHALL reject the request with an HTTP 401 Unauthorized response.
3. WHEN a request to an Admin_Route is received with an Access_Token belonging to an Admin_User whose `ativo` is `false`, THE Auth_Service SHALL reject the request with an HTTP 401 Unauthorized response.
4. WHEN the frontend receives an HTTP 401 Unauthorized response for an Admin_Route, THE frontend SHALL redirect the user to the login screen.

### Requirement 2: Administrator login and access token issuance (REQ-ADM-001.2)

**User Story:** As an administrator, I want to log in with my email and password, so that I receive an access token for the administrative area.

#### Acceptance Criteria

1. WHEN a `POST /api/admin/auth/login` request is received with an email and password that match an active Admin_User, THE Auth_Service SHALL issue an Access_Token and return it in the response.
2. THE Auth_Service SHALL set the expiration of each issued Access_Token to 12 hours after issuance.
3. WHEN an Access_Token is successfully issued during login, THE Auth_Service SHALL set the `last_login_at` value of the authenticated Admin_User to the login timestamp.
4. IF a `POST /api/admin/auth/login` request is received with an email that does not match any Admin_User, THEN THE Auth_Service SHALL return an HTTP 401 Unauthorized response.
5. IF a `POST /api/admin/auth/login` request is received with a password that does not match the stored `password_hash` of the identified Admin_User, THEN THE Auth_Service SHALL return an HTTP 401 Unauthorized response.
6. IF a `POST /api/admin/auth/login` request is received with credentials that match an Admin_User whose `ativo` is `false`, THEN THE Auth_Service SHALL return an HTTP 401 Unauthorized response.
7. WHEN login succeeds for an Admin_User whose `must_change_password` is `true`, THE Auth_Service SHALL include in the login response an indication that a password change is required before further admin actions.

### Requirement 3: Login rate limiting (REQ-ADM-001.3)

**User Story:** As a platform operator, I want repeated failed logins to be blocked, so that brute-force attacks against administrator accounts are mitigated.

#### Acceptance Criteria

1. WHEN a `POST /api/admin/auth/login` request fails credential verification, THE Auth_Service SHALL record a failed Login_Attempt_Record associated with the submitted email and the attempt timestamp.
2. WHEN a fifth failed login attempt for the same email occurs within a 15-minute window, THE Auth_Service SHALL block further login attempts for that email for 15 minutes.
3. WHILE an email is within an active 15-minute block, THE Auth_Service SHALL reject `POST /api/admin/auth/login` requests for that email with an HTTP 429 Too Many Requests response without performing credential verification.
4. WHEN a login attempt for an email succeeds, THE Auth_Service SHALL clear the failed Login_Attempt_Record count for that email.

### Requirement 4: Password policy and hashing (REQ-ADM-001.4)

**User Story:** As a platform operator, I want passwords stored securely and to meet a minimum strength, so that administrator credentials are protected.

#### Acceptance Criteria

1. THE Auth_Service SHALL store administrator passwords in the `admin_users.password_hash` column hashed with the scrypt algorithm (the AdonisJS default hashing driver).
2. WHEN a password is accepted for storage, THE Auth_Service SHALL enforce the Password_Policy: at least 10 characters, including at least one letter and at least one number.
3. IF a submitted password does not satisfy the Password_Policy, THEN THE Auth_Service SHALL reject the request with an HTTP 422 Unprocessable Entity response identifying the unmet policy criteria.
4. THE Auth_Service SHALL verify a submitted login password against the stored `password_hash` without storing or logging the plaintext password.

### Requirement 5: Forgot and reset password flow (REQ-ADM-001.5)

**User Story:** As an administrator, I want to reset my password by email when I forget it, so that I can regain access without contacting another administrator.

#### Acceptance Criteria

1. WHEN a `POST /api/admin/auth/forgot` request is received with the email of an active Admin_User, THE Auth_Service SHALL generate a Reset_Token for that Admin_User and enqueue an email containing the reset link to that email address.
2. THE Auth_Service SHALL set the validity of each generated Reset_Token to 1 hour after issuance.
3. WHEN a `POST /api/admin/auth/forgot` request is received with an email that does not match any active Admin_User, THE Auth_Service SHALL return the same success response as for a matching email so that account existence is not disclosed.
4. WHEN a `POST /api/admin/auth/reset` request is received with a valid, unexpired, unused Reset_Token and a new password satisfying the Password_Policy, THE Auth_Service SHALL update the associated Admin_User `password_hash` and mark the Reset_Token as used.
5. IF a `POST /api/admin/auth/reset` request is received with a Reset_Token that is expired, previously used, or unrecognized, THEN THE Auth_Service SHALL reject the request with an HTTP 400 Bad Request response.
6. WHEN a Reset_Token is successfully used to reset a password, THE Auth_Service SHALL reject any subsequent reset request presenting that same Reset_Token (single use).
7. IF a `POST /api/admin/auth/reset` request presents a new password that does not satisfy the Password_Policy, THEN THE Auth_Service SHALL reject the request with an HTTP 422 Unprocessable Entity response and SHALL NOT mark the Reset_Token as used.

### Requirement 6: Create administrator (REQ-ADM-009.1)

**User Story:** As an administrator, I want to create a new administrator with a temporary password emailed to them, so that new team members can access the administrative area and set their own password.

#### Acceptance Criteria

1. WHEN a `POST /api/admin/admin-users` request is received from an authenticated Admin_User with a name and email, THE Admin_User_Management SHALL create a new Admin_User with `ativo` set to `true` and `must_change_password` set to `true`.
2. WHEN a new Admin_User is created, THE Admin_User_Management SHALL generate a Temporary_Password satisfying the Password_Policy, store its scrypt hash in `password_hash`, and enqueue an email containing the Temporary_Password to the new Admin_User email address.
3. IF a `POST /api/admin/admin-users` request is received with an email that already matches an existing Admin_User, THEN THE Admin_User_Management SHALL reject the request with an HTTP 422 Unprocessable Entity response.
4. WHEN an Admin_User whose `must_change_password` is `true` completes a self-service password change, THE Admin_User_Management SHALL set that Admin_User `must_change_password` to `false`.

### Requirement 7: Deactivate and reactivate administrator (REQ-ADM-009.1, REQ-ADM-009.3, REQ-ADM-009.4)

**User Story:** As an administrator, I want to deactivate and reactivate administrators, so that I can control who has access without deleting accounts, while preventing lockout of the last active administrator.

#### Acceptance Criteria

1. WHEN a `PUT /api/admin/admin-users/{id}` request that deactivates an Admin_User is received, THE Admin_User_Management SHALL set that Admin_User `ativo` to `false`.
2. WHEN an Admin_User is deactivated, THE Auth_Service SHALL invalidate all Access_Tokens belonging to that Admin_User immediately.
3. IF a request to deactivate an Admin_User would result in the Last_Active_Admin having `ativo` set to `false`, THEN THE Admin_User_Management SHALL reject the request with an HTTP 422 Unprocessable Entity response and SHALL leave that Admin_User `ativo` unchanged.
4. WHEN a `PUT /api/admin/admin-users/{id}` request that reactivates a deactivated Admin_User is received, THE Admin_User_Management SHALL set that Admin_User `ativo` to `true`.

### Requirement 8: Self-service password change (REQ-ADM-009.2)

**User Story:** As a logged-in administrator, I want to change my own password by providing my current password, so that I can maintain my credentials securely.

#### Acceptance Criteria

1. WHEN a `PUT /api/admin/me/password` request is received from an authenticated Admin_User with a current password that matches the stored `password_hash` and a new password satisfying the Password_Policy, THE Admin_User_Management SHALL update that Admin_User `password_hash` with the scrypt hash of the new password.
2. IF a `PUT /api/admin/me/password` request is received with a current password that does not match the stored `password_hash`, THEN THE Admin_User_Management SHALL reject the request with an HTTP 422 Unprocessable Entity response and SHALL leave the `password_hash` unchanged.
3. IF a `PUT /api/admin/me/password` request is received with a new password that does not satisfy the Password_Policy, THEN THE Admin_User_Management SHALL reject the request with an HTTP 422 Unprocessable Entity response and SHALL leave the `password_hash` unchanged.

### Requirement 9: Administrator role field (REQ-ADM-009.5)

**User Story:** As a developer, I want administrators to carry a role field defaulting to a single role, so that future role-based access can be added without a schema change.

#### Acceptance Criteria

1. WHEN a new Admin_User is created, THE Admin_User_Management SHALL assign the `role` value `admin`.
2. THE Auth_Service SHALL grant every active Admin_User full access to Admin_Routes in v1, without differentiating access by `role` value.

### Requirement 10: Admin-user listing and retrieval (Section 9 admin-users CRUD)

**User Story:** As an administrator, I want to list and view administrator accounts, so that I can manage the administrator team.

#### Acceptance Criteria

1. WHEN a `GET /api/admin/admin-users` request is received from an authenticated Admin_User, THE Admin_User_Management SHALL return the list of Admin_Users including `id`, `nome`, `email`, `role`, `ativo`, and `last_login_at` for each.
2. WHEN a `GET /api/admin/admin-users/{id}` request is received from an authenticated Admin_User for an existing Admin_User, THE Admin_User_Management SHALL return that Admin_User `id`, `nome`, `email`, `role`, `ativo`, and `last_login_at`.
3. THE Admin_User_Management SHALL exclude `password_hash` from every admin-user API response.
4. IF a `GET /api/admin/admin-users/{id}` request references an identifier that does not match any Admin_User, THEN THE Admin_User_Management SHALL return an HTTP 404 Not Found response.

### Requirement 11: Transport, CORS, and secret handling security (REQ-NFR-002)

**User Story:** As a platform operator, I want authentication traffic and secrets protected, so that credentials and personal data are not exposed.

#### Acceptance Criteria

1. THE Auth_Service SHALL require HTTPS for all authentication and admin-user routes (REQ-NFR-002.1).
2. THE Auth_Service SHALL restrict CORS for admin routes to the Frontend_Origin (REQ-NFR-002.3).
3. THE Auth_Service SHALL read authentication-related secrets from the Secrets_Store rather than from committed environment values (REQ-NFR-002.5).
4. WHERE an application log entry would contain administrator PII, THE Auth_Service SHALL mask the email address before writing the log entry (REQ-NFR-002.6).
5. THE Auth_Service SHALL exclude administrator passwords, `password_hash` values, Access_Tokens, and Reset_Tokens from application log entries.
