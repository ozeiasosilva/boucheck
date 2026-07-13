# Implementation Plan: admin-tracking-dashboard

## Overview

This plan implements the administrator-facing response tracking and indicators dashboard (spec 7 of 7) for BouCheck, in AdonisJS 6 / TypeScript, per the approved design. It builds the shared `Session_Query_Builder`, then layers `Response_Tracking_Service`, `CSV_Exporter`, `Resend_Service`, `Anonymization_Service`, and `Dashboard_Service` on top of it, followed by validators, controllers, and route registration under the existing `admin-auth-users` middleware chain. Each implementation task is followed closely by its property-based tests (fast-check, 100+ iterations) for the design's 25 correctness properties, plus the unit/integration tests called for by the design's Testing Strategy table.

## Tasks

- [x] 1. Build the shared Session_Query_Builder
  - [x] 1.1 Define shared listing types and constants
    - Create `app/services/session_query_builder.ts` with `SessionListingFilters`, `SortOrder`, `PaginationParams`, `ReportActionFilter` types, the `INDICATOR_EXPRESSIONS` / `existsEvent` helper, and the Report_Action_Filter → predicate table
    - _Requirements: 1.1, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
  - [x] 1.2 Implement `SessionQueryBuilder.build()`
    - Apply every active filter via AND, the four Report_Indicator `EXISTS` subqueries, the `Report_Action_Filter` predicate, the Fill_Time/Progress_Percentage `CASE` expressions, default `started_at desc` ordering, and optional pagination (omitted for CSV use)
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1_
  - [x] 1.3 Implement `SessionQueryBuilder.count()`
    - Return the total count of Response_Sessions matching `filters`, independent of pagination
    - _Requirements: 3.2_
  - [x] 1.4 Write property test for individual filter predicates
    - **Property 2: Individual filter predicate correctness**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**
  - [x] 1.5 Write property test for filter combination (AND semantics)
    - **Property 3: Filter combination correctness**
    - **Validates: Requirements 2.7**
  - [x] 1.6 Write property test for default ordering
    - **Property 4: Default ordering**
    - **Validates: Requirements 3.1**
  - [x] 1.7 Write property test for pagination totals and page partitioning
    - **Property 5: Pagination totals and page partitioning**
    - **Validates: Requirements 3.2**
  - [x] 1.8 Write property test for pagination boundary behavior
    - **Property 6: Pagination boundary behavior**
    - **Validates: Requirements 3.3**

- [x] 2. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implement Response_Tracking_Service listing and per-question time
  - [x] 3.1 Implement `computePerQuestionTime` pure function
    - Add to `app/services/response_tracking_service.ts`; accumulate duration from `startedAt` then from the preceding event; empty input yields an empty array
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [x] 3.2 Write property test for per-question time calculation
    - **Property 10: Per-question time calculation**
    - **Validates: Requirements 6.1, 6.2, 6.3**
  - [x] 3.3 Implement `ResponseTrackingService.list()`
    - Call `SessionQueryBuilder.build()`/`.count()`, project the `SessionListingRow` shape, and compute Progress_Percentage in application code for `iniciado` rows using the reused Navigation_Engine path-length logic
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 3.1, 3.2, 3.3_
  - [x] 3.4 Write property test for listing row shape, PII passthrough, and Fill_Time/Progress_Percentage exclusivity
    - **Property 1: Listing row shape, PII passthrough, and Fill_Time/Progress_Percentage mutual exclusivity**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
  - [x] 3.5 Write unit test for zero-events Per_Question_Time
    - Assert a session with zero `pergunta_respondida` events returns an empty Per_Question_Time array with no substitute metadata
    - _Requirements: 6.4_

- [x] 4. Implement Response_Tracking_Service detail, timeline, and joins
  - [x] 4.1 Implement `ResponseTrackingService.detail()`
    - Join respondent fields/status/survey identification, `response_answers` (question text + option/free-text), `response_checklist` (item name + group), and the ordered Event_Timeline; call `computePerQuestionTime`; throw `NotFoundException` for a missing id
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 6.1_
  - [x] 4.2 Write property test for answer/checklist join completeness
    - **Property 7: Session detail answer and checklist join completeness**
    - **Validates: Requirements 4.2, 4.3**
  - [x] 4.3 Write property test for session detail PII passthrough
    - **Property 8: Session detail PII passthrough**
    - **Validates: Requirements 4.4**
  - [x] 4.4 Write property test for event timeline completeness and ordering
    - **Property 9: Event timeline completeness and ordering**
    - **Validates: Requirements 5.1, 5.2**
  - [x] 4.5 Write unit test for detail 404 mapping
    - Assert `GET /responses/{id}` for a non-existent id responds 404
    - _Requirements: 4.5_

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement CSV_Exporter
  - [x] 6.1 Implement streaming `CsvExporter.export()`
    - Add `app/services/csv_exporter.ts`; push the UTF-8 BOM and `;`-joined header, stream rows from the unpaginated `SessionQueryBuilder` cursor through `csvEscape`, and end the stream
    - _Requirements: 7.1, 7.2, 7.3_
  - [x] 6.2 Write property test for CSV content parity with the unpaginated listing
    - **Property 11: CSV content parity with the unpaginated listing**
    - **Validates: Requirements 7.1**
  - [x] 6.3 Write property test for CSV format correctness
    - **Property 12: CSV format correctness**
    - **Validates: Requirements 7.2, 7.3**
  - [x] 6.4 Write unit test for CSV response headers
    - Assert `Content-Type` is a CSV media type and `Content-Disposition` is `attachment` with a filename
    - _Requirements: 7.4_

- [x] 7. Implement Resend_Service
  - [x] 7.1 Implement `resolveChannel` pure function
    - Add `app/services/resend_service.ts` with the tagged-union resolution logic (`resolved` / `ambiguous` / `not_found`) over an explicit channel and a `failedChannels` set
    - _Requirements: 8.2, 8.3, 8.4, 8.5_
  - [x] 7.2 Write property test for Delivery_Channel resolution logic
    - **Property 13: Delivery_Channel resolution logic**
    - **Validates: Requirements 8.2, 8.3, 8.4, 8.5, 8.6, 8.7**
  - [x] 7.3 Implement `ResendService.resend()`
    - Load distinct failed channels from `relatorio_envio_falhou` events, call `resolveChannel`, throw `NotFoundException`/`AmbiguousChannelException`/`ChannelNotFoundException` as appropriate, enqueue the exact `email_deliver`/`whatsapp_deliver` message reporting-delivery's workers already consume, and log the `relatorio_reenvio_solicitado` Manual_Resend_Event
    - _Requirements: 8.1, 8.6, 8.7_
  - [x] 7.4 Write unit test for resend error mapping
    - Assert session-not-found → 404, ambiguous channel → 422, channel-not-found → 422, with no enqueue in the 422 cases
    - _Requirements: 8.1, 8.4, 8.5_
  - [x] 7.5 Write integration test for the resend re-enqueue contract
    - Assert the enqueued message matches reporting-delivery's `ReportingQueueMessage` union shape exactly and is processed by the existing (unmodified) delivery worker/mock without error
    - _Requirements: 8.6_

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement Anonymization_Service
  - [x] 9.1 Implement `ANONYMIZED_PLACEHOLDERS` and the combined-UPDATE anonymize path
    - Add `app/services/anonymization_service.ts`; throw `NotFoundException` for a missing id; short-circuit with a 200 no-op when `anonimizado` is already `true`; otherwise write all six PII columns plus `anonimizado = true` in one statement
    - _Requirements: 9.1, 9.2, 9.3, 9.5_
  - [x] 9.2 Write property test for anonymization completeness and non-interference
    - **Property 14: Anonymization completeness and non-interference**
    - **Validates: Requirements 9.2, 9.3, 9.4**
  - [x] 9.3 Write property test for anonymization idempotency
    - **Property 15: Anonymization idempotency**
    - **Validates: Requirements 9.5**
  - [x] 9.4 Implement the column-by-column fallback path
    - On a combined-`UPDATE` failure, retry each of the six PII columns independently, persist whichever succeed, and unconditionally set `anonimizado = true` outside the per-column try/catch
    - _Requirements: 9.6_
  - [x] 9.5 Write property test for anonymization partial-failure handling
    - **Property 16: Anonymization partial-failure handling**
    - **Validates: Requirements 9.6**
  - [x] 9.6 Write unit test for anonymize 404 mapping
    - Assert anonymizing a non-existent session id responds 404
    - _Requirements: 9.1_

- [x] 10. Implement Dashboard_Service
  - [x] 10.1 Implement the top-line counts and completion-rate query
    - Add `app/services/dashboard_service.ts`; compute Access_Count, Started_Count, Completed_Count via the shared survey/period predicate, and the completion rate with an application-level divide-by-zero guard
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
  - [x] 10.2 Write property test for top-line counts and completion rate
    - **Property 17: Top-line counts and completion rate**
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5**
  - [x] 10.3 Implement the funnel query
    - Compute the seven Funnel_Stage counts via `COUNT(*) FILTER (WHERE EXISTS ...)` against the same survey/period predicate, asserting the completed stage equals Completed_Count by shared predicate construction
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8_
  - [x] 10.4 Write property test for funnel stage counting correctness
    - **Property 18: Funnel stage counting correctness**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8**
  - [x] 10.5 Implement the average fill time query
    - `AVG(EXTRACT(EPOCH FROM (completed_at - started_at)))` filtered to `status = 'completo'`, relying on PostgreSQL's native `NULL`-over-zero-rows
    - _Requirements: 12.1, 12.2, 12.3_
  - [x] 10.6 Write property test for average fill time
    - **Property 19: Average fill time**
    - **Validates: Requirements 12.1, 12.2, 12.3**
  - [x] 10.7 Implement the highest-abandonment question query
    - `DISTINCT ON (response_id)` last-answered-question CTE over `iniciado` sessions, grouped and ordered `count DESC, question_id ASC LIMIT 1`; null result maps to a null Highest_Abandonment_Question
    - _Requirements: 13.1, 13.2, 13.3_
  - [x] 10.8 Write property test for highest-abandonment question selection and tie-break
    - **Property 20: Highest-abandonment question selection and tie-break**
    - **Validates: Requirements 13.1, 13.2, 13.3**
  - [x] 10.9 Implement the response distribution per question query
    - `LEFT JOIN` from `question_options` to `response_answers` (scoped to matching sessions) excluding `tipo = 'aberta'`, so every choice-type question/option pair appears with a zero-defaulted count
    - _Requirements: 14.1, 14.2_
  - [x] 10.10 Write property test for response distribution completeness
    - **Property 21: Response distribution completeness**
    - **Validates: Requirements 14.1, 14.2**
  - [x] 10.11 Implement the daily time series query
    - `generate_series(periodStart, periodEnd, interval '1 day')` left-joined to a per-day session count, zero-filling days with no matches
    - _Requirements: 15.1, 15.2_
  - [x] 10.12 Write property test for daily time series zero-fill completeness
    - **Property 22: Daily time series zero-fill completeness**
    - **Validates: Requirements 15.1, 15.2**
  - [x] 10.13 Implement the top checklist items by group query
    - `LEFT JOIN` from `checklist_items` to `response_checklist` (scoped to matching sessions), grouped by `grupo`, ordered by selection count descending with a stable id tie-break, reshaped into the `Record<grupo, [...]>` view
    - _Requirements: 16.1_
  - [x] 10.14 Write property test for top checklist items ordering
    - **Property 23: Top checklist items ordering**
    - **Validates: Requirements 16.1**
  - [x] 10.15 Wire `DashboardService.compute()`
    - Run all seven metric-group queries in parallel via `Promise.all`, share the survey/period `WHERE` predicate builder (including the "all surveys" no-`survey_id`-predicate case), and re-assert the required-filters invariant defensively
    - _Requirements: 17.4, 18.1_
  - [x] 10.16 Write property test for all-surveys scope equivalence
    - **Property 25: All-surveys scope equivalence**
    - **Validates: Requirements 17.4**

- [x] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Implement validators
  - [x] 12.1 Implement the listing filters validator
    - Add `app/validators/admin_tracking_validators.ts`; validate optional survey/date-range/status/name/company/Report_Action_Filter query params for `GET /responses` and `export.csv`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
  - [x] 12.2 Implement the resend body validator
    - Validate the optional explicit Delivery_Channel body field for `POST /responses/{id}/resend`
    - _Requirements: 8.2_
  - [x] 12.3 Implement the dashboard filters validator
    - Require the survey filter and Dashboard_Period (start + end date) on `GET /dashboard`, rejecting with 422 before any controller calls `DashboardService.compute()`
    - _Requirements: 17.1, 17.2, 17.3_
  - [x] 12.4 Write property test for required dashboard filters
    - **Property 24: Required dashboard filters**
    - **Validates: Requirements 17.1, 17.2, 17.3**

- [x] 13. Implement controllers and register routes
  - [x] 13.1 Implement `ResponsesController`
    - Add `app/controllers/admin/responses_controller.ts` with `index`, `show`, `resend`, `anonymize`, each validating input then delegating to exactly one service method and mapping thrown exceptions to their documented HTTP status
    - _Requirements: 1.1, 2.1, 3.2, 4.1, 4.5, 8.1, 8.4, 8.5, 9.1_
  - [x] 13.2 Implement `ExportController`
    - Add `app/controllers/admin/export_controller.ts` with `export`, validating filters, setting the CSV `Content-Type`/`Content-Disposition` headers, and piping `CsvExporter.export()`'s stream to the response
    - _Requirements: 7.1, 7.4_
  - [x] 13.3 Implement `DashboardController`
    - Add `app/controllers/admin/dashboard_controller.ts` with `index`, validating the required survey/period filters and delegating to `DashboardService.compute()`
    - _Requirements: 17.1, 17.2, 17.3, 17.4_
  - [x] 13.4 Register routes under the existing admin middleware chain
    - Add `GET /api/admin/responses`, `GET /api/admin/responses/{id}`, `POST /api/admin/responses/{id}/resend`, `GET /api/admin/responses/export.csv`, `POST /api/admin/responses/{id}/anonymize`, and `GET /api/admin/dashboard` to `routes.ts` inside the existing `/api/admin` group (`ForceHttps` → CORS → auth guard → `EnsureAdminActive`); introduce no new middleware
    - _Requirements: 20.1_
  - [x] 13.5 Write route-to-middleware wiring smoke test
    - Assert every route this spec defines resolves through `ForceHttps → CORS → auth guard → EnsureAdminActive`
    - _Requirements: 20.1_
  - [x] 13.6 Write missing-bearer-token integration test
    - Assert every route this spec defines responds 401 when called without a valid admin bearer token
    - _Requirements: 20.2_
  - [x] 13.7 Write unit test for the full 404/422 error-mapping table
    - Cover session-not-found (404), page-beyond-last-page (200 empty page), ambiguous/absent Delivery_Channel (422), and missing dashboard survey/period filters (422)
    - _Requirements: 3.3, 4.5, 8.1, 8.4, 8.5, 9.1, 17.2, 17.3_

- [x] 14. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Validate dashboard load performance
  - [x] 15.1 Write dashboard load performance integration test
    - Seed ~10,000 matching Response_Sessions and assert `GET /api/admin/dashboard` returns within 3 seconds
    - _Requirements: 19.1_

- [x] 16. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test tasks and are not implemented by the coding agent; they are written by whoever runs the property/unit/integration test suite.
- `Session_Query_Builder` is deliberately built and tested first (tasks 1.x) because `Response_Tracking_Service` and `CSV_Exporter` both depend on it structurally, per the design's shared-builder decision.
- `Dashboard_Service`'s seven metric-group queries (tasks 10.1–10.14) are each independently implemented and property-tested before being wired together in parallel (10.15), so a formula bug in one metric group is caught before the queries are combined.
- Property tests reference the design document's Property numbers 1–25 directly; every property has exactly one corresponding sub-task.
- The performance test (15.1) and the auth-wiring/error-mapping tests (13.5–13.7) correspond to the design's Testing Strategy table entries that are explicitly *not* property tests (fixed contracts and a fixed-volume latency check, not per-input logic).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "3.1", "7.1", "9.1", "10.1", "12.1"] },
    { "id": 1, "tasks": ["1.2", "3.2", "7.2", "7.3", "9.2", "9.3", "9.6", "9.4", "10.2", "10.3", "12.2"] },
    { "id": 2, "tasks": ["1.3", "7.4", "7.5", "9.5", "10.4", "10.5", "12.3"] },
    { "id": 3, "tasks": ["1.4", "1.5", "1.6", "1.7", "1.8", "3.3", "6.1", "10.6", "10.7", "12.4"] },
    { "id": 4, "tasks": ["3.4", "3.5", "6.2", "6.3", "6.4", "10.8", "10.9"] },
    { "id": 5, "tasks": ["4.1", "10.10", "10.11"] },
    { "id": 6, "tasks": ["4.2", "4.3", "4.4", "4.5", "10.12", "10.13"] },
    { "id": 7, "tasks": ["10.14", "10.15"] },
    { "id": 8, "tasks": ["10.16", "13.1", "13.2", "13.3"] },
    { "id": 9, "tasks": ["13.4"] },
    { "id": 10, "tasks": ["13.5", "13.6", "13.7", "15.1"] }
  ]
}
```
