'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useResponseToken } from '@/lib/api/response-context'
import { useSurveyTheme } from '@/lib/api/survey-theme-context'
import {
  triggerCompletion,
  logEvent,
  requestReportEmail,
  requestReportWhatsapp,
  requestConsultantSchedule,
  fetchReportInfo,
  getPublicReportUrl,
  ApiResponseError,
} from '@/lib/api/client'

type ActionStatus = 'idle' | 'loading' | 'success' | 'error'

export default function ConcluidoPage() {
  const params = useParams<{ slug: string }>()
  const router = useRouter()
  const slug = params.slug
  const { token } = useResponseToken()
  const { theme: surveyTheme, mounted } = useSurveyTheme()
  const isDark = mounted && surveyTheme === 'escuro'

  const [loading, setLoading] = useState(true)
  const [completedAt, setCompletedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Action states
  const [emailStatus, setEmailStatus] = useState<ActionStatus>('idle')
  const [emailMasked, setEmailMasked] = useState<string | null>(null)
  const [whatsappStatus, setWhatsappStatus] = useState<ActionStatus>('idle')
  const [consultantStatus, setConsultantStatus] = useState<ActionStatus>('idle')
  const [consultantError, setConsultantError] = useState<string | null>(null)
  const [reportUrl, setReportUrl] = useState<string | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportNotReady, setReportNotReady] = useState(false)

  const completionTriggered = useRef(false)

  useEffect(() => {
    if (completionTriggered.current) return
    completionTriggered.current = true

    async function doCompletion() {
      if (!token) {
        router.replace(`/${slug}/identificacao`)
        return
      }

      try {
        const data = await triggerCompletion(token)
        setCompletedAt(data.completed_at)
        setLoading(false)

        // Fire pagina_acessada event after completion renders (Req 8.1, 8.2)
        logEvent(token, 'pagina_acessada', { slug, pagina: 'concluido' }).catch(() => {})

        // Try to fetch report info (may not be ready yet)
        fetchReportInfo(token)
          .then((info) => {
            if (info) {
              setReportUrl(getPublicReportUrl(info.public_token))
            }
          })
          .catch(() => {})
      } catch (err) {
        if (err instanceof ApiResponseError && err.status === 422) {
          if (err.body.error === 'invalid_answered_path') {
            setError(
              'O caminho de respostas é inválido. Algumas perguntas podem precisar ser respondidas novamente.'
            )
          } else {
            setError(err.body.message || 'Erro ao concluir a pesquisa.')
          }
        } else {
          setError('Erro ao concluir a pesquisa. Tente novamente.')
        }
        setLoading(false)
      }
    }

    doCompletion()
  }, [slug, router, token])

  // Req 13.1, 13.4 — Request report via e-mail
  async function handleEmailRequest() {
    if (!token || emailStatus === 'loading' || emailStatus === 'success') return
    setEmailStatus('loading')
    try {
      const result = await requestReportEmail(token)
      setEmailMasked(result.masked_email)
      setEmailStatus('success')
    } catch {
      setEmailStatus('error')
    }
  }

  // Req 14.1 — Request report via WhatsApp
  async function handleWhatsappRequest() {
    if (!token || whatsappStatus === 'loading' || whatsappStatus === 'success') return
    setWhatsappStatus('loading')
    try {
      await requestReportWhatsapp(token)
      setWhatsappStatus('success')
    } catch {
      setWhatsappStatus('error')
    }
  }

  // Req 15.1, 15.2, 15.3 — Request consultant scheduling
  async function handleConsultantRequest() {
    if (!token || consultantStatus === 'loading' || consultantStatus === 'success') return
    setConsultantStatus('loading')
    setConsultantError(null)
    try {
      const result = await requestConsultantSchedule(token)
      setConsultantStatus('success')
      // Open the scheduling link in a new tab (Req 15.2)
      window.open(result.link_agendamento, '_blank', 'noopener,noreferrer')
    } catch (err) {
      if (err instanceof ApiResponseError && err.body.error === 'link_agendamento_unavailable') {
        setConsultantError('O agendamento não está disponível no momento.')
      } else {
        setConsultantError('Erro ao solicitar agendamento.')
      }
      setConsultantStatus('error')
    }
  }

  // Req 8.4, 17.3 — View report
  async function handleViewReport() {
    if (!token) return
    if (reportUrl) {
      window.open(reportUrl, '_blank', 'noopener,noreferrer')
      return
    }
    // Try fetching report info if not available yet
    setReportLoading(true)
    setReportNotReady(false)
    try {
      const info = await fetchReportInfo(token)
      if (info) {
        const url = getPublicReportUrl(info.public_token)
        setReportUrl(url)
        window.open(url, '_blank', 'noopener,noreferrer')
      } else {
        setReportNotReady(true)
      }
    } catch {
      setReportNotReady(true)
    } finally {
      setReportLoading(false)
    }
  }

  function formatDate(isoDate: string): string {
    try {
      const date = new Date(isoDate)
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return isoDate
    }
  }

  if (loading) {
    return (
      <main className={`min-h-screen flex items-center justify-center p-4 ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-blue mx-auto mb-4" />
          <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>Finalizando pesquisa...</p>
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className={`min-h-screen flex items-center justify-center p-4 ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className="w-full max-w-md mx-auto text-center">
          <div className={`rounded-xl shadow-sm p-6 sm:p-8 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h1 className={`text-xl font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>Erro na validação</h1>
            <p className={`text-sm mb-6 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{error}</p>
            <button
              onClick={() => router.push(`/${slug}/perguntas`)}
              className="w-full sm:w-auto px-6 py-3 bg-brand-blue text-white font-semibold rounded-lg hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2 transition-colors"
            >
              Voltar às perguntas
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className={`min-h-screen flex items-center justify-center p-4 ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="w-full max-w-md mx-auto text-center">
        <div className={`rounded-xl shadow-sm p-6 sm:p-8 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <img src="/logo_completo.png" alt="BouCheck" className="h-10 w-auto object-contain" />
          </div>

          {/* Success icon */}
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className={`text-2xl font-bold mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Pesquisa concluída!
          </h1>
          <p className={`mb-4 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
            Obrigado por participar. Suas respostas foram registradas com sucesso.
          </p>

          {completedAt && (
            <p className="text-sm text-gray-400 mb-8">
              Concluída em: {formatDate(completedAt)}
            </p>
          )}

          {/* Report action buttons */}
          <div className={`border-t pt-6 space-y-3 ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
            <p className={`text-sm font-medium mb-4 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Deseja receber seu relatório?
            </p>

            {/* Visualizar relatório (Req 8.4, 17.3) */}
            <button
              onClick={handleViewReport}
              disabled={reportLoading}
              className={`w-full px-4 py-3 font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm ${
                isDark
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500'
              }`}
            >
              {reportLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Verificando...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Visualizar relatório
                </span>
              )}
            </button>
            {reportNotReady && (
              <p className={`text-xs ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`}>
                O relatório ainda está sendo gerado. Tente novamente em alguns instantes.
              </p>
            )}

            {/* Receber por e-mail (Req 13.1, 13.4) */}
            <button
              onClick={handleEmailRequest}
              disabled={emailStatus === 'loading' || emailStatus === 'success'}
              className="w-full px-4 py-3 bg-brand-blue text-white font-medium rounded-lg hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
            >
              {emailStatus === 'success' ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Enviado para {emailMasked}
                </span>
              ) : emailStatus === 'loading' ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Enviando...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Receber relatório por e-mail
                </span>
              )}
            </button>
            {emailStatus === 'error' && (
              <p className="text-xs text-red-500">Erro ao solicitar envio por e-mail. Tente novamente.</p>
            )}

            {/* Receber por WhatsApp (Req 14.1) */}
            <button
              onClick={handleWhatsappRequest}
              disabled={whatsappStatus === 'loading' || whatsappStatus === 'success'}
              className="w-full px-4 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
            >
              {whatsappStatus === 'success' ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Solicitação enviada
                </span>
              ) : whatsappStatus === 'loading' ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Enviando...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  Receber relatório por WhatsApp
                </span>
              )}
            </button>
            {whatsappStatus === 'error' && (
              <p className="text-xs text-red-500">Erro ao solicitar envio por WhatsApp. Tente novamente.</p>
            )}

            {/* Falar com consultor (Req 15.1, 15.2, 15.3) */}
            <button
              onClick={handleConsultantRequest}
              disabled={consultantStatus === 'loading' || consultantStatus === 'success'}
              className={`w-full px-4 py-3 font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm ${
                isDark
                  ? 'bg-brand-orange text-white hover:bg-accent-hover focus:ring-brand-orange'
                  : 'bg-brand-orange text-white hover:bg-accent-hover focus:ring-brand-orange'
              }`}
            >
              {consultantStatus === 'success' ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Agendamento aberto
                </span>
              ) : consultantStatus === 'loading' ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Carregando...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  Falar com um consultor
                </span>
              )}
            </button>
            {consultantError && (
              <p className="text-xs text-red-500">{consultantError}</p>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
