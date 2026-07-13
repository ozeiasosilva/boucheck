# Implementation Plan: foundation-data-model

## Overview

This plan builds the shared technical foundation for BouCheck (spec 1 of 7): the monorepo scaffolding (`backend/` AdonisJS 6, `frontend/` Next.js 15, `infra/` AWS CDK), strict TypeScript + ESLint/Prettier configuration, the 14 Lucid migrations that produce the PostgreSQL 16 schema in referential-dependency order, the 14 Lucid ORM models with relationships and JSONB serialization, idempotent seeders for the demonstration survey, the AWS CDK network/database/storage stacks, and the property-based / smoke / example / CDK-assertion test suites.

Each task builds on the previous one and ends with wiring things together. Migrations are authored so every foreign key target exists before the referencing table. Property tests validate the eight correctness properties from the design; they run against a disposable PostgreSQL 16 instance with `fast-check` and Japa. Test sub-tasks are marked with `*` and are optional for a faster MVP.

## Tasks

- [x] 1. Establish monorepo scaffolding and build configuration
  - [x] 1.1 Scaffold the AdonisJS 6 backend project
    - Create `backend/` as an AdonisJS 6 app targeting Node.js 22 with the Lucid ORM package installed
    - Add `package.json` scripts placeholder structure and `ace.js` entry
    - _Requirements: 13.1_

  - [x] 1.2 Scaffold the Next.js 15 frontend project
    - Create `frontend/` as a Next.js 15 App Router app with TypeScript
    - Ensure `app/` root and `next.config.ts` exist
    - _Requirements: 13.2_

  - [x] 1.3 Scaffold the AWS CDK infrastructure project
    - Create `infra/` as a TypeScript AWS CDK app with `cdk.json`, `bin/boucheck.ts` entry, and `lib/` directory
    - Configure the CDK app for region `sa-east-1`
    - _Requirements: 11.1, 13.3_

  - [x] 1.4 Configure strict TypeScript, ESLint, and Prettier across all three projects
    - Set `"strict": true` in `backend/tsconfig.json`, `frontend/tsconfig.json`, and `infra/tsconfig.json`
    - Add ESLint and Prettier configs to each project
    - Add `typecheck` (`tsc --noEmit`), `lint`, and `format:check` scripts to each `package.json` so a strict violation yields a non-zero exit
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [x] 1.5 Configure Lucid PostgreSQL connection and secret/env handling
    - Author `backend/config/database.ts` to configure Lucid for PostgreSQL, reading credentials from env / Secrets Manager (no plaintext)
    - Add `.gitignore` entries for `.env` files across projects
    - _Requirements: 13.1, 13.5_

  - [x] 1.6 Author README with deploy steps, env vars, and migration convention
    - Document `npm ci` per project, `cdk deploy` order (Network → Database → Storage), how migrations run against RDS, required environment variables, and the timestamp-prefixed migration naming/ordering convention
    - _Requirements: 13.3, 13.4, 15.4_

  - [x] 1.7 Write smoke tests for repository structure and build configuration
    - Assert `backend/`, `frontend/`, `infra/` exist; `strict: true` in both app tsconfigs; ESLint/Prettier configs present; lint/format-check scripts exist; README documents deploy/env/migration convention; `.env` is gitignored and no secrets committed
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 14.1, 14.2, 14.3, 15.4_

- [x] 2. Define shared ORM types
  - [x] 2.1 Create shared TypeScript union and JSONB types
    - Create `backend/app/models/types.ts` with `SurveyStatus`, `QuestionTipo`, `ChecklistGrupo`, `ResponseStatus` union types and the `ConfigVisual` interface (`cor_primaria`, `cor_secundaria`, `cor_fundo`, `logo_s3_key`)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 7.1, 9.6_

- [x] 3. Author reference-table migrations
  - [x] 3.1 Create the `categories` migration
    - `id` PK, `nome`, `created_at`, `updated_at`; implement `down` to drop the table
    - _Requirements: 1.1, 15.1, 15.3_

  - [x] 3.2 Create the `admin_users` migration
    - Columns per schema; UNIQUE on `email`; defaults `role='admin'`, `ativo=true`, `must_change_password=false`; `last_login_at` nullable; implement `down`
    - _Requirements: 1.2, 1.3, 1.4, 8.2, 15.1, 15.3_

- [x] 4. Author survey-structure migrations
  - [x] 4.1 Create the `surveys` migration
    - Columns per schema; UNIQUE on `slug`; FKs `categoria_id`→`categories`, `created_by`→`admin_users`; CHECK on `status`; defaults `version=1`, `usar_ia_no_relatorio=false`; `config_visual` JSONB; indexes on `slug`, `categoria_id`, `created_by`; implement `down`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 6.1, 7.1, 8.1, 8.2, 15.1, 15.3_

  - [x] 4.2 Create the `questions` migration
    - Columns per schema; FK `survey_id`→`surveys`; CHECK on `tipo`; `survey_version` integer default 1; `peso` numeric; `descricao`/`dimensao` nullable; index on `survey_id`; implement `down`
    - _Requirements: 2.5, 6.2, 7.4, 8.2, 15.1, 15.3_

  - [x] 4.3 Create the `question_options` migration
    - Columns per schema; FK `question_id`→`questions`; `pontuacao` numeric; index on `question_id`; implement `down`
    - _Requirements: 2.6, 8.2, 15.1, 15.3_

  - [x] 4.4 Create the `question_rules` migration
    - Columns per schema; FK `question_option_id`→`question_options`, nullable FK `next_question_id`→`questions`; default `finalizar=false`; support the early-termination shape (`next_question_id` NULL + `finalizar` true); indexes on both FK columns; implement `down`
    - _Requirements: 2.7, 2.8, 2.9, 8.2, 15.1, 15.3_

- [x] 5. Author survey-configuration migrations
  - [x] 5.1 Create the `checklist_items` migration
    - Columns per schema; FK `survey_id`→`surveys`; CHECK on `grupo`; index on `survey_id`; implement `down`
    - _Requirements: 3.1, 6.3, 8.2, 15.1, 15.3_

  - [x] 5.2 Create the `score_ranges` migration
    - Columns per schema; FK `survey_id`→`surveys`; `min`/`max` numeric; index on `survey_id`; implement `down`
    - _Requirements: 3.2, 8.2, 15.1, 15.3_

- [x] 6. Author response migrations
  - [x] 6.1 Create the `responses` migration
    - UUID PK defaulting to `gen_random_uuid()`; guard for `pgcrypto`/`gen_random_uuid()` availability; UNIQUE on `token`; FKs `survey_id`→`surveys`, nullable `faixa_id`→`score_ranges`; CHECK on `status`; default `anonimizado=false`; PII columns nullable; indexes on `survey_id`, `faixa_id`, `token`; implement `down`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 6.4, 7.4, 8.2, 8.3, 15.1, 15.3_

  - [x] 6.2 Create the `response_answers` migration
    - Columns per schema; FKs `response_id`→`responses`, `question_id`→`questions`, nullable `question_option_id`→`question_options`; UNIQUE on (`response_id`, `question_id`, `question_option_id`); indexes on all three FK columns; implement `down`
    - _Requirements: 4.5, 4.6, 8.2, 15.1, 15.3_

  - [x] 6.3 Create the `response_checklist` migration
    - Columns per schema; FKs `response_id`→`responses`, `checklist_item_id`→`checklist_items`; indexes on both FK columns; implement `down`
    - _Requirements: 4.7, 8.2, 15.1, 15.3_

  - [x] 6.4 Create the `response_events` migration
    - Columns per schema; FK `response_id`→`responses`; nullable `payload` JSONB; index on `response_id` and composite index on (`response_id`, `created_at`); implement `down`
    - _Requirements: 4.8, 7.2, 8.2, 8.4, 15.1, 15.3_

- [x] 7. Author reporting and audit migrations
  - [x] 7.1 Create the `reports` migration
    - Columns per schema; UNIQUE on `response_id` and `public_token`; FK `response_id`→`responses`; indexes on `response_id`, `public_token`; implement `down`
    - _Requirements: 5.1, 5.2, 8.2, 8.3, 15.1, 15.3_

  - [x] 7.2 Create the `ai_generation_logs` migration
    - Columns per schema; FKs `admin_user_id`→`admin_users`, nullable `survey_id`→`surveys`; `resultado` JSONB; `sucesso` default false; nullable `tokens_input`/`tokens_output`; indexes on both FK columns; implement `down`
    - _Requirements: 5.3, 7.3, 8.2, 15.1, 15.3_

- [x] 8. Checkpoint - migrations run and roll back cleanly
  - Ensure all tests pass, ask the user if questions arise.
  - Verify `node ace migration:run` creates the full schema on an empty PostgreSQL 16 database and `migration:rollback --batch=0` returns it to baseline.

- [x] 9. Implement Lucid ORM models
  - [x] 9.1 Implement reference models `Category` and `AdminUser`
    - Map columns; type `AdminUser` boolean/nullable fields correctly
    - _Requirements: 9.1_

  - [x] 9.2 Implement `Survey`, `Question`, `QuestionOption`, and `QuestionRule` models with relationships
    - `Survey`: `belongsTo` `Category`/`AdminUser` (creator); `hasMany` `Question`/`ChecklistItem`/`ScoreRange`/`Response`; `status` typed as `SurveyStatus`; `config_visual` JSONB via `prepare`/`consume`
    - `Question`: `hasMany` `options`; `tipo` typed as `QuestionTipo`
    - `QuestionOption`: `hasMany` `rules`
    - `QuestionRule`: `belongsTo` `Question` (next question)
    - _Requirements: 9.1, 9.2, 9.3, 9.5, 9.6_

  - [x] 9.3 Implement `ChecklistItem` and `ScoreRange` models
    - `ChecklistItem.grupo` typed as `ChecklistGrupo`
    - _Requirements: 9.1, 9.6_

  - [x] 9.4 Implement `Response` (and children), `Report`, and `AiGenerationLog` models with relationships
    - `Response`: UUID string primary key (no auto-increment); `status` typed as `ResponseStatus`; `hasMany` `answers`/`checklistSelections`/`events`; `hasOne` `report`; `belongsTo` `Survey`/`ScoreRange` (faixa)
    - `ResponseAnswer`, `ResponseChecklist`, `ResponseEvent` models; `ResponseEvent.payload` JSONB via `prepare`/`consume`
    - `Report` model; `AiGenerationLog.resultado` JSONB via `prepare`/`consume`
    - _Requirements: 9.1, 9.4, 9.5, 9.6_

  - [x] 9.5 Write property test for JSONB attribute round-trip
    - **Property 1: JSONB attribute round-trip**
    - Persist and reload `Survey.configVisual`, `ResponseEvent.payload`, and `AiGenerationLog.resultado`; assert deep equality using `fast-check` arbitraries (≥100 runs)
    - **Validates: Requirements 7.1, 7.2, 7.3, 9.5**

  - [x] 9.6 Write example tests for relationship wiring
    - Seed a small survey graph and assert `preload` of each declared relation (Survey→questions/checklistItems/scoreRanges/responses/categoria/creator, Question→options, QuestionOption→rules, QuestionRule→nextQuestion, Response→answers/checklistSelections/events/report/survey/faixa) returns expected rows
    - _Requirements: 9.2, 9.3, 9.4_

- [x] 10. Validate schema-enforced invariants
  - [x] 10.1 Write property test for ENUM domain enforcement
    - **Property 2: ENUM domain enforcement**
    - Parameterized over `surveys.status`, `questions.tipo`, `checklist_items.grupo`, `responses.status`; insert succeeds iff value is in the allowed set (`fast-check`, ≥100 runs, real PostgreSQL 16)
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

  - [x] 10.2 Write property test for UNIQUE constraint enforcement
    - **Property 3: UNIQUE constraint enforcement**
    - Cover `admin_users.email`, `surveys.slug`, `responses.token`, `reports.response_id`, `reports.public_token`, and composite `(response_answers.response_id, question_id, question_option_id)` with non-null option
    - **Validates: Requirements 1.3, 2.2, 4.2, 4.6, 5.2**

  - [x] 10.3 Write property test for referential integrity enforcement
    - **Property 4: Referential integrity enforcement**
    - For each FK: non-existent parent rejected; existing parent (or NULL where nullable) accepted
    - **Validates: Requirements 2.3, 4.3**

  - [x] 10.4 Write property test for column defaults on omission
    - **Property 5: Column defaults on omission**
    - Insert omitting defaulted columns; assert `admin_users.role='admin'`, `ativo=true`, `must_change_password=false`, `surveys.version=1`, `usar_ia_no_relatorio=false`, `question_rules.finalizar=false`, `responses.anonimizado=false`
    - **Validates: Requirements 1.4, 2.4, 2.8, 4.4**

  - [x] 10.5 Write property test for survey version retention
    - **Property 6: Survey version retention**
    - Write arbitrary integer `survey_version` on a response and its questions; reload and assert unchanged on both `responses` and `questions`
    - **Validates: Requirements 7.4**

  - [x] 10.6 Write property test for migration up/down reversibility
    - **Property 8: Migration up/down reversibility**
    - `migration:run` then `migration:rollback --batch=0`; assert the set of application tables is empty again (up∘down is identity on schema)
    - **Validates: Requirements 15.2, 15.3**

  - [x] 10.7 Write example test for the early-termination rule row
    - Insert a `question_rules` row with `next_question_id = NULL` and `finalizar = true`; assert it persists
    - _Requirements: 2.9_

  - [x] 10.8 Write smoke tests for schema, index, and migration ordering
    - After `migration:run`, assert all 14 tables and their columns exist (`information_schema`); assert every named index and the composite `(response_events.response_id, created_at)` exist (`pg_indexes`); assert migration filenames are timestamp-prefixed and sort into dependency order
    - _Requirements: 1.1, 1.2, 8.1, 8.2, 8.3, 8.4, 15.1, 15.2_

- [x] 11. Implement development seeders
  - [x] 11.1 Implement idempotent seeders and `main_seeder` orchestration
    - `main_seeder.ts` orchestrates sub-seeders in dependency order using `updateOrCreate` on natural/deterministic keys
    - Seed one admin (`admin@boucheck.local`, hashed password, `must_change_password=true`), one category, the `maturidade-cloud` demonstration survey (`status='ativo'`, populated `config_visual`), ≥8 questions covering all three `tipo` values, options with scoring on every choice-type question, ≥2 cascade rules (skip-ahead + early-termination), checklist items covering all three `grupo` values, and ≥2 non-overlapping score ranges
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_

  - [x] 11.2 Write property test for seed idempotency
    - **Property 7: Seed idempotency**
    - Run the seeder twice; assert identical per-table row counts and identical key data (no duplicated rows)
    - **Validates: Requirements 10.9**

  - [x] 11.3 Write example tests for seed content
    - Assert the admin has a non-plaintext hash, category exists, demo survey is `ativo` with populated `config_visual`, ≥8 questions spanning all three tipos, options on every choice question, ≥2 cascade rules, checklist covering all three grupos, and ≥2 non-overlapping score ranges
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_

- [x] 12. Checkpoint - models, invariant tests, and seeds pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Implement AWS CDK infrastructure stacks
  - [x] 13.1 Implement `NetworkStack`
    - `ec2.Vpc` (`maxAzs: 2`) with ≥1 `PRIVATE_ISOLATED` subnet group plus public subnets; `rds-sg` (no default ingress) and `backend-sg`; allow ingress on 5432 to `rds-sg` only from `backend-sg`
    - _Requirements: 11.2, 11.6_

  - [x] 13.2 Implement `DatabaseStack`
    - `rds.DatabaseInstance` PostgreSQL `VER_16`, `db.t4g.micro`, `multiAz: false`, placed in `PRIVATE_ISOLATED`, `publiclyAccessible: false`, using `rds-sg`; `backupRetention: Duration.days(7)`; `credentials` from generated Secrets Manager secret (no plaintext)
    - _Requirements: 11.3, 11.4, 11.5, 11.6_

  - [x] 13.3 Implement `StorageStack`
    - Two `s3.Bucket`s (logos, reports) with `blockPublicAccess: BLOCK_ALL`, `encryption: S3_MANAGED`, `enforceSSL: true`; SQS DLQ with `SQS_MANAGED` encryption; standard SQS queue with `SQS_MANAGED` encryption and `deadLetterQueue` redrive (`maxReceiveCount: 3`)
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [x] 13.4 Wire stacks together in the CDK app entry
    - In `bin/boucheck.ts`, instantiate Network → Database → Storage with typed cross-stack references (VPC, security groups) so `cdk synth` succeeds
    - _Requirements: 11.1_

  - [x] 13.5 Write CDK template-assertion tests
    - Using the CDK `assertions` module against the synthesized template: VPC has ≥1 private subnet; RDS `postgres` 16.x, `db.t4g.micro`, `MultiAZ:false`, `PubliclyAccessible:false`, `BackupRetentionPeriod:7`, private placement; Secrets Manager secret referenced with no plaintext password; RDS SG ingress 5432 only from backend SG; two S3 buckets with all-true `PublicAccessBlockConfiguration` and SSE; standard SQS queue with DLQ `RedrivePolicy.maxReceiveCount` and SSE on both; `cdk synth` succeeds
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 12.1, 12.2, 12.3, 12.4_

- [x] 14. Final checkpoint - full foundation verified
  - Ensure all tests pass, ask the user if questions arise.
  - Confirm backend/frontend/infra `typecheck`, `lint`, `format:check`, property + example + smoke tests, and CDK assertion tests all pass.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP; core implementation tasks are never optional.
- Each task references specific requirement sub-clauses for traceability, and every property test explicitly references its design property number and validated requirements.
- Property-based tests use `fast-check` with a minimum of 100 iterations against a disposable PostgreSQL 16 instance; each is tagged `// Feature: foundation-data-model, Property {number}: {property_text}`.
- Migrations are authored in referential-dependency order so a foreign key never references a not-yet-created table; each `down` drops its table (and its constraints/indexes).
- Infrastructure criteria are verified with CDK template-assertion tests rather than property-based tests, since IaC configuration does not vary with input.
- Checkpoints ensure incremental validation at natural breaks (after migrations, after models/seeds, and at the end).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["1.4", "1.5", "1.6", "2.1", "13.1"] },
    { "id": 2, "tasks": ["1.7", "3.1", "3.2", "13.2", "13.3"] },
    { "id": 3, "tasks": ["4.1", "13.4"] },
    { "id": 4, "tasks": ["4.2", "5.1", "5.2", "13.5"] },
    { "id": 5, "tasks": ["4.3", "6.1"] },
    { "id": 6, "tasks": ["4.4", "6.2", "6.3", "6.4", "7.1"] },
    { "id": 7, "tasks": ["7.2"] },
    { "id": 8, "tasks": ["9.1", "9.2", "9.3", "9.4"] },
    { "id": 9, "tasks": ["9.5", "9.6", "10.1", "10.2", "10.3", "10.4", "10.5", "10.6", "10.7", "10.8"] },
    { "id": 10, "tasks": ["11.1"] },
    { "id": 11, "tasks": ["11.2", "11.3"] }
  ]
}
```
