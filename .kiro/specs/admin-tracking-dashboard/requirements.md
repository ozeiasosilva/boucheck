# Requirements Document

## Introduction

This document specifies requirements for the **admin-tracking-dashboard** spec, spec 7 of 7 (the final spec) for the BouCheck platform. It defines the administrator-facing response tracking and traceability surface and the indicators dashboard: listing and filtering Response_Sessions, viewing a session's full detail and Event_Timeline, computing per-question fill time, exporting the filtered listing to CSV, manually re-triggering failed report deliveries, anonymizing a respondent's personal data on request (LGPD), and the aggregated indicators dashboard.

This spec traces to master requirements REQ-ADM-007 (response tracking and traceability), REQ-ADM-008 (indicators dashboard), the relevant section 9 admin API contracts (`GET /responses`, `GET /responses/{id}`, `POST /responses/{id}/resend`, `GET /responses/export.csv`, `GET /dashboard`), and REQ-NFR-003.3 (performance/capacity), which informs the 3-second dashboard load target defined by REQ-ADM-008.3.

**Dependencies (not redefined here):**
- **foundation-data-model** (spec 1 of 7) provides the persisted models this spec reads: `responses`, `response_answers`, `response_checklist`, `response_events`, `surveys`, `questions`, `question_options`, and `checklist_items`, together with their columns, ENUM values, keys, and indexes. This spec consumes these tables and their Lucid models as-is and does not redefine their schema.
- **admin-auth-users** (spec 2 of 7) provides administrator authentication and the `/api/admin` middleware chain (bearer-token auth guard plus `EnsureAdminActive`) and controller/service/validator layering conventions. Every route this spec defines sits behind that existing chain; authentication, session, and admin-user management behavior are not redefined here.
- **reporting-delivery** (spec 6 of 7) defines the `relatorio_envio_falhou` Response_Event (logged after 3 failed delivery attempts, with a payload identifying the failed Delivery_Channel and reason), the `Reporting_Queue`, and the `Email_Delivery_Worker`/`WhatsApp_Delivery_Worker` Delivery_Job contracts. This spec's manual resend capability re-enqueues a Delivery_Job through those existing contracts; it does not redefine delivery mechanics, retry counting, or worker behavior.

**Explicitly out of scope (covered by other specs):**
- Survey, question, option, rule, checklist, and score-range authoring (`survey-authoring` spec).
- The public respondent flow, including identification, navigation, and event emission prior to admin consumption (`public-response-flow` spec).
- AI-assisted question generation (`ai-question-generation` spec).
- Score calculation, maturity-band classification, report content assembly, and the automatic (non-admin-triggered) delivery mechanics, including the automatic retry-then-fail sequence that produces `relatorio_envio_falhou` (`reporting-delivery` spec).
- Administrator authentication and administrator user management (`admin-auth-users` spec).

## Glossary

- **Response_Session**: A row in the `responses` table representing one respondent's fill of one survey, reused from foundation-data-model.
- **Response_Event**: A row in the `response_events` table recording one timestamped occurrence for a Response_Session, reused from foundation-data-model and populated by public-response-flow and reporting-delivery.
- **Session_Listing**: The paginated, filterable collection of Response_Sessions exposed by `GET /api/admin/responses`.
- **Session_Detail**: The single-session view exposed by `GET /api/admin/responses/{id}`, comprising respondent data, answers, checklist selections, and the Event_Timeline.
- **Event_Timeline**: The chronologically ordered list of a Response_Session's Response_Events, each with its type, timestamp, and payload.
- **Report_Indicator**: One of four derived boolean flags for a Response_Session: `visualizou` (a `relatorio_visualizado` Response_Event exists), `email_enviado` (a `relatorio_email_enviado` Response_Event exists), `whatsapp_enviado` (a `relatorio_whatsapp_enviado` Response_Event exists), and `consultor_solicitado` (a `consultor_solicitado` Response_Event exists).
- **Report_Action_Filter**: A Session_Listing filter value selecting Response_Sessions by a report-related Response_Event: `visualizou`, `recebeu` (a `relatorio_email_enviado` or `relatorio_whatsapp_enviado` Response_Event exists), `solicitou_consultor`, or `envio_falhou` (a `relatorio_envio_falhou` Response_Event exists).
- **Fill_Time**: For a Response_Session with `status` equal to `completo`, the duration between `started_at` and `completed_at`.
- **Progress_Percentage**: For a Response_Session with `status` equal to `iniciado`, the percentage of the survey's questions on the Response_Session's answered path that have a recorded answer.
- **Per_Question_Time**: The duration attributed to a single answered question within a Response_Session, derived from the timestamps of consecutive `pergunta_respondida` Response_Events (the first answered question's duration measured from the Response_Session's `started_at`).
- **Response_Tracking_Service**: The backend component that implements Session_Listing, Session_Detail, Event_Timeline retrieval, and Per_Question_Time calculation.
- **CSV_Exporter**: The backend component that serializes a filtered Session_Listing into a CSV file for `GET /api/admin/responses/export.csv`.
- **Resend_Service**: The backend component that re-enqueues a Delivery_Job to Reporting_Queue for `POST /api/admin/responses/{id}/resend`.
- **Reporting_Queue**: The SQS queue provisioned by foundation-data-model and consumed by reporting-delivery's Email_Delivery_Worker and WhatsApp_Delivery_Worker, reused as-is.
- **Delivery_Job**: A Reporting_Queue message representing one unit of delivery work for the Email_Delivery_Worker or WhatsApp_Delivery_Worker, as defined by reporting-delivery.
- **Delivery_Channel**: Either the e-mail channel (Email_Delivery_Worker) or the WhatsApp channel (WhatsApp_Delivery_Worker), reused from reporting-delivery.
- **Manual_Resend_Event**: A Response_Event of type `relatorio_reenvio_solicitado` that the Resend_Service records when an administrator triggers a manual resend, with a payload identifying the requesting Admin_User and the selected Delivery_Channel.
- **Anonymization_Service**: The backend component that anonymizes a Response_Session's personal data on administrator request.
- **Anonymized_Placeholder**: The fixed replacement value the Anonymization_Service writes to a personal-data column when anonymizing a Response_Session.
- **Dashboard_Service**: The backend component that computes the aggregated indicators exposed by `GET /api/admin/dashboard`.
- **Dashboard_Period**: An inclusive start-date/end-date range used to scope Dashboard_Service aggregation, compared against a Response_Session's `started_at`.
- **Access_Count**, **Started_Count**, **Completed_Count**: Dashboard_Service counts of, respectively, `pagina_acessada` Response_Events, Response_Sessions of any `status`, and Response_Sessions with `status` equal to `completo`, matching the active dashboard filters.
- **Funnel_Stage**: One of seven ordered Dashboard_Service counts: accessed, identified, answered first question, completed, viewed report, requested delivery, requested consultant.
- **Highest_Abandonment_Question**: Among Response_Sessions with `status` equal to `iniciado` in the Dashboard_Period, the question identified as the last one with a recorded `pergunta_respondida` Response_Event, aggregated by frequency across those Response_Sessions.
- **Admin_API**: The set of HTTP routes under `/api/admin` this spec defines, protected by the auth guard and `EnsureAdminActive` middleware defined by admin-auth-users.

## Requirements

### Requirement 1: Response session listing columns

**User Story:** As an administrator, I want to see a list of all response sessions with respondent, status, timing, and report-indicator information, so that I can prioritize commercial follow-up.

#### Acceptance Criteria

1. WHEN an administrator requests `GET /api/admin/responses`, THE Response_Tracking_Service SHALL return a Session_Listing containing, for each Response_Session, its `nome`, `empresa`, `email`, `telefone`, `cargo`, `cidade`, survey name, `status`, `started_at`, `completed_at`, Fill_Time, Progress_Percentage, and the four Report_Indicator flags.
2. WHERE a Response_Session has `status` equal to `completo`, THE Response_Tracking_Service SHALL populate that Response_Session's Fill_Time and SHALL return a null Progress_Percentage, and SHALL NOT apply this rule to Response_Sessions with any other `status` value.
3. WHERE a Response_Session has `status` equal to `iniciado`, THE Response_Tracking_Service SHALL populate that Response_Session's Progress_Percentage and SHALL return a null Fill_Time, and SHALL NOT apply this rule to Response_Sessions with any other `status` value.
4. THE Response_Tracking_Service SHALL return each Response_Session's `nome`, `empresa`, `email`, `telefone`, `cargo`, and `cidade` fields exactly as currently persisted in those columns, whether that stored data is an Anonymized_Placeholder value (following a prior anonymization) or the respondent's original data, without separately re-deriving those values from the `anonimizado` column.

### Requirement 2: Combinable session listing filters

**User Story:** As an administrator, I want to filter the session listing by survey, date range, status, name, company, and report action, so that I can narrow down to the sessions relevant to my task.

#### Acceptance Criteria

1. WHERE a `GET /api/admin/responses` request includes a survey filter parameter, THE Response_Tracking_Service SHALL restrict the Session_Listing to Response_Sessions of the specified survey.
2. WHERE a `GET /api/admin/responses` request includes a date-range filter with a start date and an end date, THE Response_Tracking_Service SHALL restrict the Session_Listing to Response_Sessions whose `started_at` falls within that inclusive range.
3. WHERE a `GET /api/admin/responses` request includes a status filter, THE Response_Tracking_Service SHALL restrict the Session_Listing to Response_Sessions whose `status` matches the specified value.
4. WHERE a `GET /api/admin/responses` request includes a name-search filter, THE Response_Tracking_Service SHALL restrict the Session_Listing to Response_Sessions whose `nome` contains the specified text, case-insensitively.
5. WHERE a `GET /api/admin/responses` request includes a company-search filter, THE Response_Tracking_Service SHALL restrict the Session_Listing to Response_Sessions whose `empresa` contains the specified text, case-insensitively.
6. WHERE a `GET /api/admin/responses` request includes a Report_Action_Filter, THE Response_Tracking_Service SHALL include in the Session_Listing every Response_Session matching that Report_Action_Filter's Response_Event condition and SHALL exclude every Response_Session that does not match it.
7. WHERE a `GET /api/admin/responses` request includes more than one of the filters in this requirement, THE Response_Tracking_Service SHALL restrict the Session_Listing to Response_Sessions satisfying every specified filter simultaneously.

### Requirement 3: Session listing pagination and ordering

**User Story:** As an administrator, I want the session listing paginated and consistently ordered, so that I can browse a large volume of sessions efficiently.

#### Acceptance Criteria

1. THE Response_Tracking_Service SHALL order the Session_Listing by `started_at` descending when a `GET /api/admin/responses` request specifies no explicit sort order.
2. THE Response_Tracking_Service SHALL paginate the Session_Listing and SHALL include the total count of Response_Sessions matching the active filters in the `GET /api/admin/responses` response.
3. WHERE a `GET /api/admin/responses` request specifies a page number beyond the last available page computed from the total count of Response_Sessions matching the active filters, THE Response_Tracking_Service SHALL return an empty Session_Listing page with HTTP status 200, regardless of whether Response_Sessions exist at that page offset.

### Requirement 4: Session detail — respondent data, answers, and checklist

**User Story:** As an administrator, I want to open a session's detail view and see the respondent's data, every answer, and checklist selections, so that I understand the full context of a fill.

#### Acceptance Criteria

1. WHEN an administrator requests `GET /api/admin/responses/{id}` for an existing Response_Session, THE Response_Tracking_Service SHALL return that Response_Session's respondent fields, `status`, `started_at`, `completed_at`, and survey identification.
2. WHEN an administrator requests `GET /api/admin/responses/{id}` for an existing Response_Session, THE Response_Tracking_Service SHALL return every `response_answers` row of that Response_Session paired with its question text and, where applicable, its selected option text or free-text value.
3. WHEN an administrator requests `GET /api/admin/responses/{id}` for an existing Response_Session, THE Response_Tracking_Service SHALL return every `response_checklist` row of that Response_Session paired with its checklist item name and group.
4. WHERE a Response_Session has `anonimizado` equal to `true`, THE Response_Tracking_Service SHALL return that Response_Session's `nome`, `empresa`, `email`, `telefone`, `cargo`, and `cidade` fields as their stored Anonymized_Placeholder values in the Session_Detail.
5. IF an administrator requests `GET /api/admin/responses/{id}` for a Response_Session identifier that does not exist, THEN THE Response_Tracking_Service SHALL respond with HTTP status 404.

### Requirement 5: Session detail — complete event timeline

**User Story:** As an administrator, I want to see the complete timeline of events for a session, so that I can trace exactly what the respondent did and when.

#### Acceptance Criteria

1. WHEN an administrator requests `GET /api/admin/responses/{id}` for an existing Response_Session, THE Response_Tracking_Service SHALL return that Response_Session's Event_Timeline containing every Response_Event of that Response_Session ordered by `created_at` ascending.
2. THE Response_Tracking_Service SHALL include, for each Response_Event in the Event_Timeline, that Response_Event's type, `created_at` timestamp, and `payload`.

### Requirement 6: Per-question fill time calculation

**User Story:** As an administrator, I want to see how long a respondent spent on each question, so that I can identify friction points in the survey.

#### Acceptance Criteria

1. WHEN an administrator requests `GET /api/admin/responses/{id}` for an existing Response_Session, THE Response_Tracking_Service SHALL compute and return a Per_Question_Time value for each question that has a `pergunta_respondida` Response_Event in that Response_Session.
2. THE Response_Tracking_Service SHALL compute a question's Per_Question_Time as the duration between that question's `pergunta_respondida` Response_Event timestamp and the immediately preceding `pergunta_respondida` Response_Event timestamp of the same Response_Session.
3. WHERE a question's `pergunta_respondida` Response_Event is the earliest such event in a Response_Session, THE Response_Tracking_Service SHALL compute that question's Per_Question_Time as the duration between that event's timestamp and the Response_Session's `started_at`.
4. IF a Response_Session has zero `pergunta_respondida` Response_Events, THEN THE Response_Tracking_Service SHALL return an empty set of Per_Question_Time values for that Response_Session, with no additional metadata, session information, or question identifiers included in place of the empty set.

### Requirement 7: CSV export of the filtered listing

**User Story:** As an administrator, I want to export the filtered session listing to a CSV file, so that I can analyze it in Excel.

#### Acceptance Criteria

1. WHEN an administrator requests `GET /api/admin/responses/export.csv` with a set of Session_Listing filter parameters, THE CSV_Exporter SHALL produce a CSV file containing every Response_Session and column that the same filter parameters would produce in the unpaginated Session_Listing.
2. THE CSV_Exporter SHALL separate CSV fields with the `;` character.
3. THE CSV_Exporter SHALL encode the CSV file as UTF-8 with a byte-order mark.
4. THE Admin_API SHALL set the `GET /api/admin/responses/export.csv` response's `Content-Type` header to a CSV media type and its `Content-Disposition` header to attachment with a filename.

### Requirement 8: Manual resend of failed report deliveries

**User Story:** As an administrator, I want to manually retrigger a failed report delivery, so that the respondent still receives their report without redoing the survey.

#### Acceptance Criteria

1. IF an administrator requests `POST /api/admin/responses/{id}/resend` for a Response_Session identifier that does not exist, THEN THE Resend_Service SHALL respond with HTTP status 404.
2. WHERE a `POST /api/admin/responses/{id}/resend` request specifies a Delivery_Channel, THE Resend_Service SHALL restrict its resend attempt to `relatorio_envio_falhou` Response_Events of that Response_Session matching the specified Delivery_Channel.
3. IF a `POST /api/admin/responses/{id}/resend` request omits a Delivery_Channel and the Response_Session has `relatorio_envio_falhou` Response_Events for exactly one Delivery_Channel, THEN THE Resend_Service SHALL default its resend attempt to that Delivery_Channel.
4. IF a `POST /api/admin/responses/{id}/resend` request omits a Delivery_Channel and the Response_Session has `relatorio_envio_falhou` Response_Events for more than one Delivery_Channel, THEN THE Resend_Service SHALL respond with HTTP status 422 requesting an explicit Delivery_Channel and SHALL NOT enqueue a Delivery_Job.
5. IF the Response_Session identified by a `POST /api/admin/responses/{id}/resend` request has zero `relatorio_envio_falhou` Response_Events for the resolved Delivery_Channel, THEN THE Resend_Service SHALL respond with HTTP status 422 and SHALL NOT enqueue a Delivery_Job.
6. WHEN the Resend_Service resolves a Delivery_Channel with at least one matching `relatorio_envio_falhou` Response_Event, THE Resend_Service SHALL enqueue one new Delivery_Job to Reporting_Queue for that Delivery_Channel and Response_Session.
7. WHEN the Resend_Service enqueues a Delivery_Job for a resend, THE Resend_Service SHALL record a Manual_Resend_Event for that Response_Session.

### Requirement 9: LGPD anonymization of respondent personal data

**User Story:** As an administrator, I want to anonymize a respondent's personal data on request, so that the platform complies with LGPD's right to erasure while preserving statistics.

#### Acceptance Criteria

1. IF an administrator requests anonymization of a Response_Session identifier that does not exist, THEN THE Anonymization_Service SHALL respond with HTTP status 404, regardless of whether that Response_Session identifier's `anonimizado` column would have been `true` or `false`.
2. WHEN an administrator requests anonymization of an existing Response_Session, THE Anonymization_Service SHALL replace that Response_Session's `nome`, `email`, `telefone`, `empresa`, `cargo`, and `cidade` values with their respective Anonymized_Placeholder values.
3. WHEN the Anonymization_Service anonymizes a Response_Session, THE Anonymization_Service SHALL set that Response_Session's `anonimizado` column to `true`.
4. WHEN the Anonymization_Service anonymizes a Response_Session, THE Anonymization_Service SHALL preserve that Response_Session's `response_answers` rows, `response_checklist` rows, `pontuacao`, and `faixa_id` unchanged.
5. WHERE a Response_Session's `anonimizado` column is already `true`, THE Anonymization_Service SHALL respond to a repeated anonymization request for that existing Response_Session with HTTP status 200 and SHALL leave the already-anonymized values unchanged.
6. IF the Anonymization_Service successfully replaces some but not all of the six personal-data columns listed in Acceptance Criterion 2 for a Response_Session, THEN THE Anonymization_Service SHALL persist the successfully replaced columns, SHALL set that Response_Session's `anonimizado` column to `true`, and SHALL return the Response_Session with the successfully anonymized columns replaced and the remaining columns in their prior form.

### Requirement 10: Dashboard access, start, completion, and completion-rate metrics

**User Story:** As an administrator, I want top-line counts of landing-page accesses, starts, completions, and the completion rate, so that I can gauge survey performance at a glance.

#### Acceptance Criteria

1. WHEN an administrator requests `GET /api/admin/dashboard`, THE Dashboard_Service SHALL return the Access_Count as the count of `pagina_acessada` Response_Events belonging to Response_Sessions matching the active dashboard filters.
2. WHEN an administrator requests `GET /api/admin/dashboard`, THE Dashboard_Service SHALL return the Started_Count as the count of Response_Sessions matching the active dashboard filters, regardless of `status`.
3. WHEN an administrator requests `GET /api/admin/dashboard`, THE Dashboard_Service SHALL return the Completed_Count as the count of Response_Sessions matching the active dashboard filters with `status` equal to `completo`.
4. THE Dashboard_Service SHALL compute the completion rate as the Completed_Count divided by the Started_Count, expressed as a percentage, using the Completed_Count and Started_Count values as independently computed by Acceptance Criteria 2 and 3 without reconciling them against each other.
5. IF the Started_Count is zero, THEN THE Dashboard_Service SHALL return a completion rate of zero without dividing by zero.

### Requirement 11: Dashboard funnel

**User Story:** As an administrator, I want a funnel view from landing-page access through consultant request, so that I can see where respondents drop off.

#### Acceptance Criteria

1. WHEN an administrator requests `GET /api/admin/dashboard`, THE Dashboard_Service SHALL return a count for each of the seven Funnel_Stages: accessed, identified, answered first question, completed, viewed report, requested delivery, and requested consultant.
2. THE Dashboard_Service SHALL compute the accessed Funnel_Stage count as the count of Response_Sessions matching the active dashboard filters with at least one `pagina_acessada` Response_Event.
3. THE Dashboard_Service SHALL compute the identified Funnel_Stage count as the count of Response_Sessions matching the active dashboard filters with at least one `privacidade_aceita` Response_Event.
4. THE Dashboard_Service SHALL compute the answered-first-question Funnel_Stage count as the count of Response_Sessions matching the active dashboard filters with at least one `pergunta_respondida` Response_Event.
5. THE Dashboard_Service SHALL compute the completed Funnel_Stage count as the Completed_Count.
6. THE Dashboard_Service SHALL compute the viewed-report Funnel_Stage count as the count of Response_Sessions matching the active dashboard filters with at least one `relatorio_visualizado` Response_Event.
7. THE Dashboard_Service SHALL compute the requested-delivery Funnel_Stage count as the count of Response_Sessions matching the active dashboard filters with at least one `relatorio_email_solicitado` or `relatorio_whatsapp_solicitado` Response_Event.
8. THE Dashboard_Service SHALL compute the requested-consultant Funnel_Stage count as the count of Response_Sessions matching the active dashboard filters with at least one `consultor_solicitado` Response_Event.

### Requirement 12: Dashboard average fill time

**User Story:** As an administrator, I want the average completion time for finished sessions, so that I can set expectations for respondents.

#### Acceptance Criteria

1. WHEN an administrator requests `GET /api/admin/dashboard`, THE Dashboard_Service SHALL compute the average Fill_Time across Response_Sessions matching the active dashboard filters (survey and Dashboard_Period, both required per Requirement 17) with `status` equal to `completo`.
2. THE Dashboard_Service SHALL exclude Response_Sessions with `status` equal to `iniciado` from the average Fill_Time computation.
3. IF zero Response_Sessions matching the active dashboard filters have `status` equal to `completo`, THEN THE Dashboard_Service SHALL return a null average Fill_Time.

### Requirement 13: Dashboard highest-abandonment question

**User Story:** As an administrator, I want to know which question causes the most drop-off among partial sessions, so that I can prioritize improving it.

#### Acceptance Criteria

1. WHEN an administrator requests `GET /api/admin/dashboard`, THE Dashboard_Service SHALL identify, for each Response_Session matching the active dashboard filters with `status` equal to `iniciado`, the question of that Response_Session's most recent `pergunta_respondida` Response_Event as that Response_Session's last-answered question.
2. THE Dashboard_Service SHALL return the Highest_Abandonment_Question as the last-answered question with the greatest count of `iniciado` Response_Sessions among those matching the active dashboard filters, and SHALL NOT return any question with a lower count as the Highest_Abandonment_Question.
3. IF zero Response_Sessions matching the active dashboard filters have `status` equal to `iniciado`, THEN THE Dashboard_Service SHALL return a null Highest_Abandonment_Question.

### Requirement 14: Dashboard response distribution per question

**User Story:** As an administrator, I want to see how answers are distributed across each question's options, so that I can understand response patterns.

#### Acceptance Criteria

1. WHEN an administrator requests `GET /api/admin/dashboard`, THE Dashboard_Service SHALL return, for every choice-type question belonging to a Response_Session matching the active dashboard filters, the count of `response_answers` rows selecting each of that question's options among those matching Response_Sessions, including every such choice-type question regardless of whether it has any recorded answers.
2. THE Dashboard_Service SHALL exclude questions with `tipo` equal to `aberta` from the response-distribution computation.

### Requirement 15: Dashboard time series of daily responses

**User Story:** As an administrator, I want a daily time series of responses within the selected period, so that I can see trends over time.

#### Acceptance Criteria

1. WHEN an administrator requests `GET /api/admin/dashboard`, THE Dashboard_Service SHALL return a count of Response_Sessions matching the active dashboard filters for each calendar day of the Dashboard_Period, keyed by that Response_Session's `started_at` date.
2. WHERE a calendar day within the Dashboard_Period has zero matching Response_Sessions, THE Dashboard_Service SHALL include that day in the time series with a count of zero.

### Requirement 16: Dashboard top checklist items by group

**User Story:** As an administrator, I want to see the most-selected checklist items within each group, so that I understand respondent interests.

#### Acceptance Criteria

1. WHEN an administrator requests `GET /api/admin/dashboard`, THE Dashboard_Service SHALL return, for each `checklist_items.grupo` value, that group's checklist items selected by Response_Sessions matching the active dashboard filters, ordered by selection count descending.

### Requirement 17: Dashboard survey and period filters

**User Story:** As an administrator, I want to filter the dashboard by survey and by period, so that I can focus on the data relevant to a specific campaign or timeframe.

#### Acceptance Criteria

1. THE Admin_API SHALL require a survey filter parameter and a Dashboard_Period parameter on every `GET /api/admin/dashboard` request.
2. IF a `GET /api/admin/dashboard` request omits the survey filter parameter, THEN THE Admin_API SHALL respond with HTTP status 422 and SHALL NOT compute dashboard metrics.
3. IF a `GET /api/admin/dashboard` request omits the Dashboard_Period parameter, THEN THE Admin_API SHALL respond with HTTP status 422 and SHALL NOT compute dashboard metrics.
4. WHERE a `GET /api/admin/dashboard` request's survey filter parameter selects all surveys via an explicit "all surveys" value, THE Dashboard_Service SHALL compute every dashboard metric across all surveys within the specified Dashboard_Period.

### Requirement 18: Aggregated query computation strategy

**User Story:** As a developer, I want dashboard metrics computed via aggregated database queries, so that the dashboard scales without introducing external BI tooling.

#### Acceptance Criteria

1. THE Dashboard_Service SHALL compute every dashboard metric via aggregated PostgreSQL queries executed against the foundation-data-model tables.
2. WHERE Response_Session volume requires it, THE Dashboard_Service SHALL be permitted to source aggregated metrics from a PostgreSQL materialized view refreshed on a schedule or on demand.

### Requirement 19: Dashboard load performance

**User Story:** As an administrator, I want the dashboard to load quickly even with a large volume of sessions, so that I can use it during daily work without delay.

#### Acceptance Criteria

1. WHILE the `responses` table contains up to 10,000 Response_Sessions within the scope of the active dashboard filters, THE Dashboard_Service SHALL return the complete `GET /api/admin/dashboard` response within 3 seconds.

### Requirement 20: Admin authentication reuse for all tracking and dashboard routes

**User Story:** As the platform, I want every tracking and dashboard endpoint protected by the existing administrator authentication, so that respondent personal data is never exposed to an unauthenticated caller.

#### Acceptance Criteria

1. THE Admin_API SHALL require a valid admin bearer token and an active Admin_User, through the authentication middleware chain defined by admin-auth-users, for every route defined by this spec.
2. IF a request to any route defined by this spec is made without a valid admin bearer token, THEN THE Admin_API SHALL respond with HTTP status 401.
