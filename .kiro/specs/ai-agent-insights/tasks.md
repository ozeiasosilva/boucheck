# Implementation Plan: AI Agent Insights

## Overview

Implement AI-powered insights via AWS Bedrock for the BouCheck platform, covering: survey aggregate insights (dashboard), individual client insights (response detail), interaction history tracking, and prompt configuration. The implementation reuses the existing `BedrockClient` and follows the established AdonisJS 6 controller → service → validator layering with Next.js frontend pages.

## Tasks

- [x] 1. Create database migrations and models
  - [x] 1.1 Create migration `create_survey_insights`
    - Create table `survey_insights` with columns: id (bigIncrements PK), survey_id (bigInteger FK → surveys, NOT NULL), admin_user_id (bigInteger FK → admin_users, NOT NULL), conteudo (text, NOT NULL), tokens_input (integer, nullable), tokens_output (integer, nullable), created_at (timestamp with tz, NOT NULL, default now)
    - Add composite index `idx_survey_insights_survey_latest` on (survey_id, created_at)
    - _Requirements: 7.1_

  - [x] 1.2 Create migration `create_client_insights`
    - Create table `client_insights` with columns: id (bigIncrements PK), response_id (uuid FK → responses, NOT NULL), admin_user_id (bigInteger FK → admin_users, NOT NULL), conteudo (text, NOT NULL), tokens_input (integer, nullable), tokens_output (integer, nullable), created_at (timestamp with tz, NOT NULL, default now)
    - Add composite index `idx_client_insights_response_latest` on (response_id, created_at)
    - _Requirements: 7.2_

  - [x] 1.3 Create migration `create_interaction_histories`
    - Create table `interaction_histories` with columns: id (bigIncrements PK), response_id (uuid FK → responses, NOT NULL), admin_user_id (bigInteger FK → admin_users, NOT NULL), tipo (varchar(50), NOT NULL), observacao (text, nullable), created_at (timestamp with tz, NOT NULL, default now)
    - Add composite index `idx_interaction_histories_response_date` on (response_id, created_at)
    - _Requirements: 7.3_

  - [x] 1.4 Create migration `create_ai_prompt_configs`
    - Create table `ai_prompt_configs` with columns: id (bigIncrements PK), tipo (varchar(30), NOT NULL, unique), conteudo (text, NOT NULL), admin_user_id (bigInteger FK → admin_users, NOT NULL), updated_at (timestamp with tz, NOT NULL, default now)
    - _Requirements: 7.4_

  - [x] 1.5 Create Lucid model `SurveyInsight` (`backend/app/models/survey_insight.ts`)
    - Define columns, belongsTo relationships (Survey, AdminUser), table name
    - _Requirements: 7.1, 7.5_

  - [x] 1.6 Create Lucid model `ClientInsight` (`backend/app/models/client_insight.ts`)
    - Define columns, belongsTo relationships (Response, AdminUser), table name
    - _Requirements: 7.2, 7.6_

  - [x] 1.7 Create Lucid model `InteractionHistory` (`backend/app/models/interaction_history.ts`)
    - Define columns, belongsTo relationships (Response, AdminUser), InteractionType type, INTERACTION_TYPES constant
    - _Requirements: 7.3, 3.3_

  - [x] 1.8 Create Lucid model `AiPromptConfig` (`backend/app/models/ai_prompt_config.ts`)
    - Define columns, belongsTo relationship (AdminUser), AgentType type
    - _Requirements: 7.4_

- [x] 2. Implement core services
  - [x] 2.1 Implement `PromptResolver` (`backend/app/services/prompt_resolver.ts`)
    - Define default prompts for 'survey_agent' and 'client_agent' as static constants
    - Implement `resolve(tipo: AgentType)`: query `ai_prompt_configs` by tipo, return custom conteudo if found, else default
    - Export `AgentType` type
    - _Requirements: 4.6, 4.7_

  - [x] 2.2 Implement `InteractionHistoryService` (`backend/app/services/interaction_history_service.ts`)
    - Export `INTERACTION_TYPES` constant with the 8 predefined types
    - Implement `create(data)`: insert new InteractionHistory record (append-only)
    - Implement `list(responseId, page, perPage=20)`: paginated query ordered by created_at DESC
    - Implement `getAllForPrompt(responseId)`: return all records for prompt inclusion
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.7_

  - [x] 2.3 Implement `SurveyInsightService` (`backend/app/services/survey_insight_service.ts`)
    - Inject `BedrockClient` and `PromptResolver`
    - Implement `isEligible(surveyId)`: check at least 1 completed response exists
    - Implement `buildUserPrompt(responses)`: format aggregated quantitative + qualitative data
    - Implement `generate(surveyId, adminUserId)`: fetch completed responses, resolve prompt, build user prompt, invoke Bedrock, persist SurveyInsight
    - Implement `getLatest(surveyId)`: query ordered by created_at DESC LIMIT 1
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 2.4 Implement `ClientInsightService` (`backend/app/services/client_insight_service.ts`)
    - Inject `BedrockClient` and `PromptResolver`
    - Implement `buildUserPrompt(data)`: format client answers, identification (nome, empresa, cargo, cidade), and interaction history
    - Implement `generate(responseId, adminUserId)`: fetch response with answers/identification, fetch interaction history, resolve prompt, build user prompt, invoke Bedrock, persist ClientInsight
    - Implement `getLatest(responseId)`: query ordered by created_at DESC LIMIT 1
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ]* 2.5 Write property test for survey prompt builder (Property 1)
    - **Property 1: Survey prompt includes only completed responses**
    - Generate arrays of responses with random statuses (started, completed, abandoned)
    - Assert: `buildSurveyUserPrompt` output contains data only from completed responses
    - Minimum 100 iterations with fast-check
    - **Validates: Requirements 1.2**

  - [ ]* 2.6 Write property test for client prompt builder (Property 2)
    - **Property 2: Client prompt includes all required data sections**
    - Generate response data with random answers, identification fields, and interaction history entries
    - Assert: `buildClientUserPrompt` output contains all answer texts, non-null identification fields, and all interaction records
    - Minimum 100 iterations with fast-check
    - **Validates: Requirements 2.2, 3.5**

  - [ ]* 2.7 Write property test for prompt resolution (Property 8)
    - **Property 8: Prompt resolution uses custom when available, default otherwise**
    - Generate agent types with randomly present/absent custom configs
    - Assert: resolve returns custom conteudo when record exists, default prompt otherwise
    - Minimum 100 iterations with fast-check
    - **Validates: Requirements 4.6, 4.7**

- [x] 3. Implement validators
  - [x] 3.1 Create insight validators (`backend/app/validators/insight_validators.ts`)
    - `generateSurveyInsightValidator`: survey_id (number, positive)
    - `generateClientInsightValidator`: response_id (string, uuid)
    - `createInteractionValidator`: tipo (enum of INTERACTION_TYPES), observacao (string, maxLength 500, optional)
    - `updatePromptsValidator`: survey_agent_prompt (string, maxLength 10000, optional), client_agent_prompt (string, maxLength 10000, optional)
    - _Requirements: 1.1, 2.1, 3.2, 3.3, 4.1, 4.4_

  - [ ]* 3.2 Write property test for interaction validation (Property 6)
    - **Property 6: Interaction entry validation**
    - Generate arbitrary strings for tipo and observacao with varying lengths
    - Assert: validation succeeds iff tipo is one of the 8 predefined types AND observacao ≤ 500 chars
    - Minimum 100 iterations with fast-check
    - **Validates: Requirements 3.2, 3.3**

  - [ ]* 3.3 Write property test for prompt length validation (Property 9)
    - **Property 9: Prompt length validation**
    - Generate strings with lengths ranging from 0 to 15000 characters
    - Assert: validation succeeds for length ≤ 10000, fails for length > 10000
    - Minimum 100 iterations with fast-check
    - **Validates: Requirements 4.1, 4.4**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement controllers and routes
  - [x] 5.1 Implement `InsightController` (`backend/app/controllers/admin/insight_controller.ts`)
    - `generateSurvey`: validate body, check survey eligibility, call SurveyInsightService.generate, return 200 with insight
    - `showSurvey`: call SurveyInsightService.getLatest, return 200 with insight or null
    - `generateClient`: validate body, check response exists and is not anonymized, call ClientInsightService.generate, return 200 with insight
    - `showClient`: call ClientInsightService.getLatest, return 200 with insight or null
    - Map BedrockTimeoutError → 504, BedrockInvocationError → 502
    - _Requirements: 1.1, 1.4, 1.5, 1.6, 1.7, 1.8, 2.1, 2.4, 2.5, 2.6, 2.7, 6.2, 7.5, 7.6, 7.7_

  - [x] 5.2 Implement `InteractionHistoryController` (`backend/app/controllers/admin/interaction_history_controller.ts`)
    - `index`: validate responseId param, call InteractionHistoryService.list with pagination, return 200
    - `store`: validate body with createInteractionValidator, call InteractionHistoryService.create, return 201
    - _Requirements: 3.1, 3.2, 3.4, 3.6, 3.7_

  - [x] 5.3 Implement `AiPromptConfigController` (`backend/app/controllers/admin/ai_prompt_config_controller.ts`)
    - `show`: query both prompt configs, return with is_default flag indicating whether custom exists
    - `update`: validate body with updatePromptsValidator, upsert prompt configs, return 200 with confirmation
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.8_

  - [x] 5.4 Register routes (`backend/start/routes.ts`)
    - Add all 8 endpoints under `/api/admin` group with auth + ensureAdminActive middleware:
      - POST `/api/admin/insights/survey` → InsightController.generateSurvey
      - GET `/api/admin/insights/survey/:surveyId` → InsightController.showSurvey
      - POST `/api/admin/insights/client` → InsightController.generateClient
      - GET `/api/admin/insights/client/:responseId` → InsightController.showClient
      - GET `/api/admin/responses/:responseId/interactions` → InteractionHistoryController.index
      - POST `/api/admin/responses/:responseId/interactions` → InteractionHistoryController.store
      - GET `/api/admin/ai-config/prompts` → AiPromptConfigController.show
      - PUT `/api/admin/ai-config/prompts` → AiPromptConfigController.update
    - _Requirements: 8.1, 8.5_

  - [ ]* 5.5 Write property test for survey eligibility (Property 5)
    - **Property 5: Survey eligibility requires completed responses**
    - Generate surveys with varying numbers of responses in different statuses
    - Assert: isEligible returns true iff at least one response has status "completed"
    - Minimum 100 iterations with fast-check
    - **Validates: Requirements 1.7**

  - [ ]* 5.6 Write property test for latest insight retrieval (Property 3)
    - **Property 3: Latest survey insight retrieval**
    - Insert N insights with distinct created_at timestamps for a survey
    - Assert: getLatest returns the one with most recent created_at; all N records remain in DB
    - Minimum 100 iterations with fast-check
    - **Validates: Requirements 1.5, 1.6, 7.5**

  - [ ]* 5.7 Write property test for latest client insight retrieval (Property 4)
    - **Property 4: Latest client insight retrieval**
    - Insert N client insights with distinct created_at timestamps for a response
    - Assert: getLatest returns the one with most recent created_at; all N records remain in DB
    - Minimum 100 iterations with fast-check
    - **Validates: Requirements 2.5, 2.6, 7.6**

  - [ ]* 5.8 Write property test for interaction history ordering (Property 7)
    - **Property 7: Interaction history ordering and pagination**
    - Generate interaction entries with random timestamps for a response
    - Assert: list returns entries ordered by created_at descending, max 20 per page
    - Minimum 100 iterations with fast-check
    - **Validates: Requirements 3.4**

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement frontend - Dashboard insight
  - [x] 7.1 Create API client functions for insights (`frontend/lib/api/insights.ts`)
    - `generateSurveyInsight(surveyId)`: POST to `/api/admin/insights/survey`
    - `getSurveyInsight(surveyId)`: GET from `/api/admin/insights/survey/:surveyId`
    - `generateClientInsight(responseId)`: POST to `/api/admin/insights/client`
    - `getClientInsight(responseId)`: GET from `/api/admin/insights/client/:responseId`
    - `getInteractions(responseId, page)`: GET from `/api/admin/responses/:responseId/interactions`
    - `createInteraction(responseId, data)`: POST to `/api/admin/responses/:responseId/interactions`
    - `getPromptConfigs()`: GET from `/api/admin/ai-config/prompts`
    - `updatePromptConfigs(data)`: PUT to `/api/admin/ai-config/prompts`
    - _Requirements: 1.1, 2.1, 3.1, 4.3_

  - [x] 7.2 Create `InsightButton` component and `InsightCard` component
    - `InsightButton`: displays "Insight com Agente", shows spinner + "Gerando Insight..." while loading, disabled during processing
    - `InsightCard`: renders insight text in a dedicated card with generation date
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 7.3 Integrate insight UI in Dashboard page (`frontend/app/admin/dashboard/`)
    - Show "Insight com Agente" button below filters when a specific survey is selected (not "Todos os surveys")
    - Hide button when filter is "Todos os surveys"
    - Load existing insight on survey selection
    - On click: call generateSurveyInsight, display loading state, show result or error
    - Disable button when no completed responses exist
    - _Requirements: 1.7, 1.9, 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 8. Implement frontend - Client insight and interaction history
  - [x] 8.1 Create `InteractionHistorySection` component
    - Display "Acompanhamento Comercial" section with list of interactions (tipo, observacao, date)
    - Form to add new interaction: dropdown for tipo (8 options), optional observacao textarea (max 500 chars)
    - Paginated list (20 per page), ordered by date descending
    - Error handling for failed saves
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6_

  - [x] 8.2 Integrate insight and interaction history in Response Detail page (`frontend/app/admin/responses/`)
    - Show "Insight com Agente" button after response answers section
    - Hide button and insight area if response is anonymized
    - Show loading indicator during generation
    - Display existing insight (if any) below the button with generation date
    - Show "Acompanhamento Comercial" section after insight area
    - Handle errors (timeout, invocation error) with user-friendly messages
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [x] 9. Implement frontend - AI configuration page
  - [x] 9.1 Create AI Config page (`frontend/app/admin/ai-config/page.tsx`)
    - Two textarea fields: one for Agente_Survey prompt, one for Agente_Cliente prompt
    - Show default prompt as placeholder when no custom prompt is saved
    - Max 10000 characters per field with character counter
    - Save button that calls updatePromptConfigs
    - Success confirmation on save
    - Error handling: character limit exceeded, server unavailability (preserve edited content)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.8_

  - [x] 9.2 Add "Configurações" menu item to admin navigation
    - Add navigation link to `/admin/ai-config` in the admin layout sidebar/menu
    - _Requirements: 4.8_

- [ ] 10. Integration wiring and final validation
  - [ ]* 10.1 Write property test for interaction immutability (Property 10)
    - **Property 10: Interaction history immutability**
    - Verify that no PUT or DELETE routes exist for interaction_histories endpoints
    - Assert: API surface only exposes GET and POST for interactions
    - Minimum 100 iterations with fast-check
    - **Validates: Requirements 3.7**

  - [ ]* 10.2 Write property test for FK violation handling (Property 11)
    - **Property 11: Foreign key violation graceful handling**
    - Generate random non-existent IDs for survey_id, response_id, admin_user_id
    - Assert: creation attempts return appropriate error without creating partial records
    - Minimum 100 iterations with fast-check
    - **Validates: Requirements 7.7**

  - [ ]* 10.3 Write unit tests for error paths
    - Test: BedrockTimeoutError → 504 response
    - Test: BedrockInvocationError → 502 response
    - Test: Survey with no completed responses → button disabled / 422 on generation attempt
    - Test: Anonymized response → insight generation blocked
    - Test: Auth guard: no token → 401, inactive admin → 401
    - _Requirements: 1.7, 1.8, 2.7, 6.2, 6.6, 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 10.4 Write integration tests for auth middleware and route registration
    - Test: All 8 routes registered under `/api/admin` prefix
    - Test: Requests without valid token → 401
    - Test: Requests with inactive admin → 401
    - Test: Middleware chain matches auth + ensureAdminActive
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The existing `BedrockClient` (`backend/app/support/bedrock_client.ts`) is reused as-is — no modifications needed
- All services follow the append-only pattern for insights: new records are always INSERT, queries return the latest by created_at
- Interaction history is immutable after creation (no PUT/DELETE endpoints)
- Frontend uses the existing admin layout and navigation patterns

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["1.5", "1.6", "1.7", "1.8"] },
    { "id": 2, "tasks": ["2.1", "2.2", "3.1"] },
    { "id": 3, "tasks": ["2.3", "2.4"] },
    { "id": 4, "tasks": ["2.5", "2.6", "2.7", "3.2", "3.3"] },
    { "id": 5, "tasks": ["5.1", "5.2", "5.3", "5.4"] },
    { "id": 6, "tasks": ["5.5", "5.6", "5.7", "5.8"] },
    { "id": 7, "tasks": ["7.1"] },
    { "id": 8, "tasks": ["7.2", "7.3", "8.1", "8.2"] },
    { "id": 9, "tasks": ["9.1", "9.2"] },
    { "id": 10, "tasks": ["10.1", "10.2", "10.3", "10.4"] }
  ]
}
```
