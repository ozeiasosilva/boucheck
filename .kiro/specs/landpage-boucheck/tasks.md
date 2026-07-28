# Implementation Plan: Landing Page Boucheck

## Overview

Implementation of a public landing page at the root route (`/`) promoting the "Raio-X de Maturidade de TI" diagnostic, with a dynamically configurable CTA link managed through a new admin Settings module. The backend uses a key-value settings table (AdonisJS), and the frontend is built with Next.js 15 server components.

## Tasks

- [x] 1. Set up Settings database table and model
  - [x] 1.1 Create migration file for `settings` table with columns: id (PK auto-increment), key (varchar 100, unique, not null), value (text, nullable), updated_at (timestamp auto-update)
    - Create file `backend/database/migrations/..._create_settings_table.ts`
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 1.2 Create Setting Lucid model with decorators matching the table schema
    - Create file `backend/app/models/setting.ts`
    - Define `id`, `key`, `value`, `updatedAt` columns with proper Lucid decorators
    - _Requirements: 5.1, 5.2_

  - [x] 1.3 Run migration and verify it applies cleanly
    - _Requirements: 5.1_

- [x] 2. Implement Settings backend API endpoints
  - [x] 2.1 Create AdminSettingsController with `index` (GET all) and `update` (PUT upsert) methods
    - Create file `backend/app/controllers/admin/settings_controller.ts`
    - Implement VineJS validation for PUT body (key must match `^[a-z_]+$`, value must be string or null)
    - _Requirements: 5.2, 5.4_

  - [x] 2.2 Create PublicSettingsController with `show` (GET by key) method
    - Create file `backend/app/controllers/public/settings_controller.ts`
    - Return `{ key, value }` where value is null if key not found (200 status)
    - _Requirements: 5.1, 5.3, 5.5_

  - [x] 2.3 Register routes in `backend/start/routes.ts`
    - Add `GET /api/admin/settings` and `PUT /api/admin/settings` in authenticated admin group
    - Add `GET /api/public/settings/:key` in public group
    - _Requirements: 5.4, 5.5_

  - [ ]* 2.4 Write property test for Settings Round-Trip
    - **Property 1: Settings Round-Trip**
    - Generate random alphanumeric slugs (1-50 chars, lowercase + hyphens), PUT via admin endpoint, GET via public endpoint, assert same value returned
    - **Validates: Requirements 4.3, 5.1, 5.2**

  - [ ]* 2.5 Write property test for Authentication Guard on Write
    - **Property 3: Authentication Guard on Write**
    - Generate random JSON bodies, PUT to admin settings without auth token, assert 401 response
    - **Validates: Requirements 5.4**

- [x] 3. Checkpoint - Backend settings verified
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement Admin Settings page (frontend)
  - [x] 4.1 Add settings API methods to `frontend/lib/admin/api.ts`
    - Add `getAll()`, `update(settings)` methods for admin settings
    - Add public `getByKey(key)` method for fetching a single setting
    - _Requirements: 4.1, 5.1, 5.2_

  - [x] 4.2 Create Admin Settings page at `frontend/app/admin/settings/page.tsx`
    - Client component with dropdown of published surveys and save button
    - Fetch published surveys via existing admin API
    - Show validation error if admin tries to save without selecting a survey
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 4.3 Update sidebar navigation in `frontend/components/admin/sidebar.tsx`
    - Add or update "Configurações" link pointing to `/admin/settings`
    - _Requirements: 4.5_

- [x] 5. Implement Landing Page layout, header, and footer
  - [x] 5.1 Configure fonts (IBM Plex Sans + Bricolage Grotesque) via `next/font/google` in `frontend/app/layout.tsx`
    - _Requirements: 1.3_

  - [x] 5.2 Create `frontend/components/landing/landing-header.tsx` with logo and minimal navigation
    - Use semantic HTML `<header>` element
    - _Requirements: 1.1, 6.4_

  - [x] 5.3 Create `frontend/components/landing/landing-footer.tsx` with copyright and minimal links
    - Use semantic HTML `<footer>` element
    - _Requirements: 6.4_

  - [x] 5.4 Rewrite `frontend/app/page.tsx` as server component that fetches `landing_survey_link` setting and renders full landing layout
    - Use try/catch for graceful degradation if API unreachable
    - Compose header, hero, benefits, how-it-works, and footer sections
    - _Requirements: 1.1, 2.4, 6.1_

- [x] 6. Implement Landing Page content sections
  - [x] 6.1 Create `frontend/components/landing/hero-section.tsx`
    - Accept `surveySlug` prop (string | null)
    - Render headline "Descubra a maturidade de TI da sua empresa", subheadline (free, ~12 min, immediate report), and CTA button
    - CTA renders only when `surveySlug` is non-null, linking to `/{surveySlug}`
    - CTA text: "Quero meu diagnóstico agora", styled with teal accent (#0E7C86)
    - Use Bricolage Grotesque for headline, responsive layout
    - _Requirements: 1.1, 2.1, 2.2, 2.3, 3.1_

  - [x] 6.2 Create `frontend/components/landing/benefits-section.tsx`
    - Display at least 4 benefit cards: visual score report, radar chart, actionable recommendations, CMMI-based methodology
    - Responsive grid layout with brand colors
    - _Requirements: 1.2, 3.2, 3.3, 3.4_

  - [x] 6.3 Create `frontend/components/landing/how-it-works-section.tsx`
    - Display 3-step process: Responda → Receba → Evolua
    - Responsive layout with brand colors
    - _Requirements: 3.2_

  - [ ]* 6.4 Write property test for CTA Visibility Invariant
    - **Property 2: CTA Visibility Invariant**
    - Generate arbitrary strings including null, empty, and valid slugs; assert CTA visible iff value is non-null and non-empty, and href equals `"/" + value`
    - **Validates: Requirements 2.1, 2.2**

- [x] 7. Add SEO and meta tags
  - [x] 7.1 Export Next.js `metadata` object in `frontend/app/page.tsx` with title, description, and Open Graph tags
    - _Requirements: 6.2_

  - [x] 7.2 Ensure all landing page sections use semantic HTML (header, main, section with aria-labels, footer) and structured heading hierarchy (h1 in hero, h2 in sections)
    - _Requirements: 6.4_

- [x] 8. Checkpoint - Full integration verification
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Integration testing
  - [ ]* 9.1 Write integration test: PUT a survey slug via admin endpoint, then GET via public endpoint → returns same slug
    - Create file `backend/tests/functional/settings.spec.ts`
    - _Requirements: 4.3, 5.1, 5.2_

  - [ ]* 9.2 Write integration test: GET non-existent key → returns null with 200
    - _Requirements: 5.3_

  - [ ]* 9.3 Write integration test: PUT without auth → returns 401
    - _Requirements: 5.4_

  - [ ]* 9.4 Write integration test: PUT with empty value → clears the setting (value becomes null)
    - _Requirements: 5.2_

- [x] 10. Final checkpoint - All tests passing
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The design uses TypeScript throughout (AdonisJS backend + Next.js frontend)
- Landing page uses graceful degradation: if settings API fails, CTA is hidden but page still renders
- The `fast-check` library is used for property-based tests with minimum 100 iterations

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3"] },
    { "id": 2, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 3, "tasks": ["2.4", "2.5", "4.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "5.1"] },
    { "id": 5, "tasks": ["5.2", "5.3", "5.4"] },
    { "id": 6, "tasks": ["6.1", "6.2", "6.3"] },
    { "id": 7, "tasks": ["6.4", "7.1", "7.2"] },
    { "id": 8, "tasks": ["9.1", "9.2", "9.3", "9.4"] }
  ]
}
```
