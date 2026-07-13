'use client'

import { useState, useCallback, FormEvent } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { applyPhoneMask, isPhoneComplete, isValidEmail } from '@/lib/identificacao/helpers'
import { useResponseToken } from '@/lib/api/response-context'
import { useSurveyTheme } from '@/lib/api/survey-theme-context'
import {
  submitIdentification,
  logEvent,
  ApiResponseError,
  type ResumableSessionResult,
} from '@/lib/api/client'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ResumableInfo {
  existing_token: string
  started_at: string
  answered_count: number
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function IdentificacaoPage() {
  const params = useParams<{ slug: string }>()
  const router = useRouter()
  const slug = params.slug
  const { setResponseToken } = useResponseToken()
  const { theme: surveyTheme, mounted } = useSurveyTheme()
  const isDark = mounted && surveyTheme === 'escuro'

  // Form fields
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('+55 ')
  const [empresa, setEmpresa] = useState('')
  const [email, setEmail] = useState('')
  const [cargo, setCargo] = useState('')
  const [cidade, setCidade] = useState('')
  const [politicaAceita, setPoliticaAceita] = useState(false)

  // UI state
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resumableInfo, setResumableInfo] = useState<ResumableInfo | null>(null)

  // ─── Validation ──────────────────────────────────────────────────────────

  const isFormValid =
    nome.trim() !== '' &&
    isPhoneComplete(telefone) &&
    empresa.trim() !== '' &&
    isValidEmail(email) &&
    cargo.trim() !== '' &&
    cidade.trim() !== '' &&
    politicaAceita

  // ─── Phone change handler ────────────────────────────────────────────────

  const handlePhoneChange = useCallback((value: string) => {
    setTelefone(applyPhoneMask(value))
  }, [])

  // ─── Submit logic ────────────────────────────────────────────────────────

  const submitForm = useCallback(
    async (forceNew: boolean = false) => {
      setSubmitting(true)
      setError(null)

      try {
        const result = await submitIdentification(
          slug,
          {
            nome: nome.trim(),
            telefone: telefone.trim(),
            empresa: empresa.trim(),
            email: email.trim(),
            cargo: cargo.trim(),
            cidade: cidade.trim(),
            aceite_politica: true,
            politica_versao: '2025-01-v1',
          },
          forceNew
        )

        if ('resumable' in result && result.resumable) {
          // Resumable session found — show choice UI
          const resumable = result as ResumableSessionResult
          setResumableInfo({
            existing_token: resumable.existing_token,
            started_at: resumable.started_at,
            answered_count: resumable.answered_count,
          })
          setSubmitting(false)
          return
        }

        if ('token' in result) {
          // New session created
          setResponseToken(result.token)
          // Fire pagina_acessada event after session creation (Req 8.2)
          logEvent(result.token, 'pagina_acessada', {
            slug,
            pagina: 'identificacao',
            timestamp: new Date().toISOString(),
          }).catch(() => {})
          router.push(`/${slug}/perguntas`)
          return
        }

        setError('Erro inesperado. Tente novamente.')
        setSubmitting(false)
      } catch (err) {
        if (err instanceof ApiResponseError) {
          if (err.status === 422) {
            const msg =
              err.body.errors?.map((e) => e.message).join(', ') ||
              'Dados inválidos. Verifique os campos.'
            setError(msg)
          } else {
            setError('Erro inesperado. Tente novamente.')
          }
        } else {
          setError('Erro de conexão. Verifique sua internet e tente novamente.')
        }
        setSubmitting(false)
      }
    },
    [slug, nome, telefone, empresa, email, cargo, cidade, router]
  )

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      if (!isFormValid) return
      submitForm(false)
    },
    [isFormValid, submitForm]
  )

  // ─── Resume handlers ────────────────────────────────────────────────────

  const handleResume = useCallback(() => {
    if (!resumableInfo) return
    setResponseToken(resumableInfo.existing_token)
    // Fire pagina_acessada event for resumed session
    logEvent(resumableInfo.existing_token, 'pagina_acessada', {
      slug,
      pagina: 'identificacao',
      resumed: true,
      timestamp: new Date().toISOString(),
    }).catch(() => {})
    router.push(`/${slug}/perguntas`)
  }, [resumableInfo, slug, router, setResponseToken])

  const handleNewSession = useCallback(() => {
    setResumableInfo(null)
    submitForm(true)
  }, [submitForm])

  // ─── Resumable session choice UI ────────────────────────────────────────

  if (resumableInfo) {
    const startedDate = new Date(resumableInfo.started_at).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

    return (
      <main className={`min-h-screen flex items-center justify-center p-4 ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className={`w-full max-w-md rounded-lg shadow-md p-6 space-y-6 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
          {/* Logo */}
          <div className="flex justify-center">
            <img src="/logo_completo.png" alt="BouCheck" className="h-10 w-auto object-contain" />
          </div>

          <h1 className={`text-xl font-semibold text-center ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Sessão anterior encontrada
          </h1>

          <p className={`text-sm text-center ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
            Encontramos uma sessão iniciada em{' '}
            <span className="font-medium">{startedDate}</span> com{' '}
            <span className="font-medium">{resumableInfo.answered_count}</span>{' '}
            {resumableInfo.answered_count === 1 ? 'pergunta respondida' : 'perguntas respondidas'}.
          </p>

          <div className="space-y-3">
            <button
              type="button"
              onClick={handleResume}
              className="w-full py-3 px-4 bg-brand-blue text-white font-medium rounded-md hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2 transition-colors"
            >
              Retomar sessão anterior
            </button>

            <button
              type="button"
              onClick={handleNewSession}
              className={`w-full py-3 px-4 font-medium rounded-md border focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2 transition-colors ${isDark ? 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
            >
              Iniciar nova sessão
            </button>
          </div>
        </div>
      </main>
    )
  }

  // ─── Main form ──────────────────────────────────────────────────────────

  return (
    <main className={`min-h-screen flex items-center justify-center p-4 ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className={`w-full max-w-lg rounded-lg shadow-md p-6 sm:p-8 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <img src="/logo_completo.png" alt="BouCheck" className="h-10 w-auto object-contain" />
        </div>

        <h1 className={`text-xl sm:text-2xl font-semibold mb-6 text-center ${isDark ? 'text-white' : 'text-gray-900'}`}>
          Identificação
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Nome */}
          <div>
            <label htmlFor="nome" className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
              Nome *
            </label>
            <input
              id="nome"
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue text-sm"
              placeholder="Seu nome completo"
            />
          </div>

          {/* Telefone */}
          <div>
            <label htmlFor="telefone" className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
              Telefone *
            </label>
            <input
              id="telefone"
              type="tel"
              value={telefone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue text-sm"
              placeholder="+55 (00) 00000-0000"
            />
          </div>

          {/* Empresa */}
          <div>
            <label htmlFor="empresa" className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
              Empresa *
            </label>
            <input
              id="empresa"
              type="text"
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue text-sm"
              placeholder="Nome da sua empresa"
            />
          </div>

          {/* E-mail */}
          <div>
            <label htmlFor="email" className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
              E-mail *
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue text-sm"
              placeholder="seu@email.com"
            />
            {email && !isValidEmail(email) && (
              <p className="mt-1 text-xs text-red-600">Formato de e-mail inválido</p>
            )}
          </div>

          {/* Cargo */}
          <div>
            <label htmlFor="cargo" className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
              Cargo *
            </label>
            <input
              id="cargo"
              type="text"
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue text-sm"
              placeholder="Seu cargo"
            />
          </div>

          {/* Cidade */}
          <div>
            <label htmlFor="cidade" className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
              Cidade *
            </label>
            <input
              id="cidade"
              type="text"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue text-sm"
              placeholder="Sua cidade"
            />
          </div>

          {/* Privacy policy checkbox */}
          <div className="flex items-start gap-2 pt-2">
            <input
              id="politica"
              type="checkbox"
              checked={politicaAceita}
              onChange={(e) => setPoliticaAceita(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue"
            />
            <label htmlFor="politica" className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
              Li e aceito a{' '}
              <a
                href="/politica-de-privacidade"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-blue underline hover:text-primary-hover"
              >
                Política de Privacidade
              </a>
            </label>
          </div>

          {/* Error message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={!isFormValid || submitting}
            className="w-full py-3 px-4 bg-brand-blue text-white font-medium rounded-md hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Enviando...' : 'Continuar'}
          </button>
        </form>
      </div>
    </main>
  )
}
