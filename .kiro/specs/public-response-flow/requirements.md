# Requirements Document

## Introduction

This document specifies the requirements for the **public-response-flow** spec, which is spec 5 of 7 for the BouCheck platform. It defines the **public (unauthenticated) respondent experience** and the **runtime conditional navigation engine** — the flow a lead follows from opening a survey URL, through LGPD identification, answering one question at a time with conditional branching, an optional final checklist, up to marking the response session complete.

This spec traces to master requirements `REQ-PUB-001` through `REQ-PUB-006` and to the public API contracts in section 9 of the master requirements document. It also traces to the non-functional requirements `REQ-NFR-002` (security) and `REQ-NFR-003` (performance).

**Dependencies (not redefined here):**
- **foundation-data-model** provides the persisted models: `surveys`, `questions`, `question_options`, `question_rules`, `checklist_items`, `responses`, `response_answers`, `response_checklist`, and `response_events`, including their columns, ENUM values, keys, and indexes.
- **survey-authoring** is where surveys are configured, activated, and where the conditional rule graph is validated at config time. This spec assumes the forward-only, acyclic rule graph is already guaranteed valid; the public engine does not re-validate graph structure.

**Explicitly out of scope (covered by other specs):**
- Report score calculation, report content, HTML/PDF generation, and WhatsApp/e-mail delivery (`REQ-PUB-007` / REQ-REP — the **reporting** spec). The completion endpoint is a **boundary**: this spec covers revalidating the answered path, transitioning the session to `completo`, recording `completed_at`, and triggering (handing off to) score calculation, but the actual calculation, report artifacts, and delivery belong to the reporting spec.
- The admin tracking list, session detail timeline, and dashboard.
- Admin authentication and admin-side configuration.

## Glossary

- **Public_Site**: The Next.js 15 public (unauthenticated) web experience rendered at `boucheck.beonup.com.br/{slug}`.
- **Public_API**: The AdonisJS 6 REST endpoints served under `/api/public` that support the respondent flow.
- **Respondent**: An unauthenticated person who accesses a survey by its slug and answers it, identified by identification-form data plus a Response_Token.
- **Slug**: The unique URL identifier of a survey (for example `maturidadeti`), defined in the `surveys.slug` column.
- **Active_Survey**: A survey whose `surveys.status` value is `ativo`.
- **Visual_Identity**: The per-survey presentation configuration held in `surveys.config_visual` (`cor_primaria`, `cor_secundaria`, `cor_fundo`, `logo_s3_key`).
- **Response_Session**: A row in the `responses` table representing one respondent's fill of one survey, keyed by a UUID and a UUID `token`.
- **Response_Token**: The UUID `responses.token` returned when a Response_Session is created; it authorizes all subsequent write operations for that session.
- **Identification_Form**: The LGPD data-collection form presented before the first question, collecting Nome, Telefone, Empresa, E-mail, Cargo, and Cidade plus privacy-policy acceptance.
- **Policy_Version**: The identifier of the privacy policy version in effect when a Respondent accepts it, persisted to `responses.politica_versao`.
- **Survey_Structure**: The complete set of a survey's questions, options, and rules for a given `survey_version`, delivered by the Public_API in a single response for the Navigation_Engine.
- **Navigation_Engine**: The frontend runtime component that determines the next question from the current answer and the Survey_Structure, without a per-question server round-trip.
- **Question_Rule**: A branching rule attached to a `question_option`, defined in `question_rules` (`next_question_id`, `finalizar`, `priority`), where a lower `priority` number denotes higher precedence.
- **Answered_Path**: The ordered sequence of questions a Respondent has actually reached and answered, as determined by the Navigation_Engine and their answers.
- **Response_Event**: A traceability record in `response_events` (`tipo`, `payload`, `created_at`) logged during the respondent flow.
- **Checklist_Step**: The optional final step presenting `checklist_items` grouped by `servico_cloud`, `fabricante`, and `solucao` as searchable multi-selects.

## Requirements

### Requirement 1: Access survey by slug (REQ-PUB-001)

**User Story:** As a Respondent, I want to open a survey through a friendly URL, so that I can answer the diagnostic without prior registration.

#### Acceptance Criteria

1. WHEN a Respondent requests `boucheck.beonup.com.br/{slug}` AND an Active_Survey with that Slug exists, THE Public_Site SHALL render the survey initial page applying the survey's Visual_Identity (`cor_primaria`, `cor_secundaria`, `cor_fundo`, and logo resolved from `logo_s3_key`).
2. IF the requested Slug does not match any survey, THEN THE Public_Site SHALL respond with HTTP status 404 and render a branded BouCheck not-found page.
3. IF the requested Slug matches a survey whose `status` is `rascunho`, `inativo`, or `arquivado`, THEN THE Public_Site SHALL respond with HTTP status 404 and render a branded BouCheck not-found page.
4. THE Public_Site SHALL serve every Active_Survey at its own Slug independently, such that multiple Active_Survey records are accessible simultaneously.
5. THE Public_Site SHALL render the survey initial page using server-side rendering.
6. WHEN the survey initial page is server-side rendered, THE Public_Site SHALL include Open Graph metadata containing the survey title, a description, and an image.
7. WHEN the Public_API receives `GET /api/public/surveys/{slug}` for an Active_Survey, THE Public_API SHALL return the survey initial-page metadata including `nome`, `mensagem_objetivo`, `tempo_estimado_min`, and Visual_Identity fields.
8. IF the Public_API receives `GET /api/public/surveys/{slug}` for a Slug that does not resolve to an Active_Survey, THEN THE Public_API SHALL respond with HTTP status 404.

### Requirement 2: Initial screen — objective and explanatory message (REQ-PUB-002)

**User Story:** As a Respondent, I want to understand the survey's objective before starting, so that I can decide whether it is worth my time.

#### Acceptance Criteria

1. WHEN the survey initial page is displayed, THE Public_Site SHALL present the survey `nome`, the objective message from `mensagem_objetivo`, the estimated completion time from `tempo_estimado_min`, and an "Iniciar" action.
2. THE Public_Site SHALL render the objective message as formatted rich text supporting bold, italic, and lists.
3. WHEN the Respondent activates the "Iniciar" action, THE Public_Site SHALL present the Identification_Form before displaying any question.

### Requirement 3: Privacy-policy acceptance and identification (LGPD) (REQ-PUB-003)

**User Story:** As a Respondent, I want to know how my data will be used and provide my contact details, so that I can receive the diagnostic report.

#### Acceptance Criteria

1. WHEN the Identification_Form is displayed, THE Public_Site SHALL present the required fields Nome, Telefone (with the Brazilian mask `+55 (00) 00000-0000`), Empresa, E-mail, Cargo, and Cidade.
2. THE Public_Site SHALL present a privacy-policy acceptance checkbox labeled "Li e aceito a Política de Privacidade" with a link that opens the privacy policy in a new browser tab.
3. WHILE the privacy-policy acceptance checkbox is unchecked, THE Public_Site SHALL keep the proceed action disabled.
4. WHILE any required Identification_Form field is empty, THE Public_Site SHALL keep the proceed action disabled.
5. WHEN the Respondent submits the Identification_Form with a valid E-mail, a valid Telefone, all required fields populated, and the acceptance checkbox checked, THE Public_API SHALL create a Response_Session with `status` set to `iniciado`.
6. WHEN a Response_Session is created, THE Public_API SHALL record the `started_at` timestamp on the Response_Session.
7. WHEN a Response_Session is created, THE Public_API SHALL record the Policy_Version on the Response_Session (`politica_versao`) and log a Response_Event of type `privacidade_aceita` whose payload includes the acceptance timestamp and the Policy_Version.
8. WHEN a Response_Session is created, THE Public_API SHALL return the Response_Token (the UUID `responses.token`) in the response body.
9. IF the submitted E-mail is not a syntactically valid e-mail address, THEN THE Public_API SHALL reject the submission with HTTP status 422 and SHALL NOT create a Response_Session.
10. IF the submitted Telefone does not match the Brazilian phone format, THEN THE Public_API SHALL reject the submission with HTTP status 422 and SHALL NOT create a Response_Session.
11. IF any required Identification_Form field is absent from the submission, THEN THE Public_API SHALL reject the submission with HTTP status 422 and SHALL NOT create a Response_Session.
12. WHEN the submitted E-mail already has a Response_Session with `status` `iniciado` for the same survey whose `started_at` is within the last 7 days, THE Public_Site SHALL offer the Respondent a choice to resume the existing Response_Session or start a new one.
13. WHEN the Respondent chooses to resume an existing Response_Session, THE Public_Site SHALL continue that Response_Session using its existing Response_Token.
14. WHEN the Respondent chooses to start a new session while a resumable Response_Session exists, THE Public_API SHALL create a new Response_Session with a new Response_Token.

### Requirement 4: Question navigation and answering (REQ-PUB-004)

**User Story:** As a Respondent, I want to answer questions one at a time with a progress indication on any device, so that I can complete the survey comfortably.

#### Acceptance Criteria

1. THE Public_Site SHALL display one question at a time together with a progress bar reflecting the estimated path completion percentage.
2. THE Public_Site SHALL render `escolha_unica` questions as single-select controls, `multipla_escolha` questions as multi-select controls, and `aberta` questions as a text area.
3. THE Public_Site SHALL limit `aberta` answer text to 2000 characters.
4. IF the current question has `obrigatoria` set to `true` AND the Respondent attempts to advance without providing an answer, THEN THE Public_Site SHALL display a validation message and SHALL prevent advancing.
5. WHERE the current question has `obrigatoria` set to `false`, THE Public_Site SHALL present a "Pular" action that advances without recording an answer.
6. WHEN the Respondent answers a question, THE Public_API SHALL persist the answer to the Response_Session immediately upon that answer via `PUT /api/public/responses/{token}/answers/{questionId}`.
7. WHEN an answer is persisted, THE Public_API SHALL log a Response_Event of type `pergunta_respondida` whose payload includes the `question_id` and a timestamp.
8. THE Public_Site SHALL allow the Respondent to navigate back to a previously answered question and change its answer.
9. WHEN the Respondent changes an answer that controls conditional branching such that one or more previously answered questions are no longer on the Answered_Path, THE Public_API SHALL delete the persisted answers of those off-path questions from the Response_Session.
10. WHEN `PUT /api/public/responses/{token}/answers/{questionId}` is called with a `questionId` that does not belong to the survey of the Response_Session, THE Public_API SHALL respond with HTTP status 422 and SHALL NOT persist an answer.
11. THE Public_Site SHALL render the respondent flow as a mobile-first responsive layout.

### Requirement 5: Runtime conditional navigation engine (REQ-PUB-005)

**User Story:** As a Respondent, I want the survey to show only questions relevant to my context based on my previous answers, so that I answer a personalized path.

#### Acceptance Criteria

1. WHEN the Public_API receives `GET /api/public/surveys/{slug}/structure` for an Active_Survey, THE Public_API SHALL return the complete Survey_Structure (questions, options, and rules) for that survey's current `survey_version` in a single response.
2. THE Navigation_Engine SHALL run in the frontend using the Survey_Structure delivered by `GET /api/public/surveys/{slug}/structure`, without a per-question server round-trip.
3. WHEN the Respondent selects an option that has an associated Question_Rule with a `next_question_id`, THE Navigation_Engine SHALL present the question identified by that `next_question_id` as the next question.
4. WHEN the Respondent selects an option that has no associated Question_Rule, THE Navigation_Engine SHALL present the next question in ascending `ordem` sequence as the next question.
5. WHEN the Respondent selects an option whose Question_Rule has `finalizar` set to `true` and `next_question_id` NULL, THE Navigation_Engine SHALL advance directly to the Checklist_Step or, where no Checklist_Step applies, to the completion step.
6. WHERE the current question is `multipla_escolha` AND more than one selected option has an associated Question_Rule, THE Navigation_Engine SHALL apply the Question_Rule with the lowest `priority` number.
7. THE Navigation_Engine SHALL determine navigation assuming the rule graph is acyclic and forward-only, without performing cycle detection.
8. WHEN `POST /api/public/responses/{token}/complete` is received, THE Public_API SHALL revalidate that the persisted answers of the Response_Session form a valid Answered_Path under the Survey_Structure before marking completion.
9. IF the persisted answers of the Response_Session do not form a valid Answered_Path during completion revalidation, THEN THE Public_API SHALL respond with HTTP status 422 and SHALL NOT transition the Response_Session to `completo`.

### Requirement 6: Final checklist step (REQ-PUB-006)

**User Story:** As a Respondent, I want to indicate at the end which cloud services, vendors, and solutions I use or am interested in, so that the consultant arrives prepared.

#### Acceptance Criteria

1. WHEN the Respondent reaches the end of the question path AND the survey has `checklist_items` configured, THE Public_Site SHALL present the Checklist_Step with three groups (`servico_cloud`, `fabricante`, `solucao`) each rendered as a searchable multi-select.
2. THE Public_Site SHALL populate each Checklist_Step group from the survey's configured `checklist_items` for the matching `grupo`.
3. WHEN the Respondent reaches the end of the question path AND the survey has no `checklist_items` configured, THE Public_Site SHALL skip the Checklist_Step and proceed to the completion step.
4. THE Public_Site SHALL present a "Pular esta etapa" action on the Checklist_Step that proceeds to the completion step without recording checklist selections.
5. WHEN the Respondent confirms the Checklist_Step selections via `POST /api/public/responses/{token}/checklist`, THE Public_API SHALL persist the selected `checklist_item` references to the Response_Session (`response_checklist`).
6. IF a submitted checklist item does not belong to the survey of the Response_Session, THEN THE Public_API SHALL respond with HTTP status 422 and SHALL NOT persist that checklist selection.

### Requirement 7: Completion transition (boundary with reporting) (REQ-PUB-005/REQ-PUB-007 boundary)

**User Story:** As a Respondent, I want my completed submission to be finalized so that my result can be produced, so that I receive my diagnostic.

#### Acceptance Criteria

1. WHEN `POST /api/public/responses/{token}/complete` is received AND completion revalidation (Requirement 5) succeeds, THE Public_API SHALL set the Response_Session `status` to `completo`.
2. WHEN a Response_Session transitions to `completo`, THE Public_API SHALL record the `completed_at` timestamp on the Response_Session.
3. WHEN a Response_Session transitions to `completo`, THE Public_API SHALL log a Response_Event of type `concluido` with a timestamp.
4. WHEN a Response_Session transitions to `completo`, THE Public_API SHALL trigger the reporting spec's score calculation and report handoff for that Response_Session; the calculation, report artifacts, and delivery are performed by the reporting spec and are outside this spec.
5. IF `POST /api/public/responses/{token}/complete` is received for a Response_Session whose `status` is already `completo`, THEN THE Public_API SHALL respond with HTTP status 200 without re-triggering the reporting handoff and without changing `completed_at`.

### Requirement 8: Response-event logging endpoint (section 9)

**User Story:** As a Respondent, I want my interface actions to be recorded, so that the platform can trace the fill funnel.

#### Acceptance Criteria

1. WHEN `POST /api/public/responses/{token}/events` is received with a valid event type for the Response_Session, THE Public_API SHALL create a Response_Event of that type linked to the Response_Session with a `created_at` timestamp.
2. WHEN the survey initial page is accessed, THE Public_API SHALL record a Response_Event of type `pagina_acessada`.
3. IF `POST /api/public/responses/{token}/events` is received with an event type that is not a recognized public event type, THEN THE Public_API SHALL respond with HTTP status 422 and SHALL NOT create a Response_Event.

### Requirement 9: Public write authorization and rate limiting (REQ-NFR-002)

**User Story:** As the platform operator, I want public endpoints protected, so that the respondent flow resists abuse and unauthorized writes.

#### Acceptance Criteria

1. IF a write request to `PUT /api/public/responses/{token}/answers/{questionId}`, `POST /api/public/responses/{token}/checklist`, `POST /api/public/responses/{token}/complete`, or `POST /api/public/responses/{token}/events` omits a Response_Token or presents a Response_Token that does not match an existing Response_Session, THEN THE Public_API SHALL respond with HTTP status 401 and SHALL NOT perform the write.
2. WHEN more than 30 requests from a single client IP address are received within a 60-second window on Public_API endpoints, THE Public_API SHALL respond to the excess requests with HTTP status 429.
3. THE Public_API SHALL serve every endpoint over HTTPS.
4. WHEN the Public_API writes application logs, THE Public_API SHALL mask personal data by writing e-mail and telephone values in an obfuscated form rather than in clear text.

### Requirement 10: Public flow performance (REQ-NFR-003)

**User Story:** As a Respondent on a mobile connection, I want the survey to load and respond quickly, so that I stay engaged.

#### Acceptance Criteria

1. WHEN the survey initial page is loaded over a simulated 4G connection, THE Public_Site SHALL reach Largest Contentful Paint within 2.5 seconds.
2. WHEN Public_API response endpoints are measured under the target load, THE Public_API SHALL serve responses with a 95th-percentile latency within 500 milliseconds.
