export { getToken, setToken, clearToken } from './token'
export {
  fetchSurveyBySlug,
  fetchSurveyStructure,
  submitIdentification,
  saveAnswer,
  submitChecklist,
  triggerCompletion,
  logEvent,
  ApiResponseError,
} from './client'
export type {
  SurveyLanding,
  CreateResponseResult,
  ResumableSessionResult,
  IdentificationData,
  SaveAnswerBody,
  ApiError,
} from './client'
export { ResponseProvider, useResponseToken } from './response-context'
