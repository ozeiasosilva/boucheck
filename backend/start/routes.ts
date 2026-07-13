/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const AuthController = () => import('#controllers/auth_controller')
const MeController = () => import('#controllers/me_controller')
const AdminUsersController = () => import('#controllers/admin_users_controller')
const ResponsesController = () => import('#controllers/admin/responses_controller')
const ExportController = () => import('#controllers/admin/export_controller')
const DashboardController = () => import('#controllers/admin/dashboard_controller')
const SurveysController = () => import('#controllers/surveys_controller')
const CategoriesController = () => import('#controllers/categories_controller')
const QuestionsController = () => import('#controllers/questions_controller')
const OptionsController = () => import('#controllers/options_controller')
const RulesController = () => import('#controllers/rules_controller')
const ChecklistItemsController = () => import('#controllers/checklist_items_controller')
const ScoreRangesController = () => import('#controllers/score_ranges_controller')
const AiQuestionController = () => import('#controllers/ai_question_controller')

const PublicSurveyController = () => import('#controllers/public/survey_controller')
const AnswerController = () => import('#controllers/public/answer_controller')
const ChecklistController = () => import('#controllers/public/checklist_controller')
const CompletionController = () => import('#controllers/public/completion_controller')
const PublicResponseController = () => import('#controllers/public/response_controller')
const EventController = () => import('#controllers/public/event_controller')
const ReportController = () => import('#controllers/public/report_controller')
const ReportActionController = () => import('#controllers/public/report_action_controller')

router.get('/', async () => {
  return { hello: 'BouCheck API' }
})

/**
 * Public Report Endpoint — unauthenticated, no rate-limit, no prefix.
 *
 * GET /r/:token — serves Report HTML by public_token.
 * Returns generic 404 for invalid or expired tokens (Req 8.4, 8.5, 17.3).
 */
router.get('/r/:token', [ReportController, 'show'])

/**
 * Admin routes — all under /api/admin.
 *
 * ForceHttps applies to every route in the group (Req 11.1).
 * CORS is handled at server-level (kernel.ts) restricted to /api/admin/* (Req 11.2).
 *
 * Unauthenticated auth endpoints (login, forgot, reset) need only ForceHttps.
 * All other endpoints additionally require auth guard + EnsureAdminActive (Req 1.1, 1.2, 1.3).
 */
router
  .group(() => {
    // ──────────────────────────────────────────────────────────────────────────
    // Public auth routes — no token required
    // ──────────────────────────────────────────────────────────────────────────
    router.post('/auth/login', [AuthController, 'login'])
    router.post('/auth/forgot', [AuthController, 'forgot'])
    router.post('/auth/reset', [AuthController, 'reset'])

    // ──────────────────────────────────────────────────────────────────────────
    // Protected routes — require valid token + active admin
    // ──────────────────────────────────────────────────────────────────────────
    router
      .group(() => {
        router.put('/me/password', [MeController, 'changePassword'])
        router.get('/me', [MeController, 'show'])
        router.put('/me/tema', [MeController, 'setTheme'])

        router.get('/admin-users', [AdminUsersController, 'index'])
        router.get('/admin-users/:id', [AdminUsersController, 'show'])
        router.post('/admin-users', [AdminUsersController, 'store'])
        router.put('/admin-users/:id', [AdminUsersController, 'update'])
        router.put('/admin-users/:id/password', [AdminUsersController, 'resetPassword'])

        // Response tracking & dashboard routes (admin-tracking-dashboard spec)
        router.get('/responses/export.csv', [ExportController, 'export'])
        router.get('/responses', [ResponsesController, 'index'])
        router.get('/responses/:id', [ResponsesController, 'show'])
        router.post('/responses/:id/resend', [ResponsesController, 'resend'])
        router.post('/responses/:id/anonymize', [ResponsesController, 'anonymize'])
        router.get('/dashboard', [DashboardController, 'index'])

        // ──────────────────────────────────────────────────────────────────────
        // Survey authoring routes (survey-authoring spec)
        // ──────────────────────────────────────────────────────────────────────

        // Surveys
        router.get('/surveys', [SurveysController, 'index'])
        router.get('/surveys/:id', [SurveysController, 'show'])
        router.post('/surveys', [SurveysController, 'store'])
        router.put('/surveys/:id', [SurveysController, 'update'])
        router.put('/surveys/:id/status', [SurveysController, 'setStatus'])
        router.put('/surveys/:id/archive', [SurveysController, 'archive'])
        router.post('/surveys/:id/duplicate', [SurveysController, 'duplicate'])
        router.put('/surveys/:id/visual', [SurveysController, 'setVisualIdentity'])
        router.post('/surveys/:id/logo', [SurveysController, 'uploadLogo'])
        router.put('/surveys/:id/logo/default', [SurveysController, 'setDefaultLogo'])
        router.delete('/surveys/:id/logo', [SurveysController, 'removeLogo'])

        // Categories
        router.get('/categories', [CategoriesController, 'index'])
        router.get('/categories/:id', [CategoriesController, 'show'])
        router.post('/categories', [CategoriesController, 'store'])
        router.put('/categories/:id', [CategoriesController, 'update'])
        router.delete('/categories/:id', [CategoriesController, 'destroy'])

        // Questions
        router.get('/surveys/:surveyId/questions', [QuestionsController, 'index'])
        router.post('/surveys/:surveyId/questions', [QuestionsController, 'store'])
        router.get('/questions/:id', [QuestionsController, 'show'])
        router.put('/questions/:id', [QuestionsController, 'update'])
        router.delete('/questions/:id', [QuestionsController, 'destroy'])
        router.put('/surveys/:surveyId/questions/reorder', [QuestionsController, 'reorder'])

        // Options
        router.post('/questions/:questionId/options', [OptionsController, 'store'])
        router.put('/options/:id', [OptionsController, 'update'])
        router.delete('/options/:id', [OptionsController, 'destroy'])

        // Rules
        router.post('/rules', [RulesController, 'store'])
        router.get('/rules/:id', [RulesController, 'show'])
        router.put('/rules/:id', [RulesController, 'update'])
        router.delete('/rules/:id', [RulesController, 'destroy'])
        router.get('/surveys/:surveyId/flow', [RulesController, 'flow'])

        // Checklist Items
        router.get('/surveys/:surveyId/checklist-items', [ChecklistItemsController, 'index'])
        router.post('/surveys/:surveyId/checklist-items', [ChecklistItemsController, 'store'])
        router.put('/checklist-items/:id', [ChecklistItemsController, 'update'])
        router.delete('/checklist-items/:id', [ChecklistItemsController, 'destroy'])
        router.post('/surveys/:surveyId/checklist-items/import', [ChecklistItemsController, 'import'])

        // Score Ranges
        router.get('/surveys/:surveyId/score-ranges', [ScoreRangesController, 'index'])
        router.post('/surveys/:surveyId/score-ranges', [ScoreRangesController, 'store'])
        router.put('/score-ranges/:id', [ScoreRangesController, 'update'])
        router.delete('/score-ranges/:id', [ScoreRangesController, 'destroy'])

        // ──────────────────────────────────────────────────────────────────────
        // AI question generation (ai-question-generation spec)
        // ──────────────────────────────────────────────────────────────────────
        router.post('/surveys/:id/ai/generate-questions', [AiQuestionController, 'generate'])
        router.post('/surveys/:id/ai/confirm-questions', [AiQuestionController, 'confirm'])
      })
      .use([middleware.auth(), middleware.ensureAdminActive()])
  })
  .prefix('/api/admin')
  .use([middleware.forceHttps()])

/**
 * Public API routes — unauthenticated respondent endpoints under /api/public.
 *
 * All public routes are rate-limited by IP via `rateLimit` middleware (Req 9.2).
 * Write endpoints that operate on an existing Response_Session additionally use
 * `responseTokenAuth` (Req 9.1) to validate the token URL parameter.
 *
 * Route structure:
 *   /api/public (rateLimit on all):
 *     GET  /surveys/:slug                        → landing metadata
 *     GET  /surveys/:slug/structure              → full survey structure
 *     POST /surveys/:slug/responses              → session creation (no token yet)
 *
 *     (responseTokenAuth):
 *       PUT  /responses/:token/answers/:questionId → auto-save answer
 *       POST /responses/:token/checklist           → persist checklist
 *       POST /responses/:token/complete            → completion revalidation
 *       POST /responses/:token/events              → event logging
 */
router
  .group(() => {
    // Read routes — no auth required beyond rate limit
    router.get('/surveys/:slug', [PublicSurveyController, 'show'])
    router.get('/surveys/:slug/structure', [PublicSurveyController, 'structure'])

    // Session creation (identification form submission) — no token exists yet
    router.post('/surveys/:slug/responses', [PublicResponseController, 'store'])

    // Token-authenticated write routes (Req 9.1)
    router
      .group(() => {
        router.put('/responses/:token/answers/:questionId', [AnswerController, 'handle'])
        router.post('/responses/:token/checklist', [ChecklistController, 'handle'])
        router.post('/responses/:token/complete', [CompletionController, 'handle'])
        router.post('/responses/:token/events', [EventController, 'handle'])
        router.get('/responses/:token/report', [ReportActionController, 'show'])
        router.post('/responses/:token/deliveries/email', [ReportActionController, 'email'])
        router.post('/responses/:token/deliveries/whatsapp', [ReportActionController, 'whatsapp'])
        router.post('/responses/:token/consultant-schedule', [ReportActionController, 'consultantSchedule'])
      })
      .use([middleware.responseTokenAuth()])
  })
  .prefix('/api/public')
  .use([middleware.rateLimit()])
