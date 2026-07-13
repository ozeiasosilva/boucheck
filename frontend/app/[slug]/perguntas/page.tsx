'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { NavigationEngine } from '@/lib/navigation/engine'
import { calculateProgress } from '@/lib/navigation/progress'
import { getInvalidatedQuestions } from '@/lib/navigation/path_calculator'
import type { SurveyStructure, Question, Answer } from '@/lib/navigation/types'
import { useResponseToken } from '@/lib/api/response-context'
import { useSurveyTheme } from '@/lib/api/survey-theme-context'
import { fetchSurveyStructure, saveAnswer as saveAnswerApi, logEvent } from '@/lib/api/client'

export default function PerguntasPage() {
  const params = useParams<{ slug: string }>()
  const router = useRouter()
  const slug = params.slug
  const { token } = useResponseToken()
  const { theme: surveyTheme, mounted } = useSurveyTheme()

  const [engine] = useState(() => new NavigationEngine())
  const [structure, setStructure] = useState<SurveyStructure | null>(null)
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [answers, setAnswers] = useState<Map<number, Answer>>(new Map())
  const [answeredPath, setAnsweredPath] = useState<number[]>([])
  const [progress, setProgress] = useState(0)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Local draft state for the current question (before saving)
  const [selectedOptions, setSelectedOptions] = useState<number[]>([])
  const [textoLivre, setTextoLivre] = useState('')

  // Fetch survey structure on mount
  useEffect(() => {
    async function loadStructure() {
      if (!token) {
        router.replace(`/${slug}/identificacao`)
        return
      }

      try {
        const data = await fetchSurveyStructure(slug)
        engine.init(data)
        setStructure(data)

        // Cache structure in sessionStorage for checklist page
        sessionStorage.setItem('survey_structure', JSON.stringify(data))

        // Start at first question (by ordem)
        const questions = [...data.questions].sort((a, b) => a.ordem - b.ordem)
        if (questions.length > 0) {
          const first = questions[0]
          setCurrentQuestion(first)
          setAnsweredPath([first.id])
          setProgress(0)
        }

        setLoading(false)

        // Fire pagina_acessada event for the questions page (Req 8.1, 8.2)
        logEvent(token, 'pagina_acessada', {
          slug,
          pagina: 'perguntas',
          timestamp: new Date().toISOString(),
        }).catch(() => {})
      } catch {
        setError('Erro ao carregar a estrutura da pesquisa.')
        setLoading(false)
      }
    }

    loadStructure()
  }, [slug, engine, token, router])

  // Sync local draft state when current question changes
  useEffect(() => {
    if (!currentQuestion) return
    const existingAnswer = answers.get(currentQuestion.id)
    if (existingAnswer) {
      setSelectedOptions(existingAnswer.selectedOptionIds)
      setTextoLivre(existingAnswer.textoLivre ?? '')
    } else {
      setSelectedOptions([])
      setTextoLivre('')
    }
    setValidationError(null)
  }, [currentQuestion, answers])

  // Update progress whenever answered path or answers change
  useEffect(() => {
    if (!structure || !currentQuestion) return
    const p = calculateProgress(answeredPath, currentQuestion.id, structure, answers)
    setProgress(p)
  }, [answeredPath, currentQuestion, structure, answers])

  // Auto-save answer via PUT
  const saveAnswer = useCallback(
    async (questionId: number, answer: Answer, invalidatedIds: number[] = []) => {
      if (!token) return
      setSaving(true)
      try {
        const body: Record<string, unknown> = {
          invalidated_question_ids: invalidatedIds,
        }
        if (answer.textoLivre !== null) {
          body.texto_livre = answer.textoLivre
        } else {
          body.question_option_ids = answer.selectedOptionIds
        }

        await saveAnswerApi(token, questionId, {
          ...(answer.textoLivre !== null
            ? { texto_livre: answer.textoLivre }
            : { question_option_ids: answer.selectedOptionIds }),
          invalidated_question_ids: invalidatedIds,
        })
      } catch {
        // Silent fail on save — mobile connections may drop
      } finally {
        setSaving(false)
      }
    },
    [token]
  )

  // Build current answer from local draft
  function buildCurrentAnswer(): Answer {
    if (!currentQuestion) {
      return { questionId: 0, selectedOptionIds: [], textoLivre: null }
    }
    if (currentQuestion.tipo === 'aberta') {
      return { questionId: currentQuestion.id, selectedOptionIds: [], textoLivre: textoLivre }
    }
    return { questionId: currentQuestion.id, selectedOptionIds: selectedOptions, textoLivre: null }
  }

  // Validate required question
  function validateRequired(): boolean {
    if (!currentQuestion || !currentQuestion.obrigatoria) return true
    if (currentQuestion.tipo === 'aberta') {
      if (!textoLivre.trim()) {
        setValidationError('Esta pergunta é obrigatória. Por favor, forneça uma resposta.')
        return false
      }
    } else {
      if (selectedOptions.length === 0) {
        setValidationError('Esta pergunta é obrigatória. Por favor, selecione uma opção.')
        return false
      }
    }
    return true
  }

  // Advance to next question
  async function handleNext() {
    if (!currentQuestion || !structure) return
    if (!validateRequired()) return

    const answer = buildCurrentAnswer()
    const newAnswers = new Map(answers)
    newAnswers.set(currentQuestion.id, answer)
    setAnswers(newAnswers)

    // Detect if this is a back-nav answer change (answer already existed)
    const existingAnswer = answers.get(currentQuestion.id)
    let invalidatedIds: number[] = []
    if (existingAnswer) {
      invalidatedIds = getInvalidatedQuestions(
        currentQuestion.id,
        answer,
        answeredPath,
        structure
      )
      // Remove invalidated from answeredPath and answers
      if (invalidatedIds.length > 0) {
        const pathSet = new Set(invalidatedIds)
        const cleanPath = answeredPath.filter((id) => !pathSet.has(id))
        setAnsweredPath(cleanPath)
        for (const id of invalidatedIds) {
          newAnswers.delete(id)
        }
        setAnswers(new Map(newAnswers))
      }
    }

    // Auto-save
    await saveAnswer(currentQuestion.id, answer, invalidatedIds)

    // Get next question
    const nextId = engine.getNextQuestion(currentQuestion.id, newAnswers)

    if (nextId === null) {
      // End of path — navigate to checklist or concluido
      if (structure.has_checklist) {
        router.push(`/${slug}/checklist`)
      } else {
        router.push(`/${slug}/concluido`)
      }
      return
    }

    // Navigate to next question
    const questions = engine.getQuestions()
    const nextQ = questions.find((q) => q.id === nextId)
    if (nextQ) {
      setCurrentQuestion(nextQ)
      // Update answered path
      const currentIdx = answeredPath.indexOf(currentQuestion.id)
      const newPath = [...answeredPath.slice(0, currentIdx + 1), nextId]
      setAnsweredPath(newPath)
    }
  }

  // Skip optional question
  async function handleSkip() {
    if (!currentQuestion || !structure) return

    // Get next question without saving an answer
    const nextId = engine.getNextQuestion(currentQuestion.id, answers)

    if (nextId === null) {
      if (structure.has_checklist) {
        router.push(`/${slug}/checklist`)
      } else {
        router.push(`/${slug}/concluido`)
      }
      return
    }

    const questions = engine.getQuestions()
    const nextQ = questions.find((q) => q.id === nextId)
    if (nextQ) {
      setCurrentQuestion(nextQ)
      const currentIdx = answeredPath.indexOf(currentQuestion.id)
      const newPath = [...answeredPath.slice(0, currentIdx + 1), nextId]
      setAnsweredPath(newPath)
    }
  }

  // Back navigation
  function handleBack() {
    if (!currentQuestion) return
    const prevId = engine.getPreviousQuestion(currentQuestion.id, answeredPath)
    if (prevId === null) return

    const questions = engine.getQuestions()
    const prevQ = questions.find((q) => q.id === prevId)
    if (prevQ) {
      setCurrentQuestion(prevQ)
    }
  }

  // Handle single-select
  function handleSingleSelect(optionId: number) {
    setSelectedOptions([optionId])
    setValidationError(null)
  }

  // Handle multi-select
  function handleMultiSelect(optionId: number) {
    setSelectedOptions((prev) =>
      prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId]
    )
    setValidationError(null)
  }

  // Handle text change
  function handleTextChange(value: string) {
    if (value.length <= 2000) {
      setTextoLivre(value)
      setValidationError(null)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-blue mx-auto mb-4" />
          <p className="text-gray-600">Carregando perguntas...</p>
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <p className="text-red-600 text-lg">{error}</p>
        </div>
      </main>
    )
  }

  if (!currentQuestion || !structure) {
    return null
  }

  const canGoBack = engine.getPreviousQuestion(currentQuestion.id, answeredPath) !== null
  const isOptional = !currentQuestion.obrigatoria
  const isDark = mounted && surveyTheme === 'escuro'

  return (
    <main className={`min-h-screen flex flex-col ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Logo header */}
      <div className={`w-full border-b px-4 py-3 flex justify-center ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <img src="/logo_completo.png" alt="BouCheck" className="h-8 w-auto object-contain" />
      </div>

      {/* Progress bar */}
      <div className={`w-full h-2 ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
        <div
          className="bg-brand-orange h-2 transition-all duration-300 ease-in-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-start sm:items-center justify-center p-4 sm:p-8">
        <div className={`w-full max-w-2xl rounded-xl shadow-sm p-6 sm:p-8 my-4 sm:my-0 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
          {/* Question text */}
          <h1 className={`text-lg sm:text-xl font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {currentQuestion.texto}
          </h1>

          {currentQuestion.descricao && (
            <p className={`text-sm mb-6 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{currentQuestion.descricao}</p>
          )}

          {/* Question rendering by type */}
          <div className="mt-4 space-y-3">
            {currentQuestion.tipo === 'escolha_unica' && (
              <div className="space-y-2" role="radiogroup" aria-label={currentQuestion.texto}>
                {[...currentQuestion.options]
                  .sort((a, b) => a.ordem - b.ordem)
                  .map((option) => (
                    <label
                      key={option.id}
                      className={`flex items-center gap-3 p-3 sm:p-4 rounded-lg border cursor-pointer transition-colors ${
                        selectedOptions.includes(option.id)
                          ? 'border-brand-blue bg-primary-light'
                          : isDark
                            ? 'border-gray-600 hover:border-gray-500 hover:bg-gray-700'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`question-${currentQuestion.id}`}
                        value={option.id}
                        checked={selectedOptions.includes(option.id)}
                        onChange={() => handleSingleSelect(option.id)}
                        className="w-4 h-4 text-brand-blue shrink-0"
                      />
                      <span className={`text-sm sm:text-base ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{option.texto}</span>
                    </label>
                  ))}
              </div>
            )}

            {currentQuestion.tipo === 'multipla_escolha' && (
              <div className="space-y-2" role="group" aria-label={currentQuestion.texto}>
                {[...currentQuestion.options]
                  .sort((a, b) => a.ordem - b.ordem)
                  .map((option) => (
                    <label
                      key={option.id}
                      className={`flex items-center gap-3 p-3 sm:p-4 rounded-lg border cursor-pointer transition-colors ${
                        selectedOptions.includes(option.id)
                          ? 'border-brand-blue bg-primary-light'
                          : isDark
                            ? 'border-gray-600 hover:border-gray-500 hover:bg-gray-700'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        value={option.id}
                        checked={selectedOptions.includes(option.id)}
                        onChange={() => handleMultiSelect(option.id)}
                        className="w-4 h-4 text-brand-blue rounded shrink-0"
                      />
                      <span className={`text-sm sm:text-base ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{option.texto}</span>
                    </label>
                  ))}
              </div>
            )}

            {currentQuestion.tipo === 'aberta' && (
              <div>
                <textarea
                  value={textoLivre}
                  onChange={(e) => handleTextChange(e.target.value)}
                  maxLength={2000}
                  rows={5}
                  placeholder="Digite sua resposta aqui..."
                  className={`w-full p-3 sm:p-4 border rounded-lg text-sm sm:text-base resize-y focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400' : 'border-gray-200 text-gray-700'}`}
                  aria-label={currentQuestion.texto}
                />
                <div className="flex justify-end mt-1">
                  <span
                    className={`text-xs ${
                      textoLivre.length >= 1900 ? 'text-orange-500' : 'text-gray-400'
                    }`}
                  >
                    {textoLivre.length}/2000
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Validation error */}
          {validationError && (
            <p className="mt-4 text-sm text-red-600" role="alert">
              {validationError}
            </p>
          )}

          {/* Action buttons */}
          <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:justify-between">
            <div>
              {canGoBack && (
                <button
                  type="button"
                  onClick={handleBack}
                  className={`w-full sm:w-auto px-6 py-2.5 text-sm font-medium rounded-lg border transition-colors ${isDark ? 'text-gray-200 bg-gray-700 border-gray-600 hover:bg-gray-600' : 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50'}`}
                >
                  Voltar
                </button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              {isOptional && (
                <button
                  type="button"
                  onClick={handleSkip}
                  className={`w-full sm:w-auto px-6 py-2.5 text-sm font-medium rounded-lg border transition-colors ${isDark ? 'text-gray-300 bg-gray-700 border-gray-600 hover:bg-gray-600' : 'text-gray-500 bg-white border-gray-200 hover:bg-gray-50'}`}
                >
                  Pular
                </button>
              )}

              <button
                type="button"
                onClick={handleNext}
                disabled={saving}
                className="w-full sm:w-auto px-6 py-2.5 text-sm font-medium text-white bg-brand-blue rounded-lg hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Salvando...' : 'Próxima'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
