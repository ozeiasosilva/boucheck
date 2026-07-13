# Requirements Document

## Introduction

This document specifies the requirements for the **ai-question-generation** spec, which is spec 4 of 7 for the BouCheck platform. It defines the administrative capability to generate an initial set of survey questions with the help of a generative AI model (Amazon Bedrock, Claude), starting from a theme supplied by the administrator, so that survey creation is accelerated.

This spec covers exactly the master requirement **REQ-ADM-004** (AI-assisted question generation) and the associated section 9 admin API contract `POST /api/admin/surveys/{id}/ai/generate-questions` (preview, does not persist). It also incorporates the section 11 risk #2 cost-mitigation controls that apply to generation: the cap of 20 questions per generation and the token logging that feeds cost auditing.

This spec **depends on** three earlier specs and consumes their outputs as-is:
- **foundation-data-model** (spec 1 of 7): the `ai_generation_logs` table (columns `admin_user_id`, `survey_id`, `prompt`, `resultado`, `tokens_input`, `tokens_output`, `sucesso`, `created_at`) and the `questions` and `question_options` models already exist and are **not redefined** here.
- **admin-auth-users** (spec 2 of 7): every endpoint in this spec is an authenticated admin route under `/api/admin`. The authentication guard and active-administrator enforcement defined by that spec are **assumed to protect these routes and are not redefined** here.
- **survey-authoring** (spec 3 of 7): the persistence paths for questions and their answer options. Generated questions, once edited and explicitly confirmed by the administrator, are saved through the same authoring paths defined in that spec. Those persistence rules, validations, and endpoints are **not redefined** here.

Out of scope for this spec: the report-generation AI (`usar_ia_no_relatorio`, a reporting-spec concern), manual question CRUD and answer-option persistence (survey-authoring spec), the public respondent flow, response management, and the dashboard.

Traceability to the master requirements document is preserved through references to the master requirement code REQ-ADM-004 and section 11 risk #2 throughout.

## Glossary

- **Authenticated_Admin**: An administrator whose request carries a valid access token accepted by the authentication guard defined in the admin-auth-users spec. All routes in this spec require an Authenticated_Admin; the authentication mechanism itself is not defined here.
- **Admin_Route**: A backend route under the `/api/admin` prefix, protected by the authentication guard from the admin-auth-users spec.
- **Question_Generator**: The backend component that assembles the generation prompt, invokes the AI Model, validates and parses the AI response, records the audit log, and returns the generated questions for preview. Exposed at `POST /api/admin/surveys/{id}/ai/generate-questions`.
- **AI_Model**: Amazon Bedrock running Claude (the latest Sonnet model available in the account), invoked by the Question_Generator to produce candidate questions.
- **Generation_Request**: The set of inputs an Authenticated_Admin submits to start a generation: `tema` (free-text theme/context), `quantidade` (desired number of questions), `tipos_permitidos` (the allowed question types), and `publico_alvo` (free-text target audience).
- **Allowed_Type**: A question type the administrator permits in a Generation_Request, each one of `escolha_unica`, `multipla_escolha`, or `aberta`.
- **Structured_Prompt**: The prompt the Question_Generator sends to the AI Model that carries the Generation_Request inputs and instructs the AI Model to respond exclusively with JSON matching the Generated_Questions_Schema.
- **Generated_Questions_Schema**: The required JSON structure of the AI response: an array of objects, each object having `texto` (string), `tipo` (one of `escolha_unica`, `multipla_escolha`, `aberta`), `obrigatoria` (boolean), and `opcoes` (an array of objects, each with `texto` (string) and `pontuacao` (number)).
- **Conforming_Response**: An AI Model response that parses as JSON and matches the Generated_Questions_Schema with all structural and type constraints satisfied.
- **Non_Conforming_Response**: An AI Model response that is not valid JSON or does not match the Generated_Questions_Schema.
- **Generated_Question**: A single question object produced by a Conforming_Response, presented to the administrator for review.
- **Preview**: The editable review presentation of the Generated_Questions in which the administrator can edit, delete, or accept each Generated_Question before any persistence.
- **Confirmation**: The explicit action by which an Authenticated_Admin accepts the reviewed questions so they are persisted through the survey-authoring persistence paths.
- **Correction_Retry**: A single additional invocation of the AI Model, following a Non_Conforming_Response, whose Structured_Prompt is augmented with an instruction to correct the response to match the Generated_Questions_Schema.
- **Generation_Log**: An `ai_generation_logs` row recording one generation attempt, defined by the foundation-data-model spec and not redefined here.
- **Persist_Endpoint**: The `POST /api/admin/surveys/{id}/ai/confirm-questions` endpoint that persists confirmed questions from a Preview into the survey through the survey-authoring persistence paths.

## Requirements

### Requirement 1: AI generation request form (REQ-ADM-004.1)

**User Story:** As an administrator, I want a "Gerar perguntas com IA" action in the survey editor with a request form, so that I can describe the questions I want the AI to generate.

#### Acceptance Criteria

1. THE Question_Generator SHALL expose a "Gerar perguntas com IA" action in the survey editor that presents a Generation_Request form with the fields `tema`, `quantidade`, `tipos_permitidos`, and `publico_alvo`.
2. THE Question_Generator SHALL accept `tema` as free text with a minimum length of 1 character and a maximum length of 2000 characters.
3. THE Question_Generator SHALL accept `publico_alvo` as free text with a maximum length of 500 characters.
4. THE Question_Generator SHALL accept `tipos_permitidos` as a non-empty set whose members are each an Allowed_Type (`escolha_unica`, `multipla_escolha`, or `aberta`).
5. IF a Generation_Request supplies a `tipos_permitidos` member that is not one of `escolha_unica`, `multipla_escolha`, or `aberta`, THEN THE Question_Generator SHALL reject the request with an HTTP 422 Unprocessable Entity response.
6. IF a Generation_Request omits `tema` or supplies an empty `tema`, THEN THE Question_Generator SHALL reject the request with an HTTP 422 Unprocessable Entity response.
7. IF a Generation_Request supplies an empty `tipos_permitidos` set, THEN THE Question_Generator SHALL reject the request with an HTTP 422 Unprocessable Entity response.

### Requirement 2: Requested quantity bounds (REQ-ADM-004.1, Section 11 risk #2)

**User Story:** As an administrator, I want the requested number of questions constrained to a bounded range, so that a single generation stays useful and Bedrock cost stays controlled.

#### Acceptance Criteria

1. THE Question_Generator SHALL accept `quantidade` only as an integer from 1 to 20 inclusive.
2. IF a Generation_Request supplies a `quantidade` less than 1 or greater than 20, THEN THE Question_Generator SHALL reject the request with an HTTP 422 Unprocessable Entity response stating that between 1 and 20 questions may be generated per request.
3. IF a Generation_Request supplies a `quantidade` that is not an integer, THEN THE Question_Generator SHALL reject the request with an HTTP 422 Unprocessable Entity response.

### Requirement 3: Structured prompt engineering and Bedrock invocation (REQ-ADM-004.2)

**User Story:** As an administrator, I want the AI called with a structured prompt that forces a JSON-only answer in a known schema, so that the generated questions can be parsed reliably.

#### Acceptance Criteria

1. WHEN an Authenticated_Admin submits a valid Generation_Request, THE Question_Generator SHALL invoke the AI Model with a Structured_Prompt that carries the `tema`, `quantidade`, `tipos_permitidos`, and `publico_alvo` inputs.
2. THE Structured_Prompt SHALL instruct the AI Model to respond exclusively with a JSON array matching the Generated_Questions_Schema, with no additional text, markdown, or commentary outside the JSON.
3. THE Structured_Prompt SHALL instruct the AI Model to produce exactly the number of Generated_Questions specified by the `quantidade` value of the Generation_Request.
4. THE Structured_Prompt SHALL instruct the AI Model to use only the question types present in the `tipos_permitidos` set for the generated questions.
5. THE Structured_Prompt SHALL instruct the AI Model that questions of type `aberta` must have an empty `opcoes` array and that questions of type `escolha_unica` or `multipla_escolha` must have between 2 and 10 options with numeric `pontuacao` values.
6. THE Question_Generator SHALL invoke the AI Model via the Amazon Bedrock InvokeModel API using the Claude Sonnet model identifier configured in the application environment.

### Requirement 4: Response parsing and schema validation (REQ-ADM-004.2)

**User Story:** As an administrator, I want the AI response validated against the expected schema, so that only well-formed questions reach the preview.

#### Acceptance Criteria

1. WHEN the AI Model returns a response, THE Question_Generator SHALL attempt to parse the response body as JSON.
2. WHEN the JSON parses successfully, THE Question_Generator SHALL validate that the parsed value is an array of objects conforming to the Generated_Questions_Schema.
3. THE Question_Generator SHALL verify that each object in the array contains `texto` as a non-empty string, `tipo` as one of `escolha_unica`, `multipla_escolha`, or `aberta`, `obrigatoria` as a boolean, and `opcoes` as an array.
4. THE Question_Generator SHALL verify that objects with `tipo` of `escolha_unica` or `multipla_escolha` contain between 2 and 10 items in `opcoes`, each with `texto` as a non-empty string and `pontuacao` as a number.
5. THE Question_Generator SHALL verify that objects with `tipo` of `aberta` contain an empty `opcoes` array.
6. WHEN all validation checks pass, THE Question_Generator SHALL classify the response as a Conforming_Response and return the Generated_Questions for Preview.
7. WHEN any validation check fails, THE Question_Generator SHALL classify the response as a Non_Conforming_Response and proceed to the Correction_Retry flow.

### Requirement 5: Editable preview before persistence (REQ-ADM-004.3)

**User Story:** As an administrator, I want the generated questions shown in an editable preview that I must explicitly confirm, so that nothing is saved without my review.

#### Acceptance Criteria

1. WHEN the Question_Generator parses a Conforming_Response into Generated_Questions, THE Question_Generator SHALL return the Generated_Questions for Preview without persisting any question or answer option.
2. THE Preview SHALL allow an Authenticated_Admin to edit the `texto`, `tipo`, `obrigatoria`, and `opcoes` of each Generated_Question individually.
3. THE Preview SHALL allow an Authenticated_Admin to delete individual Generated_Questions from the list.
4. WHILE the Authenticated_Admin has not performed a Confirmation, THE Question_Generator SHALL persist no Generated_Question and no answer option.
5. WHEN an Authenticated_Admin performs a Confirmation on the reviewed questions, THE Persist_Endpoint SHALL persist the confirmed questions and their answer options through the survey-authoring persistence paths (survey-authoring spec).
6. WHEN the Authenticated_Admin performs a Confirmation with an empty list of questions, THE Persist_Endpoint SHALL return a successful response without persisting any question.

### Requirement 6: Non-conforming response handling with retry (REQ-ADM-004.4)

**User Story:** As an administrator, I want one automatic correction attempt when the AI returns malformed output and a friendly error if it still fails, so that a bad AI response never breaks the editor.

#### Acceptance Criteria

1. WHEN the AI Model returns a Non_Conforming_Response, THE Question_Generator SHALL issue exactly one Correction_Retry with a Structured_Prompt augmented by an instruction that the previous response was invalid and must be corrected to match the Generated_Questions_Schema.
2. THE Correction_Retry Structured_Prompt SHALL include the original Generation_Request inputs and the schema definition so the AI Model can produce a correct response.
3. WHEN the Correction_Retry returns a Conforming_Response, THE Question_Generator SHALL parse that response into Generated_Questions and return them for Preview.
4. IF the Correction_Retry also returns a Non_Conforming_Response, THEN THE Question_Generator SHALL return an HTTP 422 Unprocessable Entity response carrying a user-friendly error message explaining that the questions could not be generated and suggesting the administrator try again.
5. WHEN a generation attempt fails after the Correction_Retry, THE Question_Generator SHALL leave the survey editor operational with no question or answer option persisted from that attempt.

### Requirement 7: Timeout and asynchronous execution (REQ-ADM-004.5)

**User Story:** As an administrator, I want the Bedrock call bounded by a timeout and run asynchronously with a loading state, so that the editor stays responsive during generation.

#### Acceptance Criteria

1. THE Question_Generator SHALL apply a timeout of 60 seconds to each AI Model invocation (including both the initial invocation and the Correction_Retry, each independently).
2. IF the AI Model invocation does not return within 60 seconds, THEN THE Question_Generator SHALL abort that invocation and return an HTTP 504 Gateway Timeout response carrying an administrator-facing timeout message.
3. WHILE a generation attempt is in progress, THE survey editor SHALL present a loading state indicating that questions are being generated.
4. WHILE a generation attempt is in progress, THE survey editor SHALL remain usable for other editing actions outside the generation flow.

### Requirement 8: Internal audit logging for cost tracking (REQ-ADM-004.6, Section 11 risk #2)

**User Story:** As an administrator, I want each generation attempt logged with user, survey, prompt, tokens, and result, so that Bedrock usage can be audited for cost.

#### Acceptance Criteria

1. WHEN a generation attempt completes (whether successful or failed), THE Question_Generator SHALL create a Generation_Log recording the requesting Authenticated_Admin (`admin_user_id`), the survey (`survey_id`), the Structured_Prompt sent (`prompt`), and the outcome (`sucesso`).
2. WHERE the AI Model response reports consumed token counts, THE Question_Generator SHALL record the input token count in `tokens_input` and the output token count in `tokens_output` of the Generation_Log.
3. WHERE the AI Model response does not report consumed token counts, THE Question_Generator SHALL record `tokens_input` and `tokens_output` as null in the Generation_Log.
4. WHEN a generation attempt yields a Conforming_Response (including after a Correction_Retry), THE Question_Generator SHALL record the generated result in the `resultado` field of the Generation_Log and set `sucesso` to true.
5. WHEN a generation attempt fails after the Correction_Retry, THE Question_Generator SHALL set `sucesso` to false in the Generation_Log and record the Non_Conforming_Response body in `resultado` for debugging.
6. THE Question_Generator SHALL record the Generation_Log regardless of whether the failure was a timeout, a Non_Conforming_Response, or an infrastructure error from Amazon Bedrock.

### Requirement 9: Generation and confirmation API contracts (Section 9 admin, REQ-ADM-004)

**User Story:** As an administrator, I want authenticated preview-only and confirm endpoints for AI question generation, so that the admin frontend can request generated questions and persist them in two separate steps.

#### Acceptance Criteria

1. THE Question_Generator SHALL expose the generation operation as `POST /api/admin/surveys/{id}/ai/generate-questions` under the `/api/admin` prefix.
2. WHEN the `POST /api/admin/surveys/{id}/ai/generate-questions` operation succeeds, THE Question_Generator SHALL return the Generated_Questions as a preview payload (JSON array) and SHALL persist no question or answer option.
3. THE Persist_Endpoint SHALL be exposed as `POST /api/admin/surveys/{id}/ai/confirm-questions` under the `/api/admin` prefix.
4. WHEN the `POST /api/admin/surveys/{id}/ai/confirm-questions` receives a valid array of confirmed questions, THE Persist_Endpoint SHALL persist the questions and their answer options into the survey through the survey-authoring persistence paths.
5. IF the `{id}` path parameter in either endpoint refers to a survey that does not exist, THEN THE endpoint SHALL return an HTTP 404 Not Found response.
6. WHEN a request to either endpoint is received without a valid access token, THE Admin_Route SHALL be rejected by the authentication guard defined in the admin-auth-users spec (not redefined here).
