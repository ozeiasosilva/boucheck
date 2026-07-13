# Implementation Plan: survey-authoring

## Overview

This plan turns the survey-authoring design into an incremental, code-only build for the
AdonisJS 6 / TypeScript backend. It follows the reused admin-auth-users layering
(**controller → service → validator**) and plugs new components into the existing middleware
chain (`ForceHttps → CORS → auth guard → EnsureAdminActive`). No migrations or schema changes are
introduced — all tables and Lucid models are consumed as-is from foundation-data-model.

Build order (each step builds on the previous, ending with route wiring so no code is orphaned):
pure support modules (`slug`, `hex-color`, `RuleGraph`, `ScoreRange overlap`, `logo_upload`) →
shared VineJS rules and per-resource validators → services (Category, Checklist, ScoreRange,
Survey, Question, Rule) → controllers → routes → integration/smoke tests.

Property-based tests use `fast-check` + Japa, min 100 iterations, each tagged
`// Feature: survey-authoring, Property {n}: {text}`. Pure-logic properties run in-memory;
persistence properties run against a PostgreSQL 16 test DB with a mocked S3 client. All 22 design
properties are covered and annotated with their property number and validated requirements.

## Tasks

- [x] 1. Pure support modules
  - [x] 1.1 Implement slug validation rule (`support/slug.ts` or `validators/shared.ts`)
    - Export `SLUG_REGEX = /^[a-z0-9-]+$/` and `slugRule` (VineJS string rule)
    - Accept only non-empty strings of lowercase letters, digits, and hyphens
    - _Requirements: 2.1, 2.2_

  - [x] 1.2 Implement hex-color validation rule (`support/hex_color.ts` or `validators/shared.ts`)
    - Export `HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/` and `hexColorRule`
    - Accept only valid CSS hexadecimal colors (`#rgb`, `#rrggbb`, `#rrggbbaa`)
    - _Requirements: 7.3, 21.6_

  - [x] 1.3 Implement `RuleGraph` module (`support/rule_graph.ts`)
    - `classifyEdge(owner, dest)` → `forward | self | backward`
    - `validate(questions, rules)` → forward-only classification + Kahn topological cycle detection returning violations
    - `flagInvalid(questions, rules)` → rule ids with dangling destination or broken forward-only after reorder/delete
    - _Requirements: 16.1, 17.1, 17.2, 17.3, 18.1, 18.2_

  - [x] 1.4 Implement `ScoreRange overlap` module (`support/score_range_overlap.ts`)
    - `overlaps(a, b)` closed-interval intersection test (`a.min <= b.max && b.min <= a.max`)
    - `firstOverlap(candidate, siblings)` excluding `candidate.id` on edit
    - _Requirements: 21.4, 21.5_

  - [x] 1.5 Implement `logo_upload` S3 helper (`support/logo_upload.ts`)
    - Validate MIME/type PNG/SVG/JPG (422) and size ≤ 2 MB (422) before any S3 call
    - `PutObject` to foundation `logos` bucket under `surveys/{surveyId}/logo-{uuid}.{ext}`; injectable/mockable S3 client
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [ ]* 1.6 Write property test for slug validity
    - **Property 1: Slug validity**
    - **Validates: Requirements 2.1, 2.2**

  - [ ]* 1.7 Write property test for hex color validity
    - **Property 3: Hex color validity**
    - **Validates: Requirements 7.3, 21.6**

  - [ ]* 1.8 Write property test for forward-only acyclic rule validation
    - **Property 17: Forward-only acyclic rule validation**
    - **Validates: Requirements 16.1, 16.3, 17.1, 17.2, 17.3**

  - [ ]* 1.9 Write property test for invalid-destination flagging
    - **Property 19: Invalid-destination flagging**
    - **Validates: Requirements 18.1, 18.2**

  - [ ]* 1.10 Write property test for score-range validity and non-overlap
    - **Property 22: Score-range validity and non-overlap**
    - **Validates: Requirements 21.4, 21.5**

  - [ ]* 1.11 Write unit tests for logo_upload type/size guards with mocked S3
    - Non-PNG/SVG/JPG → 422; >2 MB → 422; at-limit valid file triggers exactly one `PutObject`
    - _Requirements: 8.2, 8.3, 8.4_

- [x] 2. Checkpoint - Ensure support modules pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. VineJS validators (per-resource)
  - [x] 3.1 Implement survey validators (`validators/survey_validators.ts`)
    - `createSurveyValidator`, `updateSurveyValidator`, `setStatusValidator`, `duplicateSurveyValidator`, `visualIdentityValidator`
    - Reuse `slugRule`/`hexColorRule`; enforce `mensagem_objetivo` ≤ 1000, valid email, status enum
    - _Requirements: 1.4, 1.5, 1.6, 2.1, 3.1, 6.3, 7.3_

  - [x] 3.2 Implement question and option validators (`validators/question_validators.ts`, `validators/option_validators.ts`)
    - `createQuestionValidator`, `updateQuestionValidator`, `reorderQuestionsValidator`, `optionValidator`
    - Enforce `texto` ≤ 500, `descricao` ≤ 300 nullable, `tipo` enum, numeric `peso`/`pontuacao`, nullable `dimensao`
    - _Requirements: 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 11.1, 11.2_

  - [x] 3.3 Implement rule validators (`validators/rule_validators.ts`)
    - `ruleValidator` with `question_option_id`, nullable `next_question_id`, optional `finalizar`, optional `priority`
    - _Requirements: 16.1, 16.2, 20.2_

  - [x] 3.4 Implement category, checklist, and score-range validators
    - `category_validators.ts`, `checklist_validators.ts` (`checklistItemValidator`, `importChecklistValidator`), `score_range_validators.ts` (`scoreRangeValidator` with hex `cor`)
    - Enforce `grupo` enum and numeric `min`/`max`
    - _Requirements: 9.1, 9.2, 14.1, 14.2, 15.1, 21.1, 21.6_

  - [ ]* 3.5 Write example tests for validator field/enum/length/email boundaries
    - `mensagem_objetivo` > 1000, `texto` > 500, `descricao` > 300 → 422; at-limit accepted
    - Invalid `email_notificacao` → 422; `status`/`tipo`/`grupo` enum rejections → 422
    - `pontuacao = 0`, negative, and decimal accepted; `peso` decimal accepted
    - Optional fields: omitted `descricao`/`dimensao` stored null; rich-text `mensagem_objetivo` ≤ 1000 round-trips
    - _Requirements: 1.4, 1.5, 1.6, 3.1, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 11.2, 14.2_

- [x] 4. CategoryService
  - [x] 4.1 Implement `CategoryService` (`services/category_service.ts`)
    - `list`, `create`, `update`, `delete` with in-use guard (count `surveys.categoria_id`) → 422 `CategoryInUseError`
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ]* 4.2 Write property test for category in-use delete guard
    - **Property 10: Category in-use delete guard**
    - **Validates: Requirements 9.4**

  - [ ]* 4.3 Write example tests for category CRUD round-trips
    - Create/read/update persist and return the category
    - _Requirements: 9.1, 9.2, 9.3_

- [x] 5. ChecklistService
  - [x] 5.1 Implement `ChecklistService` create/update/delete/list (`services/checklist_service.ts`)
    - Persist `nome`/`grupo` under a survey; allow zero items as valid configuration
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [x] 5.2 Implement checklist import from source survey
    - Copy each source `checklist_items` row into target preserving `nome`/`grupo`; missing source → 404 `NotFoundError`; source left unchanged
    - _Requirements: 15.1, 15.2, 15.3_

  - [ ]* 5.3 Write property test for checklist import fidelity
    - **Property 16: Checklist import fidelity**
    - **Validates: Requirements 15.1, 15.3**

  - [ ]* 5.4 Write example tests for grupo enum, zero-item survey, and import 404
    - _Requirements: 14.2, 14.4, 15.2_

- [x] 6. ScoreRangeService
  - [x] 6.1 Implement `ScoreRangeService` (`services/score_range_service.ts`)
    - `list`/`create`/`update`/`delete`; enforce `min ≤ max` (422 `ScoreRangeBoundsError`) then `firstOverlap` against siblings (422 `ScoreRangeOverlapError`); hex `cor` validated by the validator
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6_

  - [ ]* 6.2 Write example tests for score-range bounds and numeric acceptance
    - `min` > `max` → 422; overlapping range → 422 identifying conflict; numeric/decimal bounds accepted
    - _Requirements: 21.3, 21.4, 21.5_

- [x] 7. SurveyService - creation, edit, visual identity, logo
  - [x] 7.1 Implement `create`/`update`/`read` (`services/survey_service.ts`)
    - Create with `status = rascunho`, `version = 1`; persist all descriptive fields; slug uniqueness → 422 `SlugConflictError`
    - _Requirements: 1.1, 1.2, 1.3, 2.3_

  - [ ]* 7.2 Write property test for slug uniqueness
    - **Property 2: Slug uniqueness**
    - **Validates: Requirements 2.3**

  - [x] 7.3 Implement `setVisualIdentity`
    - Store `cor_primaria`/`cor_secundaria`/`cor_fundo` in `surveys.config_visual` JSONB
    - _Requirements: 7.1, 7.2_

  - [ ]* 7.4 Write property test for visual identity round-trip
    - **Property 4: Visual identity round-trip**
    - **Validates: Requirements 7.1, 7.2**

  - [x] 7.5 Implement `uploadLogo`
    - Invoke `logo_upload` helper, merge `logo_s3_key` into `config_visual`; skip key write on S3 failure
    - _Requirements: 8.1_

  - [ ]* 7.6 Write integration test for logo upload with mocked S3
    - Valid file → exactly one `PutObject` to `logos` bucket and `config_visual.logo_s3_key` persisted
    - _Requirements: 8.1_

- [x] 8. SurveyService - lifecycle, versioning, activation, duplicate
  - [x] 8.1 Implement `archive`
    - Set `status = arquivado`; retain all `responses`/`response_*` rows and all structure rows unchanged
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ]* 8.2 Write property test for archive preserving all rows
    - **Property 6: Archive preserves all rows**
    - **Validates: Requirements 4.1, 4.2, 4.3**

  - [x] 8.3 Implement `applyStructureChange` + `hasResponses` versioning gate
    - No-response survey → mutate directly, no version bump (Req 5.4)
    - `ativo` + Has_Responses + unconfirmed → 409 `StructureChangeRequiresConfirmationError` (Req 5.1)
    - `ativo` + Has_Responses + confirmed → transaction: mutate, `version += 1`, stamp `questions.survey_version`, leave `responses` untouched (Req 5.2, 5.3)
    - Physical question delete on Has_Responses → routed here instead of physical removal (Req 13.2)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 13.2_

  - [ ]* 8.4 Write property test for structure versioning invariant
    - **Property 7: Structure versioning invariant**
    - **Validates: Requirements 5.2, 5.3, 5.4, 13.2**

  - [ ]* 8.5 Write property test for structure-change alert-then-confirm
    - **Property 8: Structure-change alert-then-confirm**
    - **Validates: Requirements 5.1**

  - [x] 8.6 Implement `setStatus` activation guard (`assertActivatable`)
    - Reject `ativo` when zero questions (422 `EmptySurveyActivationError`)
    - Reject when any Choice_Question < 2 options (422 `InsufficientOptionsError` with offending question)
    - Reject when any rule flagged invalid via `RuleGraph.flagInvalid` (422 `InvalidRulesError` with rule ids)
    - Other statuses set without structural checks (Req 3.1)
    - _Requirements: 3.1, 3.2, 3.3, 11.3, 18.3_

  - [ ]* 8.7 Write property test for activation guard
    - **Property 5: Activation guard**
    - **Validates: Requirements 3.2, 3.3, 11.3, 18.3**

  - [x] 8.8 Implement `duplicate` deep copy
    - One transaction: new draft (`rascunho`, v1), copy questions → `questionIdMap`, copy options → `optionIdMap`, copy rules with `next_question_id = questionIdMap.get(old)` and `question_option_id = optionIdMap.get(old)`, copy checklist items; no `responses` copied
    - _Requirements: 6.1, 6.2, 6.4_

  - [ ]* 8.9 Write property test for duplicate deep-copy fidelity
    - **Property 9: Duplicate deep-copy fidelity**
    - **Validates: Requirements 6.1, 6.2, 6.4**

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. QuestionService
  - [x] 10.1 Implement question `create`/`update` (`services/question_service.ts`)
    - Associate with survey; persist `texto`/`descricao`/`tipo`/`obrigatoria`/`ordem`/`peso`/`dimensao` (null `descricao`/`dimensao` when omitted)
    - Funnel through `SurveyService.applyStructureChange`
    - _Requirements: 1.3, 10.1, 10.2, 10.6, 10.7, 10.8_

  - [ ]* 10.2 Write property test for question create round-trip
    - **Property 11: Question create round-trip**
    - **Validates: Requirements 10.1, 10.2, 10.6, 10.8**

  - [ ]* 10.3 Write property test for question edit round-trip
    - **Property 12: Question edit round-trip**
    - **Validates: Requirements 1.3, 10.1**

  - [x] 10.4 Implement option `addOption`/`updateOption`/`deleteOption`
    - Reject 11th option on a Choice_Question (422 `OptionLimitError`); reject any option on an Open_Question (422 `OptionOnOpenQuestionError`)
    - _Requirements: 11.1, 11.2, 11.4, 11.5_

  - [ ]* 10.5 Write property test for option count bounds
    - **Property 13: Option count bounds**
    - **Validates: Requirements 11.4, 11.5**

  - [x] 10.6 Implement `reorder`
    - Persist submitted `ordem` per question; reject duplicate `ordem` within survey+version (422 `DuplicateOrdemError`)
    - Re-flag rules via `RuleGraph.flagInvalid` after any reorder (Req 18.2)
    - _Requirements: 12.1, 12.2, 18.2_

  - [ ]* 10.7 Write property test for reorder persisting distinct ordem
    - **Property 14: Reorder persists distinct ordem**
    - **Validates: Requirements 12.1, 12.2**

  - [x] 10.8 Implement question `delete` (draft cascade vs versioning)
    - Not Has_Responses → delete question + options + attached rules (cascade)
    - Has_Responses → reject physical delete and route through `applyStructureChange` versioning
    - _Requirements: 13.1, 13.2_

  - [ ]* 10.9 Write property test for draft question deletion cascade
    - **Property 15: Draft question deletion cascades**
    - **Validates: Requirements 13.1**

- [x] 11. RuleService
  - [x] 11.1 Implement rule `create`/`update`/`delete` (`services/rule_service.ts`)
    - Attach only to Choice_Question options (422 if not); `finalizar = true` → persist with `next_question_id = null`
    - Classify edge via `RuleGraph.classifyEdge`; reject self (422 `SelfRuleError`) and backward (422 `BackwardRuleError`)
    - Run `RuleGraph.validate` on prospective rule set; reject cycle (422 `CyclicRuleError`)
    - Default `priority` to owning option `ordem` when not supplied
    - _Requirements: 16.1, 16.2, 16.3, 17.1, 17.2, 17.3, 20.1, 20.2, 20.3_

  - [ ]* 11.2 Write property test for early-termination rule shape
    - **Property 18: Early-termination rule shape**
    - **Validates: Requirements 16.2**

  - [ ]* 11.3 Write property test for rule priority default
    - **Property 21: Rule priority default**
    - **Validates: Requirements 20.2**

  - [x] 11.4 Implement `flow` visualization
    - Return questions in ascending `ordem` with `depth` and per-rule branches (`goto`/`finalizar`, `invalid` flag)
    - Empty branch set when no outgoing rule; every question appears exactly once
    - _Requirements: 19.1, 19.2_

  - [ ]* 11.5 Write property test for flow visualization completeness
    - **Property 20: Flow visualization completeness**
    - **Validates: Requirements 19.1, 19.2**

- [x] 12. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Controllers
  - [x] 13.1 Implement `SurveysController` (`controllers/surveys_controller.ts`)
    - create/list/read/update/status/archive/duplicate/visual/logo; validate via VineJS, invoke one `SurveyService` method, shape HTTP response
    - _Requirements: 22.1_

  - [x] 13.2 Implement `CategoriesController` (`controllers/categories_controller.ts`)
    - create/list/read/update/delete
    - _Requirements: 22.2_

  - [x] 13.3 Implement `QuestionsController` and `OptionsController`
    - questions create/read/update/delete/reorder; options create/read/update/delete
    - _Requirements: 22.3_

  - [x] 13.4 Implement `RulesController` (`controllers/rules_controller.ts`)
    - rules create/read/update/delete and `GET /surveys/{id}/flow`
    - _Requirements: 22.4_

  - [x] 13.5 Implement `ChecklistItemsController` (`controllers/checklist_items_controller.ts`)
    - create/list/update/delete/import
    - _Requirements: 22.5_

  - [x] 13.6 Implement `ScoreRangesController` (`controllers/score_ranges_controller.ts`)
    - create/list/update/delete
    - _Requirements: 22.6_

- [x] 14. Route wiring and final tests
  - [x] 14.1 Wire routes into the reused admin middleware chain (`start/routes.ts`)
    - Register all `/api/admin` paths behind `ForceHttps → CORS → auth guard → EnsureAdminActive`
    - Map endpoints to controller actions per the API Endpoints table in the design
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7_

  - [ ]* 14.2 Write smoke tests for route table and authentication
    - Each resource exposes its required operations under `/api/admin`; unauthenticated request → 401
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7_

  - [ ]* 14.3 Write smoke test for logo bucket target and priority storage semantics
    - Logo target is foundation `logos` bucket (BPA + CloudFront); priority stored as integer (lower = higher precedence)
    - _Requirements: 8.4, 20.1, 20.3_

- [x] 15. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP; they are never implemented by the coding agent automatically.
- Each task references specific requirement clauses for traceability; every one of the 22 correctness properties has a dedicated property-based test sub-task annotated with its property number and validated requirements.
- No migrations or schema changes: all tables/models are consumed as-is from foundation-data-model; the auth guard and middleware chain are reused from admin-auth-users.
- Pure-logic property tests (Properties 1, 3, 17, 19, 22) run in-memory against their support modules; persistence property tests run against a PostgreSQL 16 test DB with a mocked S3 client, min 100 `fast-check` iterations each.
- Checkpoints provide incremental validation between the support layer, the services layer, and the full stack.
- Build order satisfies all dependency edges: support modules are pure with no deps; validators depend on shared rules; services depend on support modules + validators + models; controllers depend on services + validators; routes depend on controllers.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5"] },
    { "id": 1, "tasks": ["1.6", "1.7", "1.8", "1.9", "1.10", "1.11", "3.1", "3.2", "3.3", "3.4"] },
    { "id": 2, "tasks": ["3.5", "4.1", "5.1", "6.1", "7.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "5.2", "6.2", "7.2", "7.3"] },
    { "id": 4, "tasks": ["5.3", "5.4", "7.4", "7.5"] },
    { "id": 5, "tasks": ["7.6", "8.1"] },
    { "id": 6, "tasks": ["8.2", "8.3"] },
    { "id": 7, "tasks": ["8.4", "8.5", "8.6"] },
    { "id": 8, "tasks": ["8.7", "8.8"] },
    { "id": 9, "tasks": ["8.9", "10.1"] },
    { "id": 10, "tasks": ["10.2", "10.3", "10.4"] },
    { "id": 11, "tasks": ["10.5", "10.6"] },
    { "id": 12, "tasks": ["10.7", "10.8"] },
    { "id": 13, "tasks": ["10.9", "11.1"] },
    { "id": 14, "tasks": ["11.2", "11.3", "11.4"] },
    { "id": 15, "tasks": ["11.5", "13.1", "13.2", "13.3", "13.4", "13.5", "13.6"] },
    { "id": 16, "tasks": ["14.1"] },
    { "id": 17, "tasks": ["14.2", "14.3"] }
  ]
}
```
