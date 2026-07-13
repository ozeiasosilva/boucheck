# Requirements Document

## Introduction

This document specifies the requirements for the **foundation-data-model** spec, which is spec 1 of 7 for the BouCheck platform. It defines the shared technical foundation that the other six specs depend on: the complete PostgreSQL 16 data model (section 8 of the master requirements document), the Lucid ORM migrations and models, database seeds for development, base infrastructure-as-code (AWS CDK in TypeScript), and the baseline code quality configuration.

This spec covers **only the shared data layer, ORM models, seeds, and base infrastructure**. Application feature behavior — authentication flows, the public response flow, conditional logic navigation, reporting, dashboards, and AI generation — is explicitly out of scope and belongs to later specs. Where behavioral requirements from the master document (for example REQ-PUB, REQ-ADM, REQ-REP) imply data structures, this spec covers only the persistence structures needed to support them, not the behavior itself.

Traceability to the master requirements document is preserved through references to master requirement codes (REQ-NFR-001, REQ-NFR-004, and the section 8 data model).

## Glossary

- **Data_Model**: The complete set of PostgreSQL 16 tables, columns, keys, constraints, indexes, ENUM types, and JSONB fields defined in section 8 of the master requirements document.
- **Migration_System**: The Lucid ORM migration files (`node ace make:migration`) that create and version the Data_Model schema.
- **ORM_Model_Layer**: The AdonisJS 6 Lucid model classes that map to Data_Model tables and declare relationships.
- **Seed_System**: The Lucid database seeders (`node ace make:seeder`) that populate development data.
- **Infrastructure_Stack**: The AWS CDK (TypeScript) application that provisions base cloud resources (RDS, S3, SQS, networking).
- **Build_Configuration**: The TypeScript compiler settings, ESLint configuration, Prettier configuration, and migration naming conventions applied across the backend and frontend projects.
- **Survey_Version**: An integer discriminator (`version`) on a survey that identifies a snapshot of its question structure; responses persist the `survey_version` they answered against so historical responses remain interpretable when the structure changes.
- **Demonstration_Survey**: The example survey created by the Seed_System per Definition of Done item 3.
- **Backend_Project**: The AdonisJS 6 (Node.js 22, TypeScript) API project.
- **Frontend_Project**: The Next.js 15 (App Router, TypeScript) web project.
- **PII_Column**: A column storing personal data of a respondent (nome, telefone, empresa, email, cargo, cidade).

## Requirements

### Requirement 1: Reference tables — categories, admin_users

**User Story:** As a developer, I want the reference/lookup tables defined in the schema, so that surveys and audit records can reference categories and administrators.

#### Acceptance Criteria

1. THE Migration_System SHALL create a `categories` table with columns `id` (primary key), `nome`, `created_at`, and `updated_at`.
2. THE Migration_System SHALL create an `admin_users` table with columns `id` (primary key), `nome`, `email`, `password_hash`, `role`, `ativo` (boolean), `must_change_password` (boolean), `last_login_at` (nullable), `created_at`, and `updated_at`.
3. THE Migration_System SHALL define a UNIQUE constraint on `admin_users.email`.
4. THE Data_Model SHALL define a default value of `admin` for `admin_users.role`, `true` for `admin_users.ativo`, and `false` for `admin_users.must_change_password`.

### Requirement 2: Survey structure tables — surveys, questions, question_options, question_rules

**User Story:** As a developer, I want the survey authoring tables defined with keys and constraints, so that surveys, their questions, options, and cascade rules can be stored with referential integrity.

#### Acceptance Criteria

1. THE Migration_System SHALL create a `surveys` table with columns `id` (primary key), `slug`, `nome`, `categoria_id`, `status`, `version` (integer), `mensagem_objetivo`, `tempo_estimado_min`, `config_visual` (JSONB), `link_agendamento`, `email_notificacao`, `usar_ia_no_relatorio` (boolean), `created_by`, `created_at`, and `updated_at`.
2. THE Migration_System SHALL define a UNIQUE constraint on `surveys.slug`.
3. THE Migration_System SHALL define a foreign key from `surveys.categoria_id` referencing `categories.id` and a foreign key from `surveys.created_by` referencing `admin_users.id`.
4. THE Data_Model SHALL define a default value of `1` for `surveys.version` and `false` for `surveys.usar_ia_no_relatorio`.
5. THE Migration_System SHALL create a `questions` table with columns `id` (primary key), `survey_id`, `survey_version` (integer), `texto`, `descricao` (nullable), `tipo` (ENUM), `obrigatoria` (boolean), `ordem` (integer), `peso` (numeric), `dimensao` (nullable), `created_at`, and `updated_at`, with a foreign key from `questions.survey_id` referencing `surveys.id`.
6. THE Migration_System SHALL create a `question_options` table with columns `id` (primary key), `question_id`, `texto`, `pontuacao` (numeric), and `ordem` (integer), with a foreign key from `question_options.question_id` referencing `questions.id`.
7. THE Migration_System SHALL create a `question_rules` table with columns `id` (primary key), `question_option_id`, `next_question_id` (nullable), `finalizar` (boolean), and `priority` (integer), with a foreign key from `question_rules.question_option_id` referencing `question_options.id` and a foreign key from `question_rules.next_question_id` referencing `questions.id`.
8. THE Data_Model SHALL define a default value of `false` for `question_rules.finalizar`.
9. WHERE a `question_rules` row has `next_question_id` set to NULL and `finalizar` set to `true`, THE Data_Model SHALL represent an early-termination rule (as documented in section 8 of the master requirements document).

### Requirement 3: Survey configuration tables — checklist_items, score_ranges

**User Story:** As a developer, I want the checklist catalog and score range tables defined, so that per-survey checklist items and maturity bands can be persisted.

#### Acceptance Criteria

1. THE Migration_System SHALL create a `checklist_items` table with columns `id` (primary key), `survey_id`, `nome`, and `grupo` (ENUM), with a foreign key from `checklist_items.survey_id` referencing `surveys.id`.
2. THE Migration_System SHALL create a `score_ranges` table with columns `id` (primary key), `survey_id`, `nome`, `min` (numeric), `max` (numeric), `descricao`, and `cor`, with a foreign key from `score_ranges.survey_id` referencing `surveys.id`.

### Requirement 4: Response tables — responses, response_answers, response_checklist, response_events

**User Story:** As a developer, I want the response and traceability tables defined with their constraints, so that response sessions, answers, checklist selections, and event timelines can be persisted with integrity.

#### Acceptance Criteria

1. THE Migration_System SHALL create a `responses` table with columns `id` (UUID primary key), `survey_id`, `survey_version` (integer), `token` (UUID), `nome`, `telefone`, `empresa`, `email`, `cargo`, `cidade`, `politica_versao`, `status` (ENUM), `pontuacao` (numeric, nullable), `faixa_id` (nullable), `started_at`, `completed_at` (nullable), `anonimizado` (boolean), `created_at`, and `updated_at`.
2. THE Migration_System SHALL define a UNIQUE constraint on `responses.token`.
3. THE Migration_System SHALL define a foreign key from `responses.survey_id` referencing `surveys.id` and a foreign key from `responses.faixa_id` referencing `score_ranges.id`.
4. THE Data_Model SHALL define a default value of `false` for `responses.anonimizado`.
5. THE Migration_System SHALL create a `response_answers` table with columns `id` (primary key), `response_id`, `question_id`, `question_option_id` (nullable), and `texto_livre` (nullable), with foreign keys referencing `responses.id`, `questions.id`, and `question_options.id` respectively.
6. THE Migration_System SHALL define a UNIQUE constraint on the combination (`response_id`, `question_id`, `question_option_id`) of `response_answers`.
7. THE Migration_System SHALL create a `response_checklist` table with columns `id` (primary key), `response_id`, and `checklist_item_id`, with foreign keys referencing `responses.id` and `checklist_items.id` respectively.
8. THE Migration_System SHALL create a `response_events` table with columns `id` (primary key), `response_id`, `tipo`, `payload` (JSONB, nullable), and `created_at`, with a foreign key from `response_events.response_id` referencing `responses.id`.

### Requirement 5: Reporting and audit tables — reports, ai_generation_logs

**User Story:** As a developer, I want the report and AI audit tables defined, so that generated reports and Bedrock generation logs can be persisted.

#### Acceptance Criteria

1. THE Migration_System SHALL create a `reports` table with columns `id` (primary key), `response_id`, `html_s3_key`, `pdf_s3_key` (nullable), `public_token`, `expires_at`, `created_at`, and `updated_at`.
2. THE Migration_System SHALL define a UNIQUE constraint on `reports.response_id` and a UNIQUE constraint on `reports.public_token`, with a foreign key from `reports.response_id` referencing `responses.id`.
3. THE Migration_System SHALL create an `ai_generation_logs` table with columns `id` (primary key), `admin_user_id`, `survey_id`, `prompt`, `resultado` (JSONB), `tokens_input` (integer, nullable), `tokens_output` (integer, nullable), `sucesso` (boolean), and `created_at`, with foreign keys from `admin_user_id` referencing `admin_users.id` and `survey_id` referencing `surveys.id`.

### Requirement 6: ENUM type definitions

**User Story:** As a developer, I want the enumerated types defined consistently, so that constrained columns only accept valid values.

#### Acceptance Criteria

1. THE Data_Model SHALL constrain `surveys.status` to exactly the values `rascunho`, `ativo`, `inativo`, and `arquivado`.
2. THE Data_Model SHALL constrain `questions.tipo` to exactly the values `escolha_unica`, `multipla_escolha`, and `aberta`.
3. THE Data_Model SHALL constrain `checklist_items.grupo` to exactly the values `servico_cloud`, `fabricante`, and `solucao`.
4. THE Data_Model SHALL constrain `responses.status` to exactly the values `iniciado` and `completo`.

### Requirement 7: JSONB fields and survey versioning

**User Story:** As a developer, I want JSONB structures and the survey versioning concept encoded in the schema, so that visual configuration, event payloads, AI results, and structure snapshots are supported.

#### Acceptance Criteria

1. THE Data_Model SHALL define `surveys.config_visual` as a JSONB column intended to hold the keys `cor_primaria`, `cor_secundaria`, `cor_fundo`, and `logo_s3_key`.
2. THE Data_Model SHALL define `response_events.payload` as a nullable JSONB column.
3. THE Data_Model SHALL define `ai_generation_logs.resultado` as a JSONB column.
4. WHEN a response is created, THE Data_Model SHALL retain the `survey_version` value on both the `responses` row and its associated `questions` (via `questions.survey_version`) so that a response remains interpretable against the survey structure version it answered.

### Requirement 8: Indexes for foreign keys and query paths

**User Story:** As a developer, I want indexes defined on foreign keys and frequent lookup columns, so that dependent specs meet their performance targets.

#### Acceptance Criteria

1. THE Migration_System SHALL create an index on `surveys.slug`.
2. THE Migration_System SHALL create indexes on each foreign key column: `surveys.categoria_id`, `surveys.created_by`, `questions.survey_id`, `question_options.question_id`, `question_rules.question_option_id`, `question_rules.next_question_id`, `checklist_items.survey_id`, `score_ranges.survey_id`, `responses.survey_id`, `responses.faixa_id`, `response_answers.response_id`, `response_answers.question_id`, `response_answers.question_option_id`, `response_checklist.response_id`, `response_checklist.checklist_item_id`, `response_events.response_id`, `reports.response_id`, `ai_generation_logs.admin_user_id`, and `ai_generation_logs.survey_id`.
3. THE Migration_System SHALL create an index on `responses.token` and an index on `reports.public_token`.
4. THE Migration_System SHALL create a composite index on (`response_events.response_id`, `response_events.created_at`) to support timeline retrieval.

### Requirement 9: Lucid ORM models and relationships

**User Story:** As a developer, I want a Lucid model for every table with relationships declared, so that dependent specs query the Data_Model through the ORM_Model_Layer.

#### Acceptance Criteria

1. THE ORM_Model_Layer SHALL define one Lucid model class mapped to each Data_Model table: `Category`, `Survey`, `Question`, `QuestionOption`, `QuestionRule`, `ChecklistItem`, `ScoreRange`, `Response`, `ResponseAnswer`, `ResponseChecklist`, `ResponseEvent`, `Report`, `AdminUser`, and `AiGenerationLog`.
2. THE ORM_Model_Layer SHALL declare a `hasMany` relationship from `Survey` to `Question`, `ChecklistItem`, `ScoreRange`, and `Response`, and a `belongsTo` relationship from `Survey` to `Category` and `AdminUser` (creator).
3. THE ORM_Model_Layer SHALL declare a `hasMany` relationship from `Question` to `QuestionOption`, a `hasMany` relationship from `QuestionOption` to `QuestionRule`, and a `belongsTo` relationship from `QuestionRule` to `Question` (next question).
4. THE ORM_Model_Layer SHALL declare a `hasMany` relationship from `Response` to `ResponseAnswer`, `ResponseChecklist`, and `ResponseEvent`, a `hasOne` relationship from `Response` to `Report`, and a `belongsTo` relationship from `Response` to `Survey` and `ScoreRange` (faixa).
5. THE ORM_Model_Layer SHALL map `surveys.config_visual`, `response_events.payload`, and `ai_generation_logs.resultado` as JSON-serialized attributes.
6. WHERE a column is defined as an ENUM in the Data_Model, THE ORM_Model_Layer SHALL type the corresponding model attribute as a TypeScript union of the allowed literal values.

### Requirement 10: Development seed data

**User Story:** As a developer, I want a seed that creates a demonstration survey and a starter administrator, so that the platform can be exercised locally per Definition of Done item 3.

#### Acceptance Criteria

1. THE Seed_System SHALL create at least one `admin_users` record with a hashed password for local development.
2. THE Seed_System SHALL create at least one `categories` record.
3. THE Seed_System SHALL create one Demonstration_Survey with status `ativo`, a unique slug, and populated `config_visual`.
4. THE Seed_System SHALL create at least 8 questions for the Demonstration_Survey that together include all three values of `questions.tipo` (`escolha_unica`, `multipla_escolha`, and `aberta`).
5. THE Seed_System SHALL create question options with scoring values for every choice-type question of the Demonstration_Survey.
6. THE Seed_System SHALL create at least 2 `question_rules` records for the Demonstration_Survey that define cascade behavior.
7. THE Seed_System SHALL create `checklist_items` for the Demonstration_Survey covering all three values of `checklist_items.grupo`.
8. THE Seed_System SHALL create at least 2 `score_ranges` records for the Demonstration_Survey with non-overlapping `min`/`max` bounds.
9. WHEN the Seed_System is executed a second time against the same database, THE Seed_System SHALL leave the resulting demonstration data in the same shape as after the first execution (idempotent seeding).

### Requirement 11: Base infrastructure-as-code — networking and RDS

**User Story:** As a developer, I want the base networking and database provisioned via AWS CDK, so that the platform has a private PostgreSQL 16 instance as specified in REQ-NFR-001.

#### Acceptance Criteria

1. THE Infrastructure_Stack SHALL be authored as an AWS CDK application in TypeScript (REQ-NFR-001.6).
2. THE Infrastructure_Stack SHALL define a VPC containing at least one private subnet.
3. THE Infrastructure_Stack SHALL provision an Amazon RDS PostgreSQL 16 instance of class `db.t4g.micro` in single-AZ configuration placed in a private subnet (REQ-NFR-001.3).
4. THE Infrastructure_Stack SHALL configure automated RDS backups with a retention period of 7 days (REQ-NFR-001.3).
5. THE Infrastructure_Stack SHALL store the RDS database credentials in AWS Secrets Manager rather than as plaintext configuration (REQ-NFR-002.5).
6. THE Infrastructure_Stack SHALL restrict RDS network access to the security group of the backend compute tier and SHALL NOT expose the instance to the public internet.

### Requirement 12: Base infrastructure-as-code — storage and messaging

**User Story:** As a developer, I want the S3 buckets and SQS queues provisioned via AWS CDK, so that file storage and asynchronous jobs are supported as specified in REQ-NFR-001.

#### Acceptance Criteria

1. THE Infrastructure_Stack SHALL provision one or more S3 buckets for logos and report artifacts with S3 Block Public Access fully enabled (REQ-NFR-001.5).
2. THE Infrastructure_Stack SHALL provision an Amazon SQS standard queue for asynchronous jobs (REQ-NFR-001.4).
3. THE Infrastructure_Stack SHALL provision an Amazon SQS dead-letter queue and associate it with the standard queue via a redrive policy (REQ-NFR-001.4).
4. THE Infrastructure_Stack SHALL enable server-side encryption on the provisioned S3 buckets and SQS queues.

### Requirement 13: Project and repository structure

**User Story:** As a developer, I want the AdonisJS 6 backend and Next.js 15 frontend scaffolding and repository layout established, so that later specs add features into a consistent structure.

#### Acceptance Criteria

1. THE Backend_Project SHALL be scaffolded as an AdonisJS 6 application targeting Node.js 22 with Lucid ORM configured for PostgreSQL.
2. THE Frontend_Project SHALL be scaffolded as a Next.js 15 application using the App Router with TypeScript.
3. THE repository SHALL organize the Backend_Project, the Frontend_Project, and the Infrastructure_Stack as separate, clearly named top-level directories.
4. THE repository SHALL provide a README documenting the deploy steps and the required environment variables (Definition of Done item 5).
5. THE repository SHALL NOT contain any committed secrets or credentials (Definition of Done item 6, REQ-NFR-002.5).

### Requirement 14: TypeScript strict configuration and linting

**User Story:** As a developer, I want strict TypeScript and standardized linting/formatting configured, so that the whole platform meets the code quality bar in REQ-NFR-004.

#### Acceptance Criteria

1. THE Build_Configuration SHALL enable TypeScript `strict` mode in both the Backend_Project and the Frontend_Project (REQ-NFR-004.1).
2. THE Build_Configuration SHALL provide an ESLint configuration and a Prettier configuration for the Backend_Project and the Frontend_Project (REQ-NFR-004.4).
3. THE Build_Configuration SHALL expose a lint command and a format-check command runnable in CI for each project (REQ-NFR-004.4).
4. WHEN a TypeScript source file in either project violates `strict` type checking, THE Build_Configuration SHALL cause the type-check command to report a non-zero exit status.

### Requirement 15: Migration versioning conventions

**User Story:** As a developer, I want versioned, ordered migrations following a documented convention, so that schema evolution is reproducible per REQ-NFR-004.3.

#### Acceptance Criteria

1. THE Migration_System SHALL produce Lucid migration files with sortable timestamp-prefixed filenames so that migrations execute in deterministic order (REQ-NFR-004.3).
2. WHEN the Migration_System is run against an empty PostgreSQL 16 database, THE Migration_System SHALL create the complete Data_Model without error.
3. WHEN a migration is rolled back, THE Migration_System SHALL revert the schema changes introduced by that migration through its `down` method.
4. THE repository SHALL document the migration naming and ordering convention alongside the deploy instructions.
