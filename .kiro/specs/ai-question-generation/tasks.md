# Implementation Plan: AI Question Generation

## Overview

Implement the `POST /api/admin/surveys/{id}/ai/generate-questions` preview endpoint and `POST /api/admin/surveys/{id}/ai/confirm-questions` persistence endpoint following the established AdonisJS 6 controller → service → validator layering. The implementation starts with pure support modules (PromptBuilder, ResponseParser, BedrockClient), then validators, then the orchestrating service, and finally the controller/routes — wiring everything together with audit logging and error handling.

## Tasks

- [x] 1. Create support modules (pure/isolated)
  - [x] 1.1 Implement PromptBuilder (`backend/app/support/prompt_builder.ts`)
    - Create `PromptBuilder` class with static `build(req: GenerationRequest): PromptPair` method
    - Implement the exact system prompt template (JSON-only, schema definition, tipo constraints, quantity instruction)
    - Implement the exact user prompt template carrying `tema`, `publico_alvo`, `quantidade`, `tipos_permitidos`
    - Create static `buildCorrection(req: GenerationRequest, priorRaw: string): PromptPair` method
    - Correction prompt prepends the "ATENÇÃO" correction instruction and includes truncated `priorRaw` (max 500 chars)
    - Export `PromptPair` interface (`{ system: string; user: string }`)
    - _Requirements: 3.1, 3.2, 3.5, 6.1, 6.2_

  - [x] 1.2 Implement ResponseParser (`backend/app/support/response_parser.ts`)
    - Create `ResponseParser` class with static `parse(raw: string): ParseOutcome` method
    - Implement JSON extraction: trim input, strip ` ```json ` / ` ``` ` fences, slice from first `[` to matching last `]` when surrounded by prose
    - Run `JSON.parse` on the extracted substring; catch errors → `non_conforming`
    - Validate parsed value against `Generated_Questions_Schema` (VineJS compiled schema)
    - Return `{ kind: 'conforming', questions }` on success or `{ kind: 'non_conforming', reason }` on failure
    - Export `ParseOutcome` type
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 1.3 Implement BedrockClient (`backend/app/support/bedrock_client.ts`)
    - Create `BedrockClient` class accepting config (`modelId`, `region`, `timeoutMs`)
    - Implement `invoke(system: string, user: string): Promise<BedrockInvokeResult>` using `@aws-sdk/client-bedrock-runtime` `InvokeModelCommand`
    - Wire `AbortController` with 60s timeout; on abort throw `BedrockTimeoutError`
    - Parse response body for `usage.input_tokens` / `usage.output_tokens` (null when absent)
    - Throw `BedrockInvocationError` for SDK/network errors
    - Export `BedrockInvokeResult`, `BedrockTimeoutError`, `BedrockInvocationError`
    - _Requirements: 3.6, 7.1, 7.2, 7.3_

  - [x] 1.4 Create Bedrock config (`backend/config/bedrock.ts`)
    - Export config object reading `BEDROCK_MODEL_ID`, `BEDROCK_REGION` (default `sa-east-1`), and `BEDROCK_TIMEOUT_MS` (default `60000`) from env
    - _Requirements: 3.6, 7.1_

- [x] 2. Create validators
  - [x] 2.1 Implement `generateQuestionsValidator` and `confirmQuestionsValidator` (`backend/app/validators/ai_question_validators.ts`)
    - Define `ALLOWED_TYPES` constant: `['escolha_unica', 'multipla_escolha', 'aberta']`
    - Compile `generateQuestionsValidator` with VineJS: `tema` (string, trim, minLength 1, maxLength 2000), `quantidade` (number, withoutDecimals, min 1, max 20 with custom message), `tipos_permitidos` (array of enum, minLength 1, distinct), `publico_alvo` (string, trim, maxLength 500, minLength 1)
    - Compile `Generated_Questions_Schema` with VineJS: array of objects with `texto`, `tipo`, `obrigatoria`, `opcoes` matching the design schema
    - Compile `confirmQuestionsValidator`: array of question objects matching `Generated_Questions_Schema`
    - Export `GenerationRequest` and `GeneratedQuestion` TypeScript types
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 2.2 Write property test for request validation (Property 1)
    - **Property 1: Request validation correctness**
    - Generate arbitrary candidate requests with valid/invalid `tema` (empty, whitespace, 1–2000 chars), `quantidade` (integers in/out of [1,20], non-integers), `tipos_permitidos` (valid subsets, sets with invalid members, empty), `publico_alvo` (empty, whitespace, 1–500 chars)
    - Assert: validator accepts iff all four fields satisfy their constraints; rejects otherwise with 422 and correct offending fields
    - Minimum 100 iterations with fast-check
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3**

- [x] 3. Implement QuestionGenerationService
  - [x] 3.1 Create `QuestionGenerationService` (`backend/app/services/question_generation_service.ts`)
    - Accept injected `BedrockClient`, `PromptBuilder`, `ResponseParser` references
    - Implement `generate(adminUserId, surveyId, req): Promise<GenerationPreview>`
    - Step 1: `PromptBuilder.build(req)` → keep serialized prompt for audit
    - Step 2: `bedrock.invoke(system, user)` → handle `BedrockTimeoutError` (write failure log, rethrow)
    - Step 3: `ResponseParser.parse(text)` → Conforming: cap to `quantidade`, write success log, return preview
    - Step 4 (Non_Conforming): `PromptBuilder.buildCorrection(req, first.text)` → second `bedrock.invoke` → parse again
    - On retry Conforming: cap, success log, return preview
    - On retry Non_Conforming: write failure log, throw `GenerationFailedError`
    - Implement `cap(questions, n)` as `questions.slice(0, n)`
    - Write exactly one `ai_generation_logs` row per attempt (success or failure)
    - Record `tokens_input`/`tokens_output` from the final invocation result (null when absent)
    - Export `GenerationFailedError` typed domain error
    - _Requirements: 3.1, 3.3, 3.5, 4.6, 4.7, 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.5, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ]* 3.2 Write property test for prompt construction (Property 2)
    - **Property 2: Structured prompt carries all inputs and constraints**
    - Generate arbitrary valid `GenerationRequest` values
    - Assert: output of `PromptBuilder.build` contains `tema`, `publico_alvo`, `quantidade` (as string), each member of `tipos_permitidos`, the JSON schema instruction, and the quantity instruction
    - Minimum 100 iterations with fast-check
    - **Validates: Requirements 3.1, 3.2, 3.5**

  - [ ]* 3.3 Write property test for schema-conformance classification (Property 3)
    - **Property 3: Schema-conformance classification is exact (parse round-trip)**
    - Generate arbitrary `GeneratedQuestion[]` arrays (valid schema) and serialize as JSON (bare, fenced, prose-wrapped); also generate arbitrary malformed text
    - Assert: `ResponseParser.parse` returns `conforming` with structurally equal questions for valid inputs and `non_conforming` for invalid inputs
    - Minimum 100 iterations with fast-check
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7**

  - [ ]* 3.4 Write property test for preview count cap (Property 4)
    - **Property 4: Preview count never exceeds the requested quantity**
    - Generate arbitrary valid requests and conforming responses with varying question counts (1 to 50)
    - Assert: `generate()` returns at most `quantidade` questions, in original order
    - Minimum 100 iterations with fast-check
    - **Validates: Requirements 3.5**

  - [ ]* 3.5 Write property test for retry logic (Property 5)
    - **Property 5: Exactly one correction retry, with correct outcome**
    - Generate pairs of (first, second) AI responses: conforming/conforming, non-conforming/conforming, non-conforming/non-conforming
    - Mock `BedrockClient` to return responses in sequence
    - Assert: invocation count is exactly 1 (first conforming) or exactly 2 (first non-conforming); correct outcome returned or error raised
    - Minimum 100 iterations with fast-check
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

  - [ ]* 3.6 Write property test for no-persistence invariant (Property 6)
    - **Property 6: The generation endpoint never persists questions or options**
    - Generate arbitrary requests and all outcome paths (conforming, retry-conforming, both-non-conforming, timeout)
    - Mock `questions`/`question_options` repositories and assert zero insert/update calls
    - Assert only `ai_generation_logs` inserts occur
    - Minimum 100 iterations with fast-check
    - **Validates: Requirements 5.1, 5.4, 6.5, 9.2**

  - [ ]* 3.7 Write property test for audit log correctness (Property 7)
    - **Property 7: Every attempt writes exactly one audit log with correct outcome flag**
    - Generate arbitrary requests across all outcome paths
    - Assert: exactly one `ai_generation_logs` row written with correct `admin_user_id`, `survey_id`, `prompt`, `sucesso` (true on conforming, false on failure/timeout), and `resultado` (questions on success, null on failure)
    - Minimum 100 iterations with fast-check
    - **Validates: Requirements 8.1, 8.4, 8.5**

  - [ ]* 3.8 Write property test for token logging (Property 8)
    - **Property 8: Token counts are logged when reported and null otherwise**
    - Generate arbitrary `BedrockInvokeResult` with present/absent token usage
    - Assert: `tokens_input`/`tokens_output` in the log row match the response usage when present, are null when absent
    - Minimum 100 iterations with fast-check
    - **Validates: Requirements 8.2, 8.3**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement controller and routes
  - [x] 5.1 Implement `AiQuestionController` (`backend/app/controllers/ai_question_controller.ts`)
    - `generate` method: validate body with `generateQuestionsValidator`, load `Survey.find(id)` → 404 if missing, resolve `adminUserId` from `auth.user`, call `QuestionGenerationService.generate`, return 200 with `{ questions }`
    - `confirm` method: validate body with `confirmQuestionsValidator`, load `Survey.find(id)` → 404 if missing, resolve `adminUserId`, iterate confirmed questions calling `QuestionService.create` + `QuestionService.addOption` (survey-authoring), return 201 with `{ message, created_count }`
    - Handle empty confirmation array → 201 with `created_count: 0`
    - Map `GenerationFailedError` → 422 friendly message, `BedrockTimeoutError` → 504, `BedrockInvocationError` → 502
    - _Requirements: 1.1, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 7.2, 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 5.2 Register routes (`backend/start/routes.ts`)
    - Add `POST /api/admin/surveys/:id/ai/generate-questions` → `AiQuestionController.generate`
    - Add `POST /api/admin/surveys/:id/ai/confirm-questions` → `AiQuestionController.confirm`
    - Ensure both routes are within the existing admin middleware group (ForceHttps → CORS → auth guard → EnsureAdminActive)
    - _Requirements: 9.1, 9.3, 9.5, 9.6_

  - [ ]* 5.3 Write property test for confirm endpoint persistence (Property 9)
    - **Property 9: Confirm endpoint persists confirmed questions through survey-authoring**
    - Generate arbitrary valid arrays of confirmed questions (including empty)
    - Mock `QuestionService.create` and `QuestionService.addOption`
    - Assert: `create` called once per question with matching fields; `addOption` called once per option; zero calls for empty array
    - Minimum 100 iterations with fast-check
    - **Validates: Requirements 5.5, 5.6, 9.3, 9.4**

- [x] 6. Integration wiring and error handling
  - [x] 6.1 Wire BedrockClient as injectable dependency
    - Register `BedrockClient` in the AdonisJS IoC container with config from `config/bedrock.ts`
    - Ensure `QuestionGenerationService` receives the client via injection
    - _Requirements: 3.6_

  - [ ]* 6.2 Write unit tests for error paths and edge cases
    - Test: unknown `{id}` → 404 with no Bedrock invocation and no audit log
    - Test: `BedrockTimeoutError` → 504 response with `sucesso=false` audit row
    - Test: both-non-conforming → 422 friendly error body
    - Test: conforming response → 200 with correct `{ questions: [...] }` shape
    - Test: `buildCorrection` retains all four inputs and adds correction instruction
    - Test: empty confirmation → 201 with `created_count: 0`
    - _Requirements: 5.3, 5.6, 6.1, 6.2, 6.4, 6.5, 7.1, 7.2, 9.2, 9.5_

  - [ ]* 6.3 Write integration tests for route registration and auth guard
    - Test: both routes registered under `/api/admin` prefix
    - Test: request without valid token → 401 (auth guard rejects)
    - Test: confirm endpoint delegates to `QuestionService` (smoke)
    - _Requirements: 9.1, 9.3, 9.5, 9.6_

- [x] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The `BedrockClient` is always mocked in property and unit tests (zero Bedrock cost during testing)
- The confirm endpoint delegates all persistence rules to survey-authoring's `QuestionService` — no duplication of validation logic
- All typed domain errors (`GenerationFailedError`, `BedrockTimeoutError`, `BedrockInvocationError`) are mapped to HTTP status codes by the reused exception handler from admin-auth-users

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "3.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8"] },
    { "id": 4, "tasks": ["5.1", "5.2"] },
    { "id": 5, "tasks": ["5.3", "6.1"] },
    { "id": 6, "tasks": ["6.2", "6.3"] }
  ]
}
```
