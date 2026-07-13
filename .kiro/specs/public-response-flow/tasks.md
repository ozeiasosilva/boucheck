# Implementation Plan: Public Response Flow

## Overview

This plan implements the public (unauthenticated) respondent experience: the AdonisJS 6 public API (`/api/public/*`), the frontend Navigation_Engine (TypeScript module), and the Next.js 15 SSR pages that drive the respondent flow from slug landing through identification, question navigation, checklist, and completion. Backend middleware, services, and validators are built first as shared foundations, then wired into controllers, followed by the frontend navigation engine and SSR pages, and finally end-to-end integration. Property-based tests validate the deterministic navigation and revalidation algorithms; example tests cover SSR rendering, metadata, responsiveness, LGPD validation, and 404 handling.

## Tasks

- [x] 1. Backend middleware and validators foundation
  - [x] 1.1 Implement `response_token_auth` middleware
    - Extract `token` param, query `responses` table, attach `ctx.response_session`, respond 401 when not found, idempotent short-circuit note for `/complete` when already `completo`
    - _Requirements: 9.1_
  - [x] 1.2 Implement `rate_limit` middleware
    - Sliding-window counter per client IP, 30 requests / 60-second window, respond 429 with `retry_after_seconds` on excess
    - _Requirements: 9.2_
  - [x] 1.3 Write property test for rate limiting
    - **Property: Sliding-window rate limit enforcement** — for any sequence of timestamped requests from a single IP, requests beyond the 30th within any 60-second window receive 429, and all requests within the limit receive a pass-through (non-429) result
    - **Validates: Requirements 9.2**
  - [x] 1.4 Implement VineJS validators: `identification_validator`, `answer_validator`, `checklist_validator`, `event_validator`
    - `identification_validator`: required Nome/Telefone/Empresa/E-mail/Cargo/Cidade, BR phone format, e-mail format, acceptance flag
    - `answer_validator`: `question_option_ids` or `texto_livre` (max 2000 chars), `invalidated_question_ids`
    - `checklist_validator`: `checklist_item_ids` array
    - `event_validator`: `tipo` against the whitelist, `payload` object
    - _Requirements: 3.9, 3.10, 3.11, 4.3, 4.10, 6.6, 8.3_
  - [x] 1.5 Write property test for event-type whitelist validation
    - **Property: Whitelist membership determines acceptance** — for any string value passed as `tipo`, the `event_validator` accepts it if and only if it is a member of the recognized public event types set
    - **Validates: Requirements 8.1, 8.3**
  - [x] 1.6 Write unit tests for `identification_validator`
    - Cover valid submission, missing required field, malformed e-mail, malformed Telefone, unchecked acceptance
    - _Requirements: 3.9, 3.10, 3.11_

- [x] 2. Backend services: navigation validator and session resume
  - [x] 2.1 Implement `navigation_validator` service
    - Port `determineNext` and `resolveMultipleRules` logic to the backend, implement `revalidateAnsweredPath(responseId, surveyId, surveyVersion)` that deterministically walks the path from the first question, checks mandatory-answer presence, and verifies no answered question falls outside the expected path
    - _Requirements: 5.6, 5.8, 5.9_
  - [x] 2.2 Write property test for completion revalidation
    - **Property: Revalidation soundness and completeness** — for any generated survey structure (acyclic, forward-only rule graph) and any set of persisted answers, `revalidateAnsweredPath` returns `true` if and only if every answered question lies on the deterministic walk of the structure and every mandatory question on that walk has an answer
    - **Validates: Requirements 5.8, 5.9**
  - [x] 2.3 Implement `session_resume_service`
    - Query for an existing `iniciado` session by e-mail + survey with `started_at` within 7 days; return resumable info or null; create-new-session path when forced or not found
    - _Requirements: 3.12, 3.13, 3.14_
  - [x] 2.4 Write property test for session resume eligibility
    - **Property: Resume eligibility is exactly status-and-recency gated** — for any combination of session `status` and `started_at` offset, the service reports a session resumable if and only if `status == 'iniciado'` and `started_at` is within 7 days of now
    - **Validates: Requirements 3.12**

- [x] 3. Checkpoint - Ensure backend foundation tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Backend public API controllers and routes
  - [x] 4.1 Implement `survey_controller`
    - `GET /api/public/surveys/{slug}` returning landing metadata for active surveys, 404 otherwise; `GET /api/public/surveys/{slug}/structure` returning the full Survey_Structure for the current `survey_version`
    - _Requirements: 1.7, 1.8, 5.1_
  - [x] 4.2 Implement `response_controller`
    - `POST /api/public/surveys/{slug}/responses` wiring `identification_validator` and `session_resume_service`; create session, record `started_at`/`politica_versao`, log `privacidade_aceita`, return token or resumable info; honor `X-Force-New-Session` header
    - _Requirements: 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14_
  - [x] 4.3 Implement `answer_controller`
    - `PUT /api/public/responses/{token}/answers/{questionId}` validating the question belongs to the session's survey, upserting the answer, deleting rows for `invalidated_question_ids`, logging `pergunta_respondida`
    - _Requirements: 4.6, 4.7, 4.9, 4.10_
  - [x] 4.4 Implement `checklist_controller`
    - `POST /api/public/responses/{token}/checklist` validating each item belongs to the session's survey before persisting `response_checklist` rows
    - _Requirements: 6.5, 6.6_
  - [x] 4.5 Implement `completion_controller`
    - `POST /api/public/responses/{token}/complete` invoking `navigation_validator.revalidateAnsweredPath`; on success set `status=completo`, record `completed_at`, log `concluido`, trigger reporting handoff (SQS); on already-`completo` return 200 idempotently without re-triggering; on invalid path return 422
    - _Requirements: 5.8, 5.9, 7.1, 7.2, 7.3, 7.4, 7.5_
  - [x] 4.6 Implement `event_controller`
    - `POST /api/public/responses/{token}/events` validating `tipo` against the whitelist via `event_validator`, creating the `response_events` row
    - _Requirements: 8.1, 8.3_
  - [x] 4.7 Register public routes and wire middleware
    - Mount `rate_limit` and `response_token_auth` on the appropriate `/api/public/*` write routes; mount `rate_limit` on all public routes
    - _Requirements: 9.1, 9.2_
  - [x] 4.8 Write unit tests for `survey_controller`
    - Cover active-survey metadata response, 404 for unknown slug, 404 for `rascunho`/`inativo`/`arquivado` status, structure response shape
    - _Requirements: 1.2, 1.3, 1.7, 1.8, 5.1_
  - [x] 4.9 Write unit tests for `answer_controller`
    - Cover successful save, 422 for `questionId` not in survey, deletion of invalidated answers, 401 for missing/invalid token
    - _Requirements: 4.9, 4.10, 9.1_
  - [x] 4.10 Write unit tests for `completion_controller`
    - Cover successful completion, idempotent 200 for already-`completo` session, 422 for invalid answered path
    - _Requirements: 7.1, 7.5, 5.9_
  - [x] 4.11 Write unit tests for `event_controller`
    - Cover accepted recognized event type, 422 for unrecognized type, 401 for invalid token
    - _Requirements: 8.1, 8.3, 9.1_

- [x] 5. Checkpoint - Ensure all backend API tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Frontend Navigation_Engine module
  - [x] 6.1 Implement `types.ts`
    - Define `SurveyStructure`, `Question`, `Option`, `Rule`, `Answer`, `NavigationState` interfaces
    - _Requirements: 5.1, 5.2_
  - [x] 6.2 Implement `engine.ts` core `NavigationEngine`
    - Implement `init`, `getNextQuestion`, `getPreviousQuestion`, `determineNext`, `resolveMultipleRules`
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_
  - [x] 6.3 Write property test for next-question determination
    - **Property: Deterministic next-question resolution** — for any question/answer/rule-graph combination, `determineNext` returns `null` when the applicable rule has `finalizar=true`, returns `rule.next_question_id` when a rule with a non-null `next_question_id` applies, and otherwise returns the next question by ascending `ordem`
    - **Validates: Requirements 5.3, 5.4, 5.5**
  - [x] 6.4 Write property test for priority resolution
    - **Property: Lowest-priority-number rule wins** — for any `multipla_escolha` selection where more than one selected option carries a rule, `resolveMultipleRules` always returns the rule with the numerically lowest `priority`
    - **Validates: Requirements 5.6**
  - [x] 6.5 Implement `path_calculator.ts`
    - Implement `computeForwardPath` and `getInvalidatedQuestions`
    - _Requirements: 4.9, 5.7_
  - [x] 6.6 Write property test for path invalidation
    - **Property: Invalidation is exactly the unreachable tail** — for any answered path and any changed answer at a point on that path, `getInvalidatedQuestions` returns exactly the set of old-tail questions that are absent from the newly computed forward path — no question still reachable is invalidated, and no unreachable question is retained
    - **Validates: Requirements 4.9**
  - [x] 6.7 Implement `progress.ts`
    - Implement `calculateProgress` and `computeEstimatedPath` integration
    - _Requirements: 4.1_
  - [x] 6.8 Write property test for progress calculation
    - **Property: Progress stays bounded and monotonic** — for any fixed survey structure, as the answered path grows by one more answered question, `calculateProgress` always yields a value within `[0, 100]` and never decreases
    - **Validates: Requirements 4.1**

- [x] 7. Checkpoint - Ensure Navigation_Engine tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Frontend Next.js SSR pages
  - [x] 8.1 Implement `app/[slug]/page.tsx` SSR landing page
    - Fetch `GET /api/public/surveys/{slug}` at SSR time, apply Visual_Identity (colors, logo), render `nome`, `mensagem_objetivo` as rich text, `tempo_estimado_min`, "Iniciar" action, and Open Graph metadata (title, description, image)
    - _Requirements: 1.1, 1.5, 1.6, 2.1, 2.2, 2.3_
  - [x] 8.2 Write example test for SSR rendering of the landing page
    - Verify the rendered page includes survey name, objective message, and estimated time for an active survey
    - _Requirements: 1.1, 1.5, 2.1_
  - [x] 8.3 Write example test for Open Graph metadata
    - Verify rendered `<head>` metadata includes `og:title`, `og:description`, and `og:image`
    - _Requirements: 1.6_
  - [x] 8.4 Implement `app/not-found.tsx` branded 404 page
    - Wire slug resolution so unknown slugs and non-active survey statuses (`rascunho`, `inativo`, `arquivado`) render this page with HTTP 404
    - _Requirements: 1.2, 1.3_
  - [x] 8.5 Write example test for 404 handling
    - Verify HTTP 404 and branded not-found rendering for an unknown slug and for each non-active survey status
    - _Requirements: 1.2, 1.3_
  - [x] 8.6 Implement `app/[slug]/identificacao/page.tsx`
    - Render Identification_Form (Nome, Telefone with BR mask, Empresa, E-mail, Cargo, Cidade), privacy-policy checkbox with new-tab link, disabled proceed action until valid, resumable-session choice UI, submit to `POST /api/public/surveys/{slug}/responses`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.12, 3.13, 3.14_
  - [x] 8.7 Write example test for LGPD field validation
    - Verify proceed action stays disabled with empty required fields or unchecked policy checkbox, and enables once all are satisfied; verify phone mask formatting
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - [x] 8.8 Implement `app/[slug]/perguntas/page.tsx`
    - Wire Navigation_Engine to render one question at a time (single-select, multi-select, text area with 2000-char limit), progress bar, required-field validation with "Pular" for optional questions, back-navigation with answer change and invalidation dispatch, auto-save via `PUT /api/public/responses/{token}/answers/{questionId}`, mobile-first responsive layout
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.11_
  - [x] 8.9 Write example test for mobile-first responsiveness
    - Verify the question flow layout renders correctly at mobile viewport widths and adapts at larger breakpoints
    - _Requirements: 4.11_
  - [x] 8.10 Implement `app/[slug]/checklist/page.tsx`
    - Render three searchable multi-select groups (`servico_cloud`, `fabricante`, `solucao`) from survey `checklist_items`, "Pular esta etapa" action, skip step entirely when no checklist items configured, submit to `POST /api/public/responses/{token}/checklist`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  - [x] 8.11 Implement `app/[slug]/concluido/page.tsx`
    - Trigger `POST /api/public/responses/{token}/complete`, handle 422 by surfacing revalidation error, render completion boundary UI, fire reporting-related events via `POST /api/public/responses/{token}/events`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2_

- [x] 9. Checkpoint - Ensure all frontend page tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Integration and end-to-end wiring
  - [x] 10.1 Wire the full respondent flow end-to-end
    - Implement Response_Token storage/context (React context or `sessionStorage`), client-side navigation (`router.push`) between pages, API client calls for every endpoint, structure fetch and Navigation_Engine initialization on the questions page
    - _Requirements: 3.8, 4.6, 4.8, 5.1, 5.2, 6.5, 7.1, 8.1, 8.2, 9.1_
  - [x] 10.2 Write integration test for the full happy-path flow
    - Cover slug landing → identification → answering a branching path → checklist → completion, asserting final `status=completo` and `completed_at` recorded
    - _Requirements: 1.1, 3.5, 4.6, 5.3, 6.5, 7.1, 7.2_
  - [x] 10.3 Write integration test for the resumable session flow
    - Cover submitting identification with an e-mail that has a recent `iniciado` session, choosing resume vs. start-new, and verifying the correct token and answer state result
    - _Requirements: 3.12, 3.13, 3.14_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP; core implementation tasks are never marked optional.
- Property-based tests validate the deterministic navigation and revalidation algorithms described in the design (Navigation_Engine, completion revalidation, session resume, rate limiting, event whitelist).
- Example/smoke tests cover SSR rendering, Open Graph metadata, mobile-first responsiveness, LGPD field validation, and 404 handling as requested.
- Backend and frontend tracks (foundation → services/controllers → engine → pages) can proceed largely in parallel once each track's own foundation is in place; integration wiring depends on both being complete.
- Checkpoints are placed after each major track (backend foundation, backend API, navigation engine, frontend pages, final integration) to validate incrementally.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.4", "2.1", "2.3", "6.1"] },
    { "id": 1, "tasks": ["1.3", "1.5", "1.6", "2.2", "2.4", "4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "6.2", "6.5", "6.7"] },
    { "id": 2, "tasks": ["4.7", "4.8", "4.9", "4.10", "4.11", "6.3", "6.4", "6.6", "6.8"] },
    { "id": 3, "tasks": ["8.1", "8.4", "8.6", "8.8", "8.10", "8.11"] },
    { "id": 4, "tasks": ["8.2", "8.3", "8.5", "8.7", "8.9"] },
    { "id": 5, "tasks": ["10.1"] },
    { "id": 6, "tasks": ["10.2", "10.3"] }
  ]
}
```
