# Implementation Plan: reporting-delivery

## Overview

This plan implements the asynchronous score → report → delivery pipeline for BouCheck's reporting-delivery spec: the pure `ScoreCalculator` and its SQS job wrapper, `Report_Generator`/`Recommendation_Generator` (Bedrock + mandatory fallback) and the HTML template, `PdfRenderer` with a BPA-gated storage check, the `Email_Delivery_Worker`/`WhatsApp_Delivery_Worker` with a shared idempotent retry/failure handler, `Public_Report_Token` generation with find-or-create `Report` persistence, the unauthenticated `GET /r/{token}` endpoint, the four respondent-facing action endpoints, and the one-time system admin seed row needed for `ai_generation_logs.admin_user_id`. Work proceeds bottom-up: pure logic first (fully covered by property-based tests), then the SQS job wrappers around it, then the delivery workers and public endpoints, finishing with dispatcher wiring and an end-to-end integration test.

## Tasks

- [x] 1. Set up Reporting_Queue message contract and job dispatcher
  - [x] 1.1 Implement `ReportingQueueMessage` envelope types and `ReportingQueueClient`
    - Define the discriminated-union message kinds (`score_calculate`, `report_generate`, `pdf_generate`, `email_deliver`, `whatsapp_deliver`, `consultant_notify`) and the `enqueue()` wrapper around SQS in `services/reporting_queue_client.ts`
    - _Requirements: 18.1_

  - [x] 1.2 Implement the job dispatcher
    - Route inbound SQS records to the correct handler by `kind` and expose the record's `ApproximateReceiveCount` attribute to handlers as Retry_Count
    - _Requirements: 18.1, 16.1_

- [x] 2. Implement the Score_Calculator pure scoring module
  - [x] 2.1 Implement `ScoreCalculator.compute`
    - Raw score summation, max-possible-score summation, divide-by-zero-safe normalization with clamping, per-dimension scoring, and inclusive-bounds Maturity_Band classification in `services/score_calculator.ts`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.3, 3.4, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 5.5_

  - [ ]* 2.2 Write property test for raw score correctness
    - **Property 1: Raw score correctness**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**

  - [ ]* 2.3 Write property test for normalization bounds correctness
    - **Property 2: Normalization bounds correctness**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.5**

  - [ ]* 2.4 Write property test for dimension score correctness
    - **Property 3: Dimension score correctness**
    - **Validates: Requirements 4.1, 4.2, 4.3**

  - [ ]* 2.5 Write property test for maturity band classification correctness
    - **Property 4: Maturity band classification correctness**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

- [x] 3. Implement Score_CalculatorJob (Reporting_Queue consumer)
  - [x] 3.1 Implement Answered_Path and Maturity_Band query helpers
    - `loadAnsweredChoiceRows` (excludes `aberta` questions, maps to `AnsweredChoice[]`) and `loadBands` in `support/response_answer_queries.ts`
    - _Requirements: 1.1, 2.2, 2.4_

  - [x] 3.2 Implement the `score_calculator_job.ts` handler
    - Load answers/bands, call `ScoreCalculator.compute`, `UPDATE responses.pontuacao`/`faixa_id` (overwrite, never insert), enqueue `report_generate`
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ]* 3.3 Write unit test for score persistence
    - Verify the job persists `pontuacao`/`faixa_id` via the ORM after computing
    - _Requirements: 1.2_

  - [ ]* 3.4 Write unit test for report_generate enqueue
    - Verify the job enqueues `report_generate` only after persisting the score
    - _Requirements: 1.3_

  - [ ]* 3.5 Write property test for idempotent score/report redelivery
    - **Property 5: Idempotent score/report redelivery**
    - **Validates: Requirements 1.4, 18.2**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement the report HTML template and Report_Generator content assembly
  - [x] 5.1 Implement `report_html_template.ts`
    - `renderReportHtml`, the `esc()` HTML-escaping helper, and section renderers (header, score, conditional inline-SVG radar chart, recommendation, answer summary, footer with contact info and `link_agendamento` CTA)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 10.1, 10.2_

  - [ ]* 5.2 Write property test for report content completeness
    - **Property 6: Report content completeness**
    - **Validates: Requirements 6.1, 6.3, 6.4, 10.1, 10.2**

  - [ ]* 5.3 Write property test for radar-chart conditional inclusion
    - **Property 7: Radar-chart conditional inclusion**
    - **Validates: Requirements 6.2, 4.4, 4.5**

  - [x] 5.4 Implement `ReportGenerator.assemble`
    - Load Response/survey/faixa and the full Answered_Path (choice + open questions) in `services/report_generator.ts`, re-derive dimension scores via `ScoreCalculator.compute`, call `RecommendationGenerator.generate`, and build the `ReportContext` passed to `renderReportHtml`
    - _Requirements: 6.1, 6.4, 4.4, 4.5_

- [x] 6. Implement Public_Report_Token generation and find-or-create Report logic
  - [x] 6.1 Implement `generatePublicReportToken`
    - `crypto.randomBytes(32)` base64url encoding in `services/public_report_token.ts`, never derived from any sequential identifier
    - _Requirements: 17.1_

  - [ ]* 6.2 Write property test for token non-sequential and unique
    - **Property 9: Public_Report_Token non-sequential and unique**
    - **Validates: Requirements 8.2, 17.1, 17.2**

  - [x] 6.3 Implement `findOrCreateReport`
    - Update-in-place on redelivery (never regenerate token/expiry for an existing row); on miss, compute `expires_at = completed_at + 90 days` and create with a bounded regenerate-on-collision loop against `reports_public_token_unique`
    - _Requirements: 1.4, 8.2, 8.3, 17.2_

  - [ ]* 6.4 Write property test for report expiry date-math
    - **Property 10: Report expiry date-math**
    - **Validates: Requirements 8.3**

- [x] 7. Implement Recommendation_Generator and the system admin seed row
  - [x] 7.1 Create the system admin user seed row
    - Add a one-time migration/seed inserting a reserved "system" `admin_users` row for use as `ai_generation_logs.admin_user_id` on respondent-triggered (non-admin) recommendation log rows
    - _Requirements: 7.5_

  - [x] 7.2 Implement `RecommendationGenerator.generate`
    - Branch on `usarIaNoRelatorio` before any Bedrock call; catch Bedrock failures, timeouts, and unparseable content; substitute the Maturity_Band fallback (or survey-level default when `faixaId` is null) on every non-success path; write one `ai_generation_logs` row per completed Bedrock request using the system admin seed row as `admin_user_id`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 7.3 Write property test for recommendation mandatory fallback
    - **Property 8: Recommendation mandatory fallback**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**

  - [ ]* 7.4 Write unit test for token count logging
    - Verify `ai_generation_logs` records `tokens_input`/`tokens_output` when the mocked Bedrock response reports them, and `null` when it does not
    - _Requirements: 7.5_

- [x] 8. Implement Report_GeneratorJob (Reporting_Queue consumer)
  - [x] 8.1 Implement the `report_generator_job.ts` handler
    - Call `ReportGenerator.assemble`, store the rendered HTML to S3 (`reports/{response_id}/report.html`), call `findOrCreateReport`, and enqueue `pdf_generate`
    - _Requirements: 6.1, 7.6, 8.1, 8.2, 8.3_

  - [ ]* 8.2 Write unit test for HTML storage
    - Verify the job stores HTML to S3 and records `html_s3_key`
    - _Requirements: 8.1_

  - [ ]* 8.3 Write unit test for unconditional render/persist after recommendation
    - Verify `assemble()` always proceeds to render/persist for both the AI-sourced and fallback-sourced recommendation text branches
    - _Requirements: 7.6_

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement PdfRenderer and the BPA-gated storage check
  - [x] 10.1 Implement `PdfRenderer.renderFromHtml`
    - Headless Playwright Chromium wrapper (`page.setContent` + `page.pdf({ format: 'A4', printBackground: true })`) in `services/pdf_renderer.ts`
    - _Requirements: 9.1, 9.3_

  - [x] 10.2 Implement the Object_Store Block Public Access check
    - Cached-for-process-lifetime `getPublicAccessBlock` check utility that gates whether `putObject` may run
    - _Requirements: 18.3, 18.4_

  - [ ]* 10.3 Write property test for PDF worker BPA-gated storage
    - **Property 16: PDF worker BPA-gated storage**
    - **Validates: Requirements 18.3, 18.4**

  - [ ]* 10.4 Write integration test for PDF rendering
    - Render a known HTML fixture with real Playwright and assert a valid PDF (magic bytes `%PDF`) is produced
    - _Requirements: 9.1_

  - [ ]* 10.5 Write integration test for byte-identical HTML source
    - Verify the PDF is rendered from the exact bytes fetched from `html_s3_key` (mocked S3, real Playwright)
    - _Requirements: 9.3_

- [x] 11. Implement PdfGenerationJob (Reporting_Queue consumer)
  - [x] 11.1 Implement the `pdf_generation_job.ts` handler
    - Fetch `report.html_s3_key` from S3, run the BPA check before every `putObject`, render via `PdfRenderer`, store the PDF, and update `reports.pdf_s3_key`
    - _Requirements: 9.1, 9.2, 9.3, 18.3, 18.4_

- [x] 12. Implement the shared delivery failure handler
  - [x] 12.1 Implement `handleDeliveryFailure`
    - Structured log per attempt, per-channel failure metric increment, silent redeliver below Retry_Count 3, and an idempotency-guarded `relatorio_envio_falhou` write (keyed on `response_id` + `canal`) at Retry_Count 3 in `services/delivery_failure_handler.ts`
    - _Requirements: 16.1, 16.2, 16.3, 19.1, 19.2_

  - [ ]* 12.2 Write property test for retry-count failure logging exactly-once
    - **Property 14: Retry-count failure logging exactly-once**
    - **Validates: Requirements 16.1, 16.2, 16.3, 18.2**

  - [ ]* 12.3 Write unit test for observability logging
    - Verify every job handler path emits one structured log entry per attempt (including outcome) and increments the correct per-channel failure metric only on failure
    - _Requirements: 19.1, 19.2_

- [x] 13. Implement EmailDeliveryService and EmailDeliveryJob
  - [x] 13.1 Implement `EmailDeliveryService.deliver`
    - SES send with the Report's PDF attached, in `services/email_delivery_service.ts`
    - _Requirements: 13.2, 13.3_

  - [x] 13.2 Implement the `email_delivery_job.ts` handler
    - Idempotency guard on an existing `relatorio_email_enviado` event, PDF reuse-vs-render gating on `pdf_s3_key`, call `EmailDeliveryService.deliver`, log `relatorio_email_enviado` on confirmed send, route failures through `handleDeliveryFailure`
    - _Requirements: 13.1, 13.2, 13.3, 9.4, 18.2_

  - [ ]* 13.3 Write property test for email worker PDF reuse-vs-render gating
    - **Property 15: Email worker PDF reuse-vs-render gating**
    - **Validates: Requirements 9.4, 18.2**

  - [ ]* 13.4 Write unit test for PDF attachment
    - Verify the SES send call includes the PDF as an attachment
    - _Requirements: 13.3_

  - [ ]* 13.5 Write unit test for send-confirmed logging
    - Verify `relatorio_email_enviado` is logged only after SES confirms
    - _Requirements: 13.2_

- [x] 14. Implement WhatsAppDeliveryService and WhatsAppDeliveryJob
  - [x] 14.1 Implement `WhatsAppDeliveryService.deliver`
    - Approved WhatsApp Cloud API template call containing the Public_Report_Endpoint link, in `services/whatsapp_delivery_service.ts`
    - _Requirements: 14.2_

  - [ ]* 14.2 Write property test for WhatsApp template link construction
    - **Property 13: WhatsApp template link construction**
    - **Validates: Requirements 14.2**

  - [x] 14.3 Implement the `whatsapp_delivery_job.ts` handler
    - Idempotency guard on an existing `relatorio_whatsapp_enviado` event, call `WhatsAppDeliveryService.deliver`, log `relatorio_whatsapp_enviado` on confirmed send, route failures through `handleDeliveryFailure`
    - _Requirements: 14.1, 14.3, 18.2_

  - [ ]* 14.4 Write unit test for send-confirmed logging
    - Verify `relatorio_whatsapp_enviado` is logged only after the Cloud API confirms
    - _Requirements: 14.3_

- [x] 15. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Implement Public_Report_Endpoint
  - [x] 16.1 Implement `GET /r/{token}` in `controllers/public/report_controller.ts`
    - Look up by `public_token`, return the same generic 404 for both "no match" and "expired", otherwise serve the HTML and log `relatorio_link_acessado`; no auth middleware applied
    - _Requirements: 8.4, 8.5, 17.3_

  - [ ]* 16.2 Write property test for public report endpoint access control
    - **Property 11: Public report endpoint access control**
    - **Validates: Requirements 8.4, 8.5, 17.3**

  - [ ]* 16.3 Write unit test for missing S3 object handling
    - Verify a missing `html_s3_key` object for a valid, non-expired Report surfaces a 500 with logged context
    - _Requirements: 8.4_

- [x] 17. Implement report action controllers
  - [x] 17.1 Implement `maskEmail`
    - First-character-visible, rest-masked local part plus unmodified domain, in `support/mask_email.ts`
    - _Requirements: 13.4_

  - [ ]* 17.2 Write property test for email masking correctness
    - **Property 12: Email masking correctness**
    - **Validates: Requirements 13.4**

  - [x] 17.3 Implement `POST .../deliveries/email`
    - Log `relatorio_email_solicitado`, enqueue `email_deliver` addressed to the session's identification e-mail, respond with `masked_email`, in `controllers/public/report_action_controller.ts`
    - _Requirements: 13.1, 13.4_

  - [x] 17.4 Implement `POST .../deliveries/whatsapp`
    - Log `relatorio_whatsapp_solicitado`, enqueue `whatsapp_deliver` addressed to the session's identification phone number
    - _Requirements: 14.1_

  - [x] 17.5 Implement `POST .../consultant-schedule`
    - Log `consultor_solicitado` unconditionally, enqueue `consultant_notify` to the survey's `email_notificacao` (skip enqueue with a warning log when unset), return `link_agendamento`, and respond with the `link_agendamento_unavailable` error body when it is null/empty
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

  - [ ]* 17.6 Write unit test for the e-mail delivery action
    - Verify the endpoint enqueues with the session's identification e-mail and logs `relatorio_email_solicitado`
    - _Requirements: 13.1_

  - [ ]* 17.7 Write unit test for the WhatsApp delivery action
    - Verify the endpoint enqueues with the session's identification phone and logs `relatorio_whatsapp_solicitado`
    - _Requirements: 14.1_

  - [ ]* 17.8 Write unit test for the consultant scheduling action
    - Verify the endpoint logs `consultor_solicitado`, returns `link_agendamento`, and enqueues the internal notification to `email_notificacao`
    - _Requirements: 15.1, 15.2, 15.4_

  - [ ]* 17.9 Write unit test for missing link_agendamento
    - Verify the endpoint returns the `link_agendamento_unavailable` error body driving the frontend's error message
    - _Requirements: 15.3_

- [x] 18. Wire the job dispatcher and verify end-to-end chaining
  - [x] 18.1 Register all job handlers on the dispatcher
    - Wire `score_calculate`, `report_generate`, `pdf_generate`, `email_deliver`, `whatsapp_deliver`, and `consultant_notify` handlers from tasks 3, 8, 11, 13, and 14 into the dispatcher built in task 1.2
    - _Requirements: 18.1_

  - [ ]* 18.2 Write integration test for the happy-path pipeline chain
    - Drive a mocked Completion_Handoff_Message through the dispatcher and assert the score → report → PDF enqueue chain fires in order with the expected message shapes
    - _Requirements: 1.3, 8.1, 9.2_

- [x] 19. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP; core implementation tasks are never marked optional.
- Property tests use `fast-check` with a minimum of 100 iterations per the design's Testing Strategy, and each is tagged with a comment referencing its design property number.
- Each task references specific requirement sub-clauses for traceability; checkpoints validate incremental progress before moving to the next pipeline stage.
- Recommendation_Generator's `ai_generation_logs.admin_user_id` seam (task 7.1) is a one-time, additive seed row — it does not modify `foundation-data-model`'s schema.

## Task Dependency Graph

```json
{
  "waves": [
    {
      "id": 0,
      "tasks": ["1.1", "2.1", "5.1", "6.1", "7.1", "10.1", "10.2", "12.1", "13.1", "14.1", "16.1", "17.1"]
    },
    {
      "id": 1,
      "tasks": ["1.2", "2.2", "2.3", "2.4", "2.5", "3.1", "5.2", "5.3", "6.2", "6.3", "7.2", "10.3", "10.4", "10.5", "11.1", "12.2", "12.3", "13.2", "14.2", "14.3", "16.2", "16.3", "17.2", "17.3"]
    },
    {
      "id": 2,
      "tasks": ["3.2", "5.4", "6.4", "7.3", "7.4", "13.3", "13.4", "13.5", "14.4", "17.4"]
    },
    {
      "id": 3,
      "tasks": ["3.3", "3.4", "3.5", "8.1", "17.5"]
    },
    {
      "id": 4,
      "tasks": ["8.2", "8.3", "17.6", "17.7", "17.8", "17.9", "18.1"]
    },
    {
      "id": 5,
      "tasks": ["18.2"]
    }
  ]
}
```
