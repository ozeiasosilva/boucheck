'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { responsesApi, insightsApi, type ResponseDetail, type InsightResult, AdminApiError } from '@/lib/admin/api'
import { Button } from '@/components/admin/ui/button'
import { ResponseStatusBadge } from '@/components/admin/ui/badge'
import { Card, CardHeader, CardBody } from '@/components/admin/ui/card'
import { useToast } from '@/components/admin/ui/toast'
import { InsightButton } from '@/components/admin/insight-button'
import { InsightCard } from '@/components/admin/insight-card'
import { InteractionHistorySection } from '@/components/admin/interaction-history-section'

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'medium' })
}

const EVENT_LABELS: Record<string, string> = {
  pagina_acessada: '🌐 Acessou a página',
  privacidade_aceita: '✅ Aceitou a política de privacidade',
  pergunta_respondida: '💬 Respondeu pergunta',
  concluido: '🏁 Concluiu o survey',
  relatorio_visualizado: '👁 Visualizou relatório',
  relatorio_email_solicitado: '📧 Solicitou envio por e-mail',
  relatorio_email_enviado: '📧 Relatório enviado por e-mail',
  relatorio_whatsapp_solicitado: '📱 Solicitou envio por WhatsApp',
  relatorio_whatsapp_enviado: '📱 Relatório enviado por WhatsApp',
  relatorio_envio_falhou: '⚠️ Envio falhou',
  relatorio_link_acessado: '🔗 Link do relatório acessado',
  consultor_solicitado: '🗓 Solicitou agendamento com consultor',
}

export default function ResponseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { toast } = useToast()
  const [detail, setDetail] = useState<ResponseDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [resending, setResending] = useState(false)
  const [anonymizing, setAnonymizing] = useState(false)
  const [insightLoading, setInsightLoading] = useState(false)
  const [insight, setInsight] = useState<InsightResult | null>(null)
  const [insightError, setInsightError] = useState<string | null>(null)

  useEffect(() => {
    responsesApi.get(id)
      .then(setDetail)
      .catch(() => toast('Erro ao carregar resposta.', 'error'))
      .finally(() => setLoading(false))
  }, [id, toast])

  useEffect(() => {
    if (detail && !detail.anonimizado) {
      insightsApi.getClient(detail.id).then(setInsight).catch(() => {})
    }
  }, [detail])

  async function handleGenerateInsight() {
    if (!detail) return
    setInsightLoading(true)
    setInsightError(null)
    try {
      const result = await insightsApi.generateClient(detail.id)
      setInsight(result)
    } catch (err) {
      if (err instanceof AdminApiError) {
        if (err.status === 504) {
          setInsightError('Tempo limite excedido. Tente novamente.')
        } else if (err.status === 502) {
          setInsightError('Falha na comunicação com o serviço de IA.')
        } else {
          setInsightError(err.message)
        }
      } else {
        setInsightError('Erro ao gerar insight. Tente novamente.')
      }
    } finally {
      setInsightLoading(false)
    }
  }

  async function handleResend(channel?: 'email' | 'whatsapp') {
    setResending(true)
    try {
      await responsesApi.resend(id, channel)
      toast('Reenvio agendado!', 'success')
    } catch (err) {
      toast(err instanceof AdminApiError ? err.message : 'Erro ao reenviar.', 'error')
    } finally { setResending(false) }
  }

  async function handleAnonymize() {
    if (!confirm('Anonimizar os dados pessoais deste respondente? Esta ação não pode ser desfeita.')) return
    setAnonymizing(true)
    try {
      await responsesApi.anonymize(id)
      toast('Dados anonimizados.', 'success')
      router.push('/admin/responses')
    } catch (err) {
      toast(err instanceof AdminApiError ? err.message : 'Erro ao anonimizar.', 'error')
    } finally { setAnonymizing(false) }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-gray-400">
      <svg className="h-5 w-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      Carregando...
    </div>
  )

  if (!detail) return <div className="p-8 text-gray-500">Resposta não encontrada.</div>

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
        <button onClick={() => router.back()} className="hover:text-gray-700">← Respostas</button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {detail.anonimizado ? <span className="text-gray-400 italic">Dados anonimizados</span> : detail.nome}
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <ResponseStatusBadge status={detail.status} />
            {detail.pontuacao !== null && (
              <span className="text-sm text-gray-500">Pontuação: <strong>{detail.pontuacao}</strong></span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {detail.report_failed && (
            <Button variant="secondary" size="sm" loading={resending} onClick={() => handleResend()}>
              Reenviar relatório
            </Button>
          )}
          {!detail.anonimizado && (
            <Button variant="danger" size="sm" loading={anonymizing} onClick={handleAnonymize}>
              Anonimizar (LGPD)
            </Button>
          )}
        </div>
      </div>

      {/* Respondent info */}
      {!detail.anonimizado && (
        <Card>
          <CardHeader><h2 className="font-semibold text-gray-900">Dados do respondente</h2></CardHeader>
          <CardBody>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              {[
                ['Nome', detail.nome], ['E-mail', detail.email],
                ['Empresa', detail.empresa], ['Cargo', detail.cargo],
                ['Telefone', detail.telefone], ['Cidade', detail.cidade],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-gray-500">{label}</dt>
                  <dd className="font-medium text-gray-900 mt-0.5">{value || '—'}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
      )}

      {/* Answers */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-gray-900">Respostas ({detail.answers.length})</h2>
        </CardHeader>
        <CardBody>
          {detail.answers.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhuma resposta registrada.</p>
          ) : (
            <div className="space-y-4">
              {detail.answers.map((ans, i) => {
                const timeItem = detail.time_per_question?.find((t) => t.question_id === ans.question_id)
                return (
                  <div key={i} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                    <p className="font-medium text-gray-800">{ans.question_texto}</p>
                    {ans.opcoes.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {ans.opcoes.map((o, j) => <li key={j} className="text-sm text-indigo-700">✓ {o}</li>)}
                      </ul>
                    )}
                    {ans.texto_livre && <p className="mt-1 text-sm text-gray-600 italic">"{ans.texto_livre}"</p>}
                    {timeItem && <p className="text-xs text-gray-400 mt-1">Tempo: {timeItem.seconds}s</p>}
                  </div>
                )
              })}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Insight & Interaction History (hidden when anonymized) */}
      {!detail.anonimizado && (
        <>
          <div className="space-y-4">
            <InsightButton
              onClick={handleGenerateInsight}
              loading={insightLoading}
            />
            {insightError && <p className="mt-2 text-sm text-red-600">{insightError}</p>}
            {insight && <InsightCard conteudo={insight.conteudo} createdAt={insight.created_at} />}
          </div>
          <InteractionHistorySection responseId={detail.id} />
        </>
      )}

      {/* Checklist */}
      {detail.checklist.length > 0 && (
        <Card>
          <CardHeader><h2 className="font-semibold text-gray-900">Checklist selecionado</h2></CardHeader>
          <CardBody>
            <div className="flex flex-wrap gap-2">
              {detail.checklist.map((item, i) => (
                <span key={i} className="px-2 py-1 bg-indigo-50 text-indigo-700 text-xs rounded-full">
                  {item.nome} <span className="text-indigo-400">({item.grupo.replace('_', ' ')})</span>
                </span>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Event timeline */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-gray-900">Linha do tempo de eventos</h2>
        </CardHeader>
        <CardBody>
          {detail.events.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum evento registrado.</p>
          ) : (
            <div className="relative">
              <div className="absolute left-3 top-0 bottom-0 w-px bg-gray-200" aria-hidden="true" />
              <div className="space-y-4">
                {detail.events.map((ev, i) => (
                  <div key={i} className="flex gap-4 relative pl-9">
                    <div className="absolute left-0 top-1 w-7 h-7 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center text-xs">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {EVENT_LABELS[ev.tipo] ?? ev.tipo}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{fmtDate(ev.created_at)}</p>
                      {ev.payload && Object.keys(ev.payload).length > 0 && (
                        <pre className="text-xs text-gray-500 mt-1 bg-gray-50 rounded p-2 overflow-x-auto">
                          {JSON.stringify(ev.payload, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
