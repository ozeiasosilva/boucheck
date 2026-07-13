# Requirements Document

## Introduction

This document specifies the requirements for the **reporting-delivery** spec, which is spec 6 of 7 for the BouCheck platform. It defines score calculation, report content generation (HTML and PDF), and the asynchronous delivery mechanics (view, e-mail, WhatsApp, consultant scheduling) that run once a respondent's `Response_Session` reaches the `completo` status.

This spec traces to master requirements `REQ-REP-001` (result calculation), `REQ-REP-002` (report content and format), `REQ-PUB-007` (completion actions and delivery), and the delivery-relevant portions of `REQ-NFR-005` (observability) and `REQ-NFR-001.4`/`REQ-NFR-001.5` (asynchronous jobs and object storage).

**Dependencies (not redefined here):**
- **foundation-data-model** (spec 1 of 7) provides the persisted models this spec reads and writes: `responses`, `response_answers`, `response_events`, `questions` (including `dimensao`), `question_options`, `score_ranges`, `reports`, and `ai_generation_logs`, together with their columns, ENUM values, keys, and indexes, and the SQS standard queue plus dead-letter queue (`Reporting_Queue`/`Reporting_DLQ`) provisioned by that spec's infrastructure stack. These structures and resources are consumed as-is.
- **survey-authoring** (spec 3 of 7) is where `score_ranges` (maturity bands) and the `questions.dimensao` field are configured and validated. This spec assumes those configurations are already valid (non-overlapping bands, dimension labels) and does not re-validate their structure.
- **public-response-flow** (spec 5 of 7) is the entry-point boundary: when a `Response_Session` transitions to `completo`, that spec publishes a `Completion_Handoff_Message` to `Reporting_Queue`. That handoff is the trigger this spec consumes; the identification, navigation, and completion revalidation that precede the handoff are not redefined here.

**Explicitly out of scope (covered by other specs):**
- The admin response listing, session-detail timeline, and dashboard (`admin-tracking-dashboard` spec), including the **manual resend** capability for failed deliveries (`REQ-ADM-007.6`). This spec covers only the initial, respondent-triggered delivery mechanics and the automatic worker retries that precede a delivery being marked as failed.
- AI-assisted question generation (`REQ-ADM-004`, the `ai-question-generation` spec).
- Survey, question, option, rule, checklist, and score-range authoring (the `survey-authoring` spec).
- The public respondent flow prior to completion, including identification, question navigation, and the navigation engine (the `public-response-flow` spec).

## Glossary

- **Response_Session**: A row in the `responses` table representing one respondent's fill of one survey, reused from foundation-data-model. This spec reads its answers and writes `pontuacao` and `faixa_id`.
- **Completion_Handoff_Message**: The SQS message published by the public-response-flow spec to `Reporting_Queue` when a Response_Session transitions to `completo`, carrying at minimum the Response_Session identifier. This is the entry point of this spec.
- **Reporting_Queue**: The SQS standard queue provisioned by foundation-data-model, consumed by this spec's workers for score calculation, PDF generation, e-mail delivery, WhatsApp delivery, and AI recommendation generation jobs.
- **Reporting_DLQ**: The SQS dead-letter queue provisioned by foundation-data-model, configured as the redrive target for `Reporting_Queue`.
- **Choice_Question**: A question whose `tipo` is `escolha_unica` or `multipla_escolha`, reused from foundation-data-model.
- **Open_Question**: A question whose `tipo` is `aberta`, reused from foundation-data-model.
- **Answered_Path**: The set of questions a respondent actually reached and answered in a Response_Session, as persisted in `response_answers`, reused from public-response-flow.
- **Score_Calculator**: The backend component that computes a Response_Session's overall score, per-dimension scores, and Maturity_Band classification upon consuming a Completion_Handoff_Message.
- **Maturity_Band**: A `score_ranges` row of the Response_Session's survey, consumed as-is from survey-authoring, used to classify the normalized overall score.
- **Dimension_Score**: A computed subtotal of raw points restricted to the Choice_Questions of a Response_Session's Answered_Path that share the same non-null `dimensao` value.
- **Max_Possible_Score**: For a given scope (overall or a single dimension), the sum over the Choice_Questions in that scope belonging to the Answered_Path of (`peso` × the highest `pontuacao` among that question's answer options).
- **Normalized_Score**: The Response_Session's overall raw score expressed as a percentage (0–100) of the overall Max_Possible_Score for the Answered_Path.
- **Report**: A `reports` row associated one-to-one with a Response_Session, holding `html_s3_key`, `pdf_s3_key`, `public_token`, and `expires_at`, reused from foundation-data-model.
- **Report_Generator**: The backend component that assembles a Report's HTML content from the Response_Session, the Score_Calculator output, the survey's Visual_Identity, and Recommendation text.
- **Visual_Identity**: The per-survey presentation configuration (`cor_primaria`, `cor_secundaria`, `cor_fundo`, `logo_s3_key`) held in `surveys.config_visual`, consumed as-is from survey-authoring.
- **Recommendation_Generator**: The backend component that produces the report's recommendation text, calling Amazon Bedrock when the survey's `usar_ia_no_relatorio` flag is `true`, and falling back to the Maturity_Band's default `descricao` text when AI generation is disabled or fails.
- **PDF_Generation_Worker**: The Reporting_Queue consumer that renders a Report's HTML into a PDF document using a headless Chromium/Playwright engine and stores the result in the Object_Store.
- **Email_Delivery_Worker**: The Reporting_Queue consumer that sends a Report to a respondent's e-mail address via Amazon SES.
- **WhatsApp_Delivery_Worker**: The Reporting_Queue consumer that sends a Report link to a respondent's phone number via the Meta WhatsApp Cloud API.
- **Object_Store**: Amazon S3, where PDF Report files are stored, reused from foundation-data-model.
- **Public_Report_Token**: The `reports.public_token` value that authorizes unauthenticated read access to a Report's HTML at `GET /r/{token}`.
- **Public_Report_Endpoint**: The unauthenticated route `GET /r/{token}` that serves a Report's HTML by Public_Report_Token.
- **Consultant_Notification**: The internal e-mail sent to a survey's configured `email_notificacao` address when a respondent requests consultant scheduling.
- **Delivery_Channel**: Either the e-mail channel (Email_Delivery_Worker) or the WhatsApp channel (WhatsApp_Delivery_Worker).
- **Delivery_Job**: A Reporting_Queue message representing one unit of work for the PDF_Generation_Worker, Email_Delivery_Worker, WhatsApp_Delivery_Worker, or Recommendation_Generator.
- **Retry_Count**: The number of times the Reporting_Queue has redelivered a given Delivery_Job to its consumer after a processing failure.

## Requirements

### Requirement 1: Completion handoff consumption (REQ-PUB-007.1 boundary)

**User Story:** As the platform, I want a completed response session to automatically trigger score calculation, so that the respondent's report is ready without manual intervention.

#### Acceptance Criteria

1. WHEN the Score_Calculator receives a Completion_Handoff_Message from Reporting_Queue, THE Score_Calculator SHALL load the Answered_Path answers of the identified Response_Session.
2. WHEN the Score_Calculator completes scoring a Response_Session, THE Score_Calculator SHALL persist the computed overall score to `responses.pontuacao` and the classified Maturity_Band to `responses.faixa_id`.
3. WHEN the Score_Calculator persists `responses.pontuacao` and `responses.faixa_id`, THE Score_Calculator SHALL enqueue a Report_Generator Delivery_Job to Reporting_Queue for the same Response_Session.
4. IF Reporting_Queue redelivers a Completion_Handoff_Message for a Response_Session whose `responses.pontuacao` is already set, THEN THE Score_Calculator SHALL recompute and overwrite the score and Maturity_Band without creating a duplicate Report row.

### Requirement 2: Score calculation for choice questions (REQ-REP-001.1)

**User Story:** As an administrator, I want the diagnostic score computed from weighted answer points, so that the report reflects a consistent, auditable methodology.

#### Acceptance Criteria

1. THE Score_Calculator SHALL compute the raw score of a Response_Session as the sum, over every answered Choice_Question option, of that option's `pontuacao` multiplied by its question's `peso`.
2. THE Score_Calculator SHALL exclude Open_Question answers from the raw score computation.
3. WHERE a Choice_Question is `multipla_escolha` and the respondent selected more than one option, THE Score_Calculator SHALL include the `pontuacao` × `peso` contribution of every selected option in the raw score.
4. THE Score_Calculator SHALL restrict the raw score computation to questions present in the Response_Session's Answered_Path.

### Requirement 3: Maturity band classification (REQ-REP-001.2)

**User Story:** As a respondent, I want my result classified into a named maturity band, so that I understand what my score means.

#### Acceptance Criteria

1. WHEN the Score_Calculator computes the Normalized_Score of a Response_Session, THE Score_Calculator SHALL classify that Response_Session into the Maturity_Band of its survey whose `min`–`max` bounds contain the Normalized_Score.
2. THE Score_Calculator SHALL persist the identifier of the classified Maturity_Band to `responses.faixa_id`.
3. IF a Response_Session's survey has zero configured Maturity_Bands, THEN THE Score_Calculator SHALL leave `responses.faixa_id` null and SHALL proceed with score persistence and the Report_Generator handoff.
4. IF a Response_Session's Normalized_Score does not fall within the bounds of any configured Maturity_Band of its survey, THEN THE Score_Calculator SHALL leave `responses.faixa_id` null and SHALL proceed with score persistence and the Report_Generator handoff.

### Requirement 4: Per-dimension scoring for radar chart (REQ-REP-001.3)

**User Story:** As a respondent, I want to see my score broken down by dimension, so that I can identify specific strengths and gaps.

#### Acceptance Criteria

1. WHERE a Response_Session's survey has at least one question with a non-null `dimensao`, THE Score_Calculator SHALL compute one Dimension_Score for each distinct `dimensao` value present among the Choice_Questions of the Answered_Path.
2. THE Score_Calculator SHALL normalize each Dimension_Score to a 0–100 scale as a percentage of the Max_Possible_Score for that dimension on the Answered_Path.
3. WHERE a Response_Session's survey has zero questions with a non-null `dimensao`, THE Score_Calculator SHALL produce zero Dimension_Score values for that Response_Session.
4. THE Report_Generator SHALL include the computed Dimension_Score values as radar-chart data in the Report when at least one Dimension_Score exists for the Response_Session.
5. THE Report_Generator SHALL omit radar-chart data from the Report when zero Dimension_Score values exist for the Response_Session.

### Requirement 5: Score normalization on the answered path (REQ-REP-001.4)

**User Story:** As a respondent who took a shorter conditional path, I want my score normalized fairly, so that skipping branch-specific questions does not unfairly lower my result.

#### Acceptance Criteria

1. THE Score_Calculator SHALL compute the overall Max_Possible_Score of a Response_Session as the sum, over the Choice_Questions of the Answered_Path, of each question's `peso` multiplied by the highest `pontuacao` among that question's answer options.
2. THE Score_Calculator SHALL compute the Normalized_Score of a Response_Session as the raw score (Requirement 2) divided by the overall Max_Possible_Score, multiplied by 100.
3. IF the overall Max_Possible_Score of a Response_Session is zero, THEN THE Score_Calculator SHALL set the Normalized_Score to zero without dividing by zero.
4. THE Score_Calculator SHALL persist the Normalized_Score to `responses.pontuacao`.
5. THE Score_Calculator SHALL bound the Normalized_Score to the closed interval 0 to 100.

### Requirement 6: Report content assembly (REQ-REP-002.1)

**User Story:** As a respondent, I want a report that summarizes my identity, score, and answers, so that I can review and share my diagnostic result.

#### Acceptance Criteria

1. THE Report_Generator SHALL include in a Report's HTML the survey's Visual_Identity, the Response_Session's `nome` and `empresa`, the Normalized_Score, the classified Maturity_Band name, the Maturity_Band descriptive text, a summary of the Response_Session's answers, and recommendation text.
2. WHERE the Response_Session has computed Dimension_Score values, THE Report_Generator SHALL include radar-chart data keyed by `dimensao` in the Report's HTML.
3. WHERE the Response_Session's `faixa_id` is null, THE Report_Generator SHALL render the Normalized_Score without a Maturity_Band name or Maturity_Band descriptive text.
4. THE Report_Generator SHALL include, for each answered question in the Response_Session's Answered_Path, the question text and the respondent's selected option text or free-text answer in the response summary.

### Requirement 7: AI-personalized recommendations with mandatory fallback (REQ-REP-002.2)

**User Story:** As an administrator, I want AI-generated recommendations that never block report delivery, so that respondents always receive a complete report even when the AI service is unavailable.

#### Acceptance Criteria

1. WHERE a Response_Session's survey has `usar_ia_no_relatorio` set to `true`, THE Recommendation_Generator SHALL request personalized recommendation text from Amazon Bedrock based on the Response_Session's answers.
2. WHERE a Response_Session's survey has `usar_ia_no_relatorio` set to `false`, THE Recommendation_Generator SHALL use the classified Maturity_Band's `descricao` as the Report's recommendation text without calling Amazon Bedrock.
3. IF an Amazon Bedrock request made by the Recommendation_Generator fails, times out, or returns content that cannot be parsed, THEN THE Recommendation_Generator SHALL use the classified Maturity_Band's `descricao` as the Report's recommendation text.
4. THE Recommendation_Generator SHALL produce non-empty recommendation text for every Report regardless of the outcome of an Amazon Bedrock request.
5. WHEN the Recommendation_Generator completes an Amazon Bedrock request, THE Recommendation_Generator SHALL record the request, the survey identifier, the outcome, and token counts (when available) in `ai_generation_logs`.
6. THE Report_Generator SHALL proceed to render and persist the Report HTML after the Recommendation_Generator produces recommendation text, regardless of whether that text originated from Amazon Bedrock or from the Maturity_Band fallback.

### Requirement 8: HTML report availability (REQ-REP-002.3)

**User Story:** As a respondent, I want to view my report as a web page, so that I can read my result immediately and share the link.

#### Acceptance Criteria

1. WHEN the Report_Generator completes assembling a Report's HTML content, THE Report_Generator SHALL store that HTML in the Object_Store and record its object key in `reports.html_s3_key`.
2. WHEN the Report_Generator persists a new Report row, THE Report_Generator SHALL generate a non-sequential Public_Report_Token and record it in `reports.public_token`.
3. WHEN the Report_Generator persists a new Report row, THE Report_Generator SHALL set `reports.expires_at` to 90 days after the Response_Session's `completed_at` timestamp.
4. WHEN the Public_Report_Endpoint receives `GET /r/{token}` with a Public_Report_Token that matches a non-expired Report, THE Public_Report_Endpoint SHALL return that Report's HTML content and log a Response_Event of type `relatorio_link_acessado` for the associated Response_Session.
5. IF the Public_Report_Endpoint receives `GET /r/{token}` with a Public_Report_Token that does not match any Report or matches an expired Report, THEN THE Public_Report_Endpoint SHALL respond with HTTP status 404.

### Requirement 9: PDF report generation (REQ-REP-002.3)

**User Story:** As a respondent, I want to receive my report as a PDF attachment, so that I can save and forward it outside the browser.

#### Acceptance Criteria

1. WHEN the PDF_Generation_Worker consumes a PDF-generation Delivery_Job for a Report, THE PDF_Generation_Worker SHALL render that Report's stored HTML into a PDF document using a headless Chromium/Playwright engine.
2. WHEN the PDF_Generation_Worker completes rendering a Report's PDF document, THE PDF_Generation_Worker SHALL store that document in the Object_Store and record its object key in `reports.pdf_s3_key`.
3. THE PDF_Generation_Worker SHALL render the PDF document from the same HTML content stored in `reports.html_s3_key` for that Report.
4. WHERE a Report's `reports.pdf_s3_key` is already set when an Email_Delivery_Worker Delivery_Job for that Report is processed, THE Email_Delivery_Worker SHALL reuse the existing PDF document without requesting another rendering.

### Requirement 10: Report footer and contact CTA (REQ-REP-002.4)

**User Story:** As BeOnUp, I want every report to carry our contact information and a scheduling call-to-action, so that respondents can reach a consultant directly from the report.

#### Acceptance Criteria

1. THE Report_Generator SHALL include a footer in every Report's HTML containing BeOnUp's contact information.
2. THE Report_Generator SHALL include in every Report's footer a call-to-action linking to the Response_Session's survey's configured `link_agendamento`.

### Requirement 11: Four completion actions (REQ-PUB-007.2)

**User Story:** As a respondent, I want exactly four clear actions after completing the survey, so that I can choose how to receive or act on my result.

#### Acceptance Criteria

1. THE Public_Site SHALL present exactly four actions on the completion screen: view report, receive report by WhatsApp, receive report by e-mail, and schedule a presentation with a consultant.

### Requirement 12: View report action (REQ-PUB-007.3)

**User Story:** As a respondent, I want to view my report immediately in the browser, so that I do not need to wait for an e-mail or message.

#### Acceptance Criteria

1. WHEN a respondent activates the "Visualizar relatório" action, THE Public_Site SHALL display the Response_Session's Report HTML inline on the completion page.
2. WHEN the Public_Site displays a Report HTML inline in response to the "Visualizar relatório" action, THE Public_API SHALL log a Response_Event of type `relatorio_visualizado` for that Response_Session.

### Requirement 13: E-mail delivery (REQ-PUB-007.4)

**User Story:** As a respondent, I want to receive my report by e-mail, so that I have a permanent copy in my inbox.

#### Acceptance Criteria

1. WHEN a respondent activates the "Receber por e-mail" action, THE Public_API SHALL enqueue an Email_Delivery_Worker Delivery_Job addressed to the Response_Session's identification e-mail and SHALL log a Response_Event of type `relatorio_email_solicitado`.
2. WHEN the Email_Delivery_Worker confirms successful delivery of a Report via Amazon SES, THE Email_Delivery_Worker SHALL log a Response_Event of type `relatorio_email_enviado` for that Response_Session.
3. WHEN the Email_Delivery_Worker sends a Report by e-mail, THE Email_Delivery_Worker SHALL attach the Report's PDF document to the message.
4. WHEN the Public_Site receives confirmation that a `relatorio_email_solicitado` Response_Event was logged, THE Public_Site SHALL display a confirmation message showing the destination e-mail address with all characters masked except the first character and the domain.

### Requirement 14: WhatsApp delivery (REQ-PUB-007.5)

**User Story:** As a respondent, I want to receive my report link by WhatsApp, so that I can access it from the channel I already used to reach the survey.

#### Acceptance Criteria

1. WHEN a respondent activates the "Receber por WhatsApp" action, THE Public_API SHALL enqueue a WhatsApp_Delivery_Worker Delivery_Job addressed to the Response_Session's identification phone number and SHALL log a Response_Event of type `relatorio_whatsapp_solicitado`.
2. WHEN the WhatsApp_Delivery_Worker sends a Delivery_Job's message, THE WhatsApp_Delivery_Worker SHALL use an approved WhatsApp Cloud API template containing the Report's Public_Report_Endpoint link.
3. WHEN the WhatsApp_Delivery_Worker confirms successful delivery of a Report via the WhatsApp Cloud API, THE WhatsApp_Delivery_Worker SHALL log a Response_Event of type `relatorio_whatsapp_enviado` for that Response_Session.

### Requirement 15: Consultant scheduling action (REQ-PUB-007.6)

**User Story:** As a respondent, I want to schedule a presentation with a consultant directly from my result screen, so that I can act on my diagnostic immediately.

#### Acceptance Criteria

1. WHEN a respondent activates the "Agendar apresentação com um consultor" action, THE Public_API SHALL log a Response_Event of type `consultor_solicitado` for that Response_Session.
2. WHEN a respondent activates the "Agendar apresentação com um consultor" action, THE Public_Site SHALL display the Response_Session's survey's configured `link_agendamento`.
3. IF the Public_Site fails to display the `link_agendamento` when the "Agendar apresentação com um consultor" action is activated, THEN THE Public_Site SHALL display an error message to the respondent.
4. WHEN a respondent activates the "Agendar apresentação com um consultor" action, THE Public_API SHALL send a Consultant_Notification to the Response_Session's survey's configured `email_notificacao` address.

### Requirement 16: Delivery failure after retries (REQ-PUB-007.7)

**User Story:** As an administrator, I want failed report deliveries recorded with a reason, so that I have visibility into delivery problems.

#### Acceptance Criteria

1. WHILE a Delivery_Channel Delivery_Job's Retry_Count is below 3, THE Reporting_Queue consumer for that Delivery_Channel SHALL redeliver the failed Delivery_Job for another processing attempt without logging a failure Response_Event.
2. WHEN a Delivery_Channel Delivery_Job's Retry_Count reaches 3 processing failures, THE Reporting_Queue consumer for that Delivery_Channel SHALL log a Response_Event of type `relatorio_envio_falhou` containing the failure reason and SHALL route the Delivery_Job to Reporting_DLQ.
3. THE Reporting_Queue consumer for a Delivery_Channel SHALL log exactly one `relatorio_envio_falhou` Response_Event per Delivery_Job that reaches 3 processing failures.

### Requirement 17: Public report link security (REQ-PUB-007.8)

**User Story:** As BeOnUp, I want report links to be unguessable and time-limited, so that respondent diagnostic data is not exposed indefinitely or to unauthorized parties.

#### Acceptance Criteria

1. THE Report_Generator SHALL generate each Public_Report_Token using a cryptographically random value that does not encode the Report's or Response_Session's sequential database identifier.
2. THE Report_Generator SHALL generate a Public_Report_Token that is unique across all `reports` rows.
3. IF the Public_Report_Endpoint receives `GET /r/{token}` more than 90 days after the associated Report's `reports.expires_at`, THEN THE Public_Report_Endpoint SHALL respond with HTTP status 404.

### Requirement 18: Asynchronous worker architecture (REQ-NFR-001.4, REQ-NFR-001.5)

**User Story:** As the platform, I want report generation and delivery jobs processed asynchronously with reliable retry semantics, so that slow external calls never block the respondent-facing request.

#### Acceptance Criteria

1. THE Score_Calculator, Report_Generator, Recommendation_Generator, PDF_Generation_Worker, Email_Delivery_Worker, and WhatsApp_Delivery_Worker SHALL each consume Delivery_Jobs from Reporting_Queue rather than executing synchronously within a respondent-facing HTTP request.
2. WHEN a Reporting_Queue consumer processes a redelivered Delivery_Job that was already completed successfully on a prior attempt, THE Reporting_Queue consumer SHALL complete without producing a duplicate Report, a duplicate delivery, or a duplicate Response_Event of the same type for the same Response_Session.
3. THE PDF_Generation_Worker SHALL store PDF documents only in an Object_Store bucket configured with S3 Block Public Access, accessible independently through either the Public_Report_Endpoint or a signed URL.
4. IF the Object_Store bucket configured for PDF storage does not have S3 Block Public Access enabled, THEN THE PDF_Generation_Worker SHALL refuse to store the PDF document.

### Requirement 19: Delivery observability (REQ-NFR-005)

**User Story:** As the platform operator, I want visibility into delivery job health, so that I can detect and respond to systemic delivery problems.

#### Acceptance Criteria

1. THE Reporting_Queue consumers SHALL emit structured JSON log entries for every Delivery_Job processing attempt, including its outcome.
2. THE Reporting_Queue consumers SHALL emit a metric for e-mail delivery failures and a metric for WhatsApp delivery failures.
3. WHEN Reporting_DLQ contains at least one message, THE platform's monitoring configuration SHALL trigger a CloudWatch alarm notifying the configured SNS topic, consistent with REQ-NFR-005.3.

## Out of Scope Confirmation

- Manual resend of a failed report delivery by an administrator (`REQ-ADM-007.6`) belongs to the `admin-tracking-dashboard` spec. This spec provides only the automatic retry-then-fail mechanics (Requirement 16) and the initial, respondent-triggered enqueue of Delivery_Jobs (Requirements 13, 14).
- AI-assisted question generation (`REQ-ADM-004`) belongs to the `ai-question-generation` spec and is not covered here.
- The admin response listing, session-detail timeline, and dashboard aggregates (`REQ-ADM-007`, `REQ-ADM-008`) are not covered here.
