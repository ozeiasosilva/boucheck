# Requirements Document

## Introduction

This document specifies the requirements for the **survey-authoring** spec, which is spec 3 of 7 for the BouCheck platform. It defines the administrative capabilities for authoring surveys: managing surveys and their visual identity, managing the category catalog, authoring questions and their answer options, configuring the checklist catalog, configuring conditional (cascade) navigation rules with acyclic validation, and configuring maturity score ranges.

This spec covers exactly the master requirements **REQ-ADM-002** (survey management), **REQ-ADM-003** (manual question authoring), **REQ-ADM-005** (checklist configuration), and **REQ-ADM-006** (conditional-logic configuration), together with the two survey-configuration concerns that the master document places under reporting — **REQ-REP-001.2** (per-survey maturity score ranges) and **REQ-REP-001.3** (the `dimensao` field on questions) — and the corresponding section 9 admin API contracts for `surveys`, `categories`, `questions`, `options`, `rules`, `checklist-items`, `score-ranges`, and logo upload.

This spec **depends on** two earlier specs and consumes their outputs as-is:
- **foundation-data-model** (spec 1 of 7): all tables and Lucid models used here — `surveys`, `questions`, `question_options`, `question_rules`, `checklist_items`, `score_ranges`, `categories` — and their columns, constraints, ENUM types, and JSONB fields already exist and are **not redefined** here.
- **admin-auth-users** (spec 2 of 7): every endpoint in this spec is an authenticated admin route under `/api/admin`. The authentication guard and the active-administrator enforcement defined by that spec are **assumed to protect these routes and are not redefined** here.

Out of scope for this spec: AI-assisted question generation (REQ-ADM-004, a separate spec), the public respondent flow and the runtime navigation engine (REQ-PUB-*), response management, dashboards, report generation and score calculation execution (REQ-ADM-007, REQ-ADM-008, REQ-REP-*). Specifically, this spec covers the **config-time validation** that guarantees the cascade rule graph is acyclic and forward-only (REQ-ADM-006), while the **runtime navigation engine** that consumes that graph belongs to the public-response-flow spec. Score ranges and the `dimensao` field are configured here but consumed by the reporting spec.

Traceability to the master requirements document is preserved through references to master requirement codes (REQ-ADM-002, REQ-ADM-003, REQ-ADM-005, REQ-ADM-006, REQ-REP-001) throughout.

## Glossary

- **Authenticated_Admin**: An administrator whose request carries a valid access token accepted by the authentication guard defined in the admin-auth-users spec. All routes in this spec require an Authenticated_Admin; the authentication mechanism itself is not defined here.
- **Admin_Route**: A backend route under the `/api/admin` prefix, protected by the authentication guard from the admin-auth-users spec.
- **Survey_Manager**: The backend component that creates, edits, duplicates, archives, versions, and configures the visual identity of surveys.
- **Category_Manager**: The backend component that manages the survey category catalog (`categories`).
- **Question_Manager**: The backend component that manages questions and their answer options for a survey.
- **Checklist_Manager**: The backend component that manages checklist items for a survey and imports checklist catalogs from other surveys.
- **Rule_Manager**: The backend component that configures and validates conditional (cascade) navigation rules on answer options and produces the flow visualization.
- **Score_Range_Manager**: The backend component that manages the maturity score ranges (`score_ranges`) of a survey.
- **Survey**: A questionnaire persisted in the `surveys` table, identified publicly by its `slug`.
- **Slug**: A survey's unique public URL identifier, composed only of lowercase letters, digits, and hyphens.
- **Survey_Status**: The lifecycle value of a survey, one of `rascunho`, `ativo`, `inativo`, or `arquivado`.
- **Structure**: The set of a survey's questions, answer options, cascade rules, and checklist items that together define how the survey is presented and navigated.
- **Survey_Version**: The integer `version` on a survey identifying a snapshot of its Structure; responses persist the `survey_version` they answered against (defined by foundation-data-model).
- **Has_Responses**: The condition that at least one `responses` row references the survey.
- **Choice_Question**: A question whose `tipo` is `escolha_unica` or `multipla_escolha`.
- **Open_Question**: A question whose `tipo` is `aberta`.
- **Cascade_Rule**: A `question_rules` row attached to an answer option that either directs navigation to a later question (`next_question_id`) or terminates the survey early (`finalizar` = `true`).
- **Forward_Reference**: A Cascade_Rule whose `next_question_id` refers to a question whose `ordem` is greater than the `ordem` of the question owning the rule's option.
- **Logo_File**: An image file uploaded as a survey's logo, of type PNG, SVG, or JPG and no larger than 2 MB.
- **Object_Store**: Amazon S3, where logo files are stored, served via CloudFront (REQ-NFR-001.5).
- **Visual_Identity**: The per-survey configuration of `cor_primaria`, `cor_secundaria`, `cor_fundo`, and logo, persisted in the `surveys.config_visual` JSONB column.

## Requirements

### Requirement 1: Create and edit surveys (REQ-ADM-002.1)

**User Story:** As an administrator, I want to create and edit surveys with their descriptive fields, so that each diagnostic questionnaire is configured with a name, URL, category, objective message, estimated time, scheduling link, and notification email.

#### Acceptance Criteria

1. WHEN an Authenticated_Admin submits a survey creation request with a valid `nome`, `slug`, and `categoria`, THE Survey_Manager SHALL create a survey with `status` set to `rascunho` and `version` set to `1`.
2. THE Survey_Manager SHALL persist for each survey the fields `nome`, `slug`, `categoria` (referencing `categories.id`), `mensagem_objetivo`, `tempo_estimado_min`, `status`, `link_agendamento`, and `email_notificacao`.
3. WHEN an Authenticated_Admin submits an edit request for an existing survey with valid field values, THE Survey_Manager SHALL update the addressed fields and persist the change.
4. IF a survey creation or edit request supplies a `mensagem_objetivo` longer than 1000 characters, THEN THE Survey_Manager SHALL reject the request with an HTTP 422 Unprocessable Entity response.
5. IF a survey creation or edit request supplies an `email_notificacao` that is not a valid email address, THEN THE Survey_Manager SHALL reject the request with an HTTP 422 Unprocessable Entity response.
6. THE Survey_Manager SHALL accept `mensagem_objetivo` as rich-text content preserving bold, italic, and list formatting within the 1000-character limit.

### Requirement 2: Slug format and uniqueness (REQ-ADM-002.1)

**User Story:** As an administrator, I want each survey slug validated for format and uniqueness, so that surveys resolve to distinct, well-formed public URLs.

#### Acceptance Criteria

1. THE Survey_Manager SHALL accept a `slug` only when it consists solely of lowercase letters (`a`–`z`), digits (`0`–`9`), and hyphens.
2. IF a survey creation or edit request supplies a `slug` containing any character other than lowercase letters, digits, or hyphens, THEN THE Survey_Manager SHALL reject the request with an HTTP 422 Unprocessable Entity response.
3. IF a survey creation or edit request supplies a `slug` already assigned to a different survey, THEN THE Survey_Manager SHALL reject the request with an HTTP 422 Unprocessable Entity response identifying the slug conflict.

### Requirement 3: Survey status and activation guard (REQ-ADM-002.1, REQ-ADM-002.3)

**User Story:** As an administrator, I want to control a survey's lifecycle status and be prevented from activating an empty survey, so that only usable surveys become publicly available.

#### Acceptance Criteria

1. THE Survey_Manager SHALL constrain `status` to exactly one of `rascunho`, `ativo`, `inativo`, or `arquivado`.
2. IF an Authenticated_Admin requests to set a survey `status` to `ativo` while that survey has zero questions, THEN THE Survey_Manager SHALL reject the request with an HTTP 422 Unprocessable Entity response stating that a survey requires at least one question to be activated.
3. WHEN an Authenticated_Admin requests to set a survey `status` to `ativo` and that survey has at least one question and no invalid Cascade_Rule, THE Survey_Manager SHALL set the survey `status` to `ativo`.

### Requirement 4: Soft archive preserves history (REQ-ADM-002.4)

**User Story:** As an administrator, I want archiving a survey to retain all historical responses and events, so that no respondent data is lost when a survey is retired.

#### Acceptance Criteria

1. WHEN an Authenticated_Admin requests to archive a survey, THE Survey_Manager SHALL set that survey `status` to `arquivado`.
2. WHEN a survey is archived, THE Survey_Manager SHALL retain all `responses`, `response_answers`, `response_checklist`, and `response_events` rows that reference that survey.
3. THE Survey_Manager SHALL archive a survey without deleting any question, option, rule, checklist item, or score range belonging to that survey.

### Requirement 5: Structure versioning for surveys with responses (REQ-ADM-002.5)

**User Story:** As an administrator, I want the survey structure to be versioned when I alter a survey that already has responses, so that existing responses remain interpretable against the structure they answered.

#### Acceptance Criteria

1. WHEN an Authenticated_Admin alters the Structure of a survey whose `status` is `ativo` and that is Has_Responses, THE Survey_Manager SHALL alert the Authenticated_Admin that existing responses reference the previous Structure before applying the change.
2. WHEN an alteration to the Structure of an `ativo` survey that is Has_Responses is confirmed, THE Survey_Manager SHALL increment that survey `version` by 1.
3. WHEN a survey `version` is incremented, THE Survey_Manager SHALL leave existing `responses` rows and their persisted `survey_version` values unchanged, so that historical responses continue to reference the version they answered.
4. WHERE a survey is not Has_Responses, THE Survey_Manager SHALL apply Structure alterations without incrementing `version`.

### Requirement 6: Duplicate a survey (REQ-ADM-002.6)

**User Story:** As an administrator, I want to duplicate an existing survey into a new draft, so that I can reuse an existing structure without rebuilding it.

#### Acceptance Criteria

1. WHEN an Authenticated_Admin requests to duplicate a survey and supplies a new `slug`, THE Survey_Manager SHALL create a new survey with `status` set to `rascunho` and `version` set to `1`.
2. WHEN a survey is duplicated, THE Survey_Manager SHALL copy the source survey's questions, answer options, Cascade_Rules, and checklist items into the new survey.
3. IF a duplication request omits a new `slug` or supplies a `slug` already assigned to another survey, THEN THE Survey_Manager SHALL reject the request with an HTTP 422 Unprocessable Entity response.
4. THE Survey_Manager SHALL copy the source survey's Structure without copying any `responses`, `response_answers`, `response_checklist`, or `response_events` rows.

### Requirement 7: Visual identity configuration (REQ-ADM-002.2)

**User Story:** As an administrator, I want to configure a survey's colors and logo, so that each survey presents its own visual identity.

#### Acceptance Criteria

1. THE Survey_Manager SHALL persist the survey Visual_Identity fields `cor_primaria`, `cor_secundaria`, and `cor_fundo` within the `surveys.config_visual` JSONB column.
2. WHEN an Authenticated_Admin submits Visual_Identity colors for a survey, THE Survey_Manager SHALL store the submitted color values against that survey.
3. IF a submitted color value is not a valid CSS hexadecimal color, THEN THE Survey_Manager SHALL reject the request with an HTTP 422 Unprocessable Entity response.

### Requirement 8: Logo upload (REQ-ADM-002.2)

**User Story:** As an administrator, I want to upload a survey logo image, so that the survey's public pages and report display the correct brand.

#### Acceptance Criteria

1. WHEN an Authenticated_Admin uploads a Logo_File for a survey, THE Survey_Manager SHALL store the file in the Object_Store and record its object key in `surveys.config_visual.logo_s3_key`.
2. IF an uploaded logo file is not of type PNG, SVG, or JPG, THEN THE Survey_Manager SHALL reject the upload with an HTTP 422 Unprocessable Entity response.
3. IF an uploaded logo file is larger than 2 MB, THEN THE Survey_Manager SHALL reject the upload with an HTTP 422 Unprocessable Entity response.
4. THE Survey_Manager SHALL store logo files in a bucket configured with S3 Block Public Access, to be served through CloudFront (REQ-NFR-001.5).

### Requirement 9: Category catalog management (REQ-ADM-002.1)

**User Story:** As an administrator, I want to manage a catalog of survey categories, so that surveys can be classified by a reusable category list.

#### Acceptance Criteria

1. WHEN an Authenticated_Admin submits a category creation request with a `nome`, THE Category_Manager SHALL create a `categories` row with that `nome`.
2. WHEN an Authenticated_Admin submits a category edit request for an existing category with a valid `nome`, THE Category_Manager SHALL update that category `nome`.
3. WHEN an Authenticated_Admin requests the list of categories, THE Category_Manager SHALL return all `categories` rows.
4. IF an Authenticated_Admin requests deletion of a category that is referenced by at least one survey, THEN THE Category_Manager SHALL reject the request with an HTTP 422 Unprocessable Entity response identifying that the category is in use.

### Requirement 10: Question authoring (REQ-ADM-003.1, REQ-REP-001.3)

**User Story:** As an administrator, I want to create, edit, and delete questions within a survey with their type, obligatoriness, weight, and dimension, so that I can compose the diagnostic and support scoring.

#### Acceptance Criteria

1. WHEN an Authenticated_Admin submits a question creation request for a survey with a valid `texto` and `tipo`, THE Question_Manager SHALL create a question associated with that survey.
2. THE Question_Manager SHALL persist for each question the fields `texto`, `descricao`, `tipo`, `obrigatoria`, `ordem`, `peso`, and `dimensao`.
3. THE Question_Manager SHALL constrain `tipo` to exactly one of `escolha_unica`, `multipla_escolha`, or `aberta`.
4. IF a question creation or edit request supplies a `texto` longer than 500 characters, THEN THE Question_Manager SHALL reject the request with an HTTP 422 Unprocessable Entity response.
5. IF a question creation or edit request supplies a `descricao` longer than 300 characters, THEN THE Question_Manager SHALL reject the request with an HTTP 422 Unprocessable Entity response.
6. THE Question_Manager SHALL accept `descricao` as optional and SHALL persist a null `descricao` when none is supplied.
7. THE Question_Manager SHALL accept `peso` as a numeric value.
8. THE Question_Manager SHALL accept `dimensao` as an optional text value used to group questions for per-dimension scoring in the reporting spec (REQ-REP-001.3).

### Requirement 11: Answer options for choice questions (REQ-ADM-003.2)

**User Story:** As an administrator, I want to configure between two and ten scored options for choice questions, so that respondents can select answers that contribute to the score.

#### Acceptance Criteria

1. THE Question_Manager SHALL persist for each answer option the fields `texto`, `pontuacao`, and `ordem`, associated with a Choice_Question.
2. THE Question_Manager SHALL accept `pontuacao` as a numeric value, including zero.
3. IF an Authenticated_Admin requests to activate a survey while any Choice_Question in that survey has fewer than 2 answer options, THEN THE Survey_Manager SHALL reject the activation with an HTTP 422 Unprocessable Entity response identifying the offending question.
4. IF an Authenticated_Admin submits an eleventh answer option for a single Choice_Question, THEN THE Question_Manager SHALL reject the request with an HTTP 422 Unprocessable Entity response stating the maximum of 10 options.
5. THE Question_Manager SHALL reject answer options submitted for an Open_Question with an HTTP 422 Unprocessable Entity response.

### Requirement 12: Question ordering (REQ-ADM-003.1)

**User Story:** As an administrator, I want to reorder questions within a survey, so that the sequence presented to respondents reflects the intended flow.

#### Acceptance Criteria

1. WHEN an Authenticated_Admin submits a reorder request assigning `ordem` values to the questions of a survey, THE Question_Manager SHALL persist the submitted `ordem` value for each addressed question.
2. THE Question_Manager SHALL maintain a distinct `ordem` value for each question within the same survey and version so that the question sequence is unambiguous.

### Requirement 13: Question deletion versus versioning (REQ-ADM-003.3, REQ-ADM-002.5)

**User Story:** As an administrator, I want question deletion to be allowed on drafts but replaced by versioning once responses exist, so that historical responses are never orphaned.

#### Acceptance Criteria

1. WHEN an Authenticated_Admin requests deletion of a question in a survey that is not Has_Responses, THE Question_Manager SHALL delete the question together with its answer options and Cascade_Rules.
2. IF an Authenticated_Admin requests physical deletion of a question in a survey that is Has_Responses, THEN THE Question_Manager SHALL reject the physical deletion and SHALL apply Structure versioning (Requirement 5) instead.

### Requirement 14: Checklist item management (REQ-ADM-005.1, REQ-ADM-005.3)

**User Story:** As an administrator, I want to manage a survey's checklist catalog grouped by type, so that respondents can indicate the services, vendors, and solutions relevant to them.

#### Acceptance Criteria

1. WHEN an Authenticated_Admin submits a checklist item creation request for a survey with a `nome` and a `grupo`, THE Checklist_Manager SHALL create a `checklist_items` row associated with that survey.
2. THE Checklist_Manager SHALL constrain `grupo` to exactly one of `servico_cloud`, `fabricante`, or `solucao`.
3. WHEN an Authenticated_Admin submits a checklist item edit or deletion request, THE Checklist_Manager SHALL apply the change to the addressed `checklist_items` row.
4. THE Checklist_Manager SHALL allow a survey to have zero checklist items as a valid configuration, in which case the public flow presents no checklist step (REQ-ADM-005.3).

### Requirement 15: Import checklist catalog from another survey (REQ-ADM-005.2)

**User Story:** As an administrator, I want to import the checklist catalog from another survey, so that I can reuse a checklist without re-entering every item.

#### Acceptance Criteria

1. WHEN an Authenticated_Admin requests to import the checklist catalog from a source survey into a target survey, THE Checklist_Manager SHALL copy each `checklist_items` row of the source survey as a new checklist item of the target survey preserving `nome` and `grupo`.
2. IF an import request references a source survey that does not exist, THEN THE Checklist_Manager SHALL reject the request with an HTTP 404 Not Found response.
3. THE Checklist_Manager SHALL leave the source survey's checklist items unchanged when performing an import.

### Requirement 16: Conditional-logic rule configuration (REQ-ADM-006.1, REQ-ADM-006.2)

**User Story:** As an administrator, I want to configure per-option navigation rules, so that a respondent's answer can route to a later question or end the survey early.

#### Acceptance Criteria

1. WHEN an Authenticated_Admin configures a Cascade_Rule on an answer option with a `next_question_id` that is a Forward_Reference within the same survey, THE Rule_Manager SHALL persist the rule with that `next_question_id`.
2. WHEN an Authenticated_Admin configures a Cascade_Rule on an answer option with `finalizar` set to `true`, THE Rule_Manager SHALL persist the rule as an early-termination rule with `next_question_id` set to null.
3. THE Rule_Manager SHALL persist a Cascade_Rule only against an answer option of a Choice_Question.

### Requirement 17: Acyclic forward-only rule validation (REQ-ADM-006.3, REQ-PUB-005.5)

**User Story:** As an administrator, I want rules that point backward or to their own question to be rejected at configuration time, so that the navigation graph is guaranteed acyclic and forward-only.

#### Acceptance Criteria

1. IF an Authenticated_Admin configures a Cascade_Rule whose `next_question_id` refers to a question whose `ordem` is less than the `ordem` of the question owning the rule's option, THEN THE Rule_Manager SHALL reject the request with an HTTP 422 Unprocessable Entity response stating that rules must point forward.
2. IF an Authenticated_Admin configures a Cascade_Rule whose `next_question_id` refers to the same question that owns the rule's option, THEN THE Rule_Manager SHALL reject the request with an HTTP 422 Unprocessable Entity response stating that a rule cannot target its own question.
3. THE Rule_Manager SHALL accept a Cascade_Rule configuration only when the resulting set of rules for the survey forms a forward-only graph containing no cycle.

### Requirement 18: Invalid rule destination detection before activation (REQ-ADM-006.4)

**User Story:** As an administrator, I want to be alerted and required to correct rules whose destinations become invalid, so that I cannot activate a survey with broken navigation.

#### Acceptance Criteria

1. WHEN a question that is the `next_question_id` destination of a Cascade_Rule is deleted, THE Rule_Manager SHALL flag every Cascade_Rule referencing the removed destination as invalid.
2. WHEN a question reorder causes a Cascade_Rule to reference a destination that is no longer a Forward_Reference, THE Rule_Manager SHALL flag that Cascade_Rule as invalid.
3. IF an Authenticated_Admin requests to activate a survey while any of its Cascade_Rules is flagged invalid, THEN THE Survey_Manager SHALL reject the activation with an HTTP 422 Unprocessable Entity response identifying the invalid rules and requiring correction.

### Requirement 19: Flow visualization (REQ-ADM-006.5)

**User Story:** As an administrator, I want to see a visualization of the survey's navigation flow, so that I can validate the branching before activating.

#### Acceptance Criteria

1. WHEN an Authenticated_Admin requests the flow visualization of a survey, THE Rule_Manager SHALL return, at minimum, an indented list of questions in `ordem` sequence with each Cascade_Rule shown as a branch to its destination question or as an early termination.
2. THE Rule_Manager SHALL include in the flow visualization each question that has no outgoing Cascade_Rule, presented in its sequential position.

### Requirement 20: Rule priority for multiple-choice conflict (REQ-ADM-006.6, REQ-PUB-005.3)

**User Story:** As an administrator, I want each rule to carry a priority, so that when a multiple-choice answer triggers several rules the resolution order is deterministic.

#### Acceptance Criteria

1. THE Rule_Manager SHALL persist a `priority` integer for each Cascade_Rule.
2. WHEN a Cascade_Rule is created without an explicit `priority`, THE Rule_Manager SHALL set its `priority` to the `ordem` of the rule's owning answer option.
3. THE Rule_Manager SHALL persist the `priority` value such that a lower number denotes higher precedence for the public navigation engine (REQ-PUB-005.3).

### Requirement 21: Maturity score ranges (REQ-REP-001.2)

**User Story:** As an administrator, I want to configure per-survey maturity bands, so that a computed score can be classified into a named range for the report.

#### Acceptance Criteria

1. WHEN an Authenticated_Admin submits a score range creation request for a survey with `nome`, `min`, `max`, `descricao`, and `cor`, THE Score_Range_Manager SHALL create a `score_ranges` row associated with that survey.
2. WHEN an Authenticated_Admin submits a score range edit or deletion request, THE Score_Range_Manager SHALL apply the change to the addressed `score_ranges` row.
3. THE Score_Range_Manager SHALL accept `min` and `max` as numeric values.
4. IF a score range request supplies a `min` greater than its `max`, THEN THE Score_Range_Manager SHALL reject the request with an HTTP 422 Unprocessable Entity response.
5. IF a score range request supplies `min`/`max` bounds that overlap the bounds of an existing score range of the same survey, THEN THE Score_Range_Manager SHALL reject the request with an HTTP 422 Unprocessable Entity response identifying the overlap.
6. IF a score range request supplies a `cor` that is not a valid CSS hexadecimal color, THEN THE Score_Range_Manager SHALL reject the request with an HTTP 422 Unprocessable Entity response.

### Requirement 22: Admin API contracts and authentication (Section 9 admin)

**User Story:** As an administrator, I want authenticated CRUD endpoints for every survey-authoring resource, so that the admin frontend can manage surveys and their structure.

#### Acceptance Criteria

1. THE Survey_Manager SHALL expose create, read, update, duplicate, and archive operations for `surveys` and a logo-upload operation, all under the `/api/admin` prefix.
2. THE Category_Manager SHALL expose create, read, update, and delete operations for `categories` under the `/api/admin` prefix.
3. THE Question_Manager SHALL expose create, read, update, delete, and reorder operations for `questions` and create, read, update, and delete operations for `options`, all under the `/api/admin` prefix.
4. THE Rule_Manager SHALL expose create, read, update, and delete operations for `rules` and a flow-visualization read operation under the `/api/admin` prefix.
5. THE Checklist_Manager SHALL expose create, read, update, delete, and import operations for `checklist-items` under the `/api/admin` prefix.
6. THE Score_Range_Manager SHALL expose create, read, update, and delete operations for `score-ranges` under the `/api/admin` prefix.
7. WHEN a request to any survey-authoring Admin_Route is received without a valid access token, THE Admin_Route SHALL be rejected by the authentication guard defined in the admin-auth-users spec (not redefined here).
