# Requirements Document

## Introduction

Landing page pública na rota raiz (`/`) do frontend Next.js, promovendo o diagnóstico "Raio-X de Maturidade de TI". A página segue o estilo single-page landing (hero, benefícios, CTA) inspirada em https://joaokepler.com.br/diagnostico. O link do CTA é configurável pelo painel administrativo, desacoplando a landing page de qualquer survey específica.

## Glossary

- **Landing_Page**: Página pública acessível na rota `/` do frontend Next.js, contendo hero section, seção de benefícios e call-to-action
- **CTA_Button**: Botão de call-to-action ("Quero meu diagnóstico agora") que redireciona o visitante para a survey configurada
- **Admin_Panel**: Painel administrativo existente em `/admin/` com autenticação e CRUD de surveys
- **Settings_Module**: Novo módulo "Configurações" no Admin_Panel para gerenciar configurações gerais da plataforma
- **Settings_API**: Endpoint da API backend que persiste e retorna configurações do sistema (key-value)
- **Landing_Survey_Link**: Configuração armazenada no backend que determina qual survey a Landing_Page CTA_Button direciona
- **Survey**: Pesquisa/diagnóstico acessível publicamente via `/{slug}`
- **Visitor**: Usuário não autenticado que acessa a Landing_Page

## Requirements

### Requirement 1: Landing Page Rendering

**User Story:** As a Visitor, I want to see a professional landing page when I access the root URL, so that I understand the value of the diagnostic and feel compelled to start it.

#### Acceptance Criteria

1. WHEN a Visitor navigates to the root route (`/`), THE Landing_Page SHALL render a hero section containing a headline (maximum 80 characters), a subheadline (maximum 160 characters), and a CTA_Button that navigates the Visitor to the diagnostic start flow
2. WHEN a Visitor navigates to the root route (`/`), THE Landing_Page SHALL render a benefits section containing at least 3 and at most 6 value propositions, each with a title and a short description
3. WHEN a Visitor navigates to the root route (`/`), THE Landing_Page SHALL render using IBM Plex Sans for body text and Bricolage Grotesque for headings, with system sans-serif as fallback while web fonts load
4. THE Landing_Page SHALL be fully responsive across mobile (320px+), tablet (768px+), and desktop (1024px+) viewports, with no horizontal overflow, no content truncation, and all interactive elements meeting a minimum touch target of 44×44 CSS pixels on mobile
5. THE Landing_Page SHALL use the existing brand color palette (primary blue #1c57e5, accent orange #ff8a00, dark #010B31) and teal accent (#0E7C86) for diagnostic-specific highlights
6. WHEN the CTA_Button is activated, THE Landing_Page SHALL navigate the Visitor to the diagnostic identification page within 1 second of interaction

### Requirement 2: CTA Button Behavior

**User Story:** As a Visitor, I want to click the CTA button and be taken directly to the configured survey, so that I can start the diagnostic immediately.

#### Acceptance Criteria

1. WHEN a Visitor clicks the CTA_Button, THE Landing_Page SHALL navigate the Visitor to the route `/{slug}` where `{slug}` is the Survey slug value stored in Landing_Survey_Link, using same-tab navigation
2. WHILE the Landing_Survey_Link value is null or an empty string, THE Landing_Page SHALL not render the CTA_Button in the DOM
3. THE CTA_Button SHALL display the text "Quero meu diagnóstico agora"
4. THE Landing_Page SHALL fetch the Landing_Survey_Link from the Settings_API on page load using server-side rendering with a timeout of 5 seconds
5. IF the Settings_API is unreachable or returns an error during server-side rendering, THEN THE Landing_Page SHALL render the page without the CTA_Button

### Requirement 3: Marketing Content Sections

**User Story:** As a Visitor, I want to understand what the diagnostic offers before starting, so that I feel confident it provides genuine value.

#### Acceptance Criteria

1. THE Landing_Page SHALL display a hero section containing: a headline describing the diagnostic purpose, a subtitle explaining what the visitor will receive, and metadata items showing the estimated duration (approximately 12 minutes), the number of pillars evaluated, and that the report is immediate
2. THE Landing_Page SHALL display a benefits section listing at least 4 value propositions (visual score report, radar chart, actionable recommendations, CMMI-based methodology) as distinct, individually readable items
3. THE Landing_Page SHALL address the target audience of business directors and executives by using formal second-person language, avoiding technical jargon, and framing questions around business impact rather than technical implementation
4. THE Landing_Page SHALL communicate the diagnostic output (visual report with score) without requiring payment, account creation, or scheduling a meeting as a precondition to viewing results
5. THE Landing_Page SHALL display a primary call-to-action button within the hero or introduction section that navigates the visitor to the data collection form to begin the diagnostic

### Requirement 4: Admin Settings Configuration

**User Story:** As an Admin, I want to configure which survey the landing page links to, so that I can change the featured diagnostic without modifying code.

#### Acceptance Criteria

1. WHEN an authenticated Admin navigates to the Settings_Module, THE Admin_Panel SHALL display a form to configure the Landing_Survey_Link with the currently persisted Survey pre-selected in the field (or no selection if none has been configured)
2. WHEN the Settings_Module loads the Landing_Survey_Link form, THE Settings_Module SHALL present a dropdown listing all Surveys with status "ativo", identified by their nome, for the Admin to choose as Landing_Survey_Link
3. WHEN the Admin saves the Landing_Survey_Link configuration, THE Settings_API SHALL persist the selected Survey identifier and THE Settings_Module SHALL display a success confirmation message within 2 seconds
4. IF the Admin attempts to save without selecting a Survey, THEN THE Settings_Module SHALL display a validation message indicating the field is required and SHALL NOT submit the request to the Settings_API
5. THE Settings_Module SHALL be accessible via a "Configurações" navigation item in the Admin_Panel sidebar
6. IF no Landing_Survey_Link has been configured, THEN THE landing page SHALL display a message indicating that no diagnostic is currently available instead of linking to a Survey
7. IF the currently configured Landing_Survey_Link references a Survey whose status is no longer "ativo", THEN THE Settings_Module SHALL display a warning indicating the linked Survey is inactive and prompt the Admin to select a new one

### Requirement 5: Settings Backend API

**User Story:** As a system integrator, I want a backend API for reading and writing platform settings, so that the landing page and admin panel can share configuration data.

#### Acceptance Criteria

1. WHEN the Landing_Page requests the Landing_Survey_Link, THE Settings_API SHALL return a JSON object containing the setting key and its stored value (or null if not yet configured) with HTTP status 200
2. WHEN an authenticated Admin submits a new Landing_Survey_Link value, THE Settings_API SHALL persist the value and return HTTP status 200 with a JSON confirmation body
3. IF the requested setting key does not exist, THEN THE Settings_API SHALL return a JSON object with the requested key and a null value with HTTP status 200
4. THE Settings_API SHALL require admin authentication for write operations
5. THE Settings_API SHALL allow unauthenticated read access for the Landing_Survey_Link setting (public endpoint)
6. IF an unauthenticated request attempts a write operation, THEN THE Settings_API SHALL reject the request with HTTP status 401 and not modify any stored settings
7. IF the Admin submits a setting value that fails validation, THEN THE Settings_API SHALL reject the request with HTTP status 422 and return a response indicating the validation errors

### Requirement 6: SEO and Performance

**User Story:** As a product owner, I want the landing page to be well-optimized for search engines and fast to load, so that organic traffic converts effectively.

#### Acceptance Criteria

1. THE Landing_Page SHALL render as a server-side rendered page (Next.js SSR or static generation) to ensure search engine indexability
2. THE Landing_Page SHALL include meta tags with: a page title (between 30 and 60 characters), a meta description (between 120 and 160 characters), a canonical URL pointing to the root route, and Open Graph properties (og:title, og:description, og:image, og:url, og:type) describing the diagnostic
3. THE Landing_Page SHALL achieve a Largest Contentful Paint (LCP) below 2.5 seconds and a total transferred page weight below 500 KB when measured on a simulated 4G connection (1.6 Mbps download, 750 Kbps upload, 150 ms RTT)
4. THE Landing_Page SHALL use semantic HTML elements (header, main, section, footer) with a single h1 element in the hero section and h2 elements for each subsequent content section to form a logical heading hierarchy
5. THE Landing_Page SHALL serve all images in next-gen formats (WebP or AVIF) with explicit width and height attributes, and lazy-load images positioned below the initial viewport
