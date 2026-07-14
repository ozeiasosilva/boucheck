'use client'

import { useState, useEffect, useCallback } from 'react'
import { dashboardApi, surveysApi, insightsApi, type DashboardData, type Survey, type InsightResult, AdminApiError } from '@/lib/admin/api'
import { StatCard, Card, CardHeader, CardBody } from '@/components/admin/ui/card'
import { Select } from '@/components/admin/ui/input'
import { Button } from '@/components/admin/ui/button'
import { InsightButton } from '@/components/admin/insight-button'
import { InsightCard } from '@/components/admin/insight-card'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
function daysAgoISO(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function fmtSeconds(s: number | null): string {
  if (s === null || s === undefined) return '—'
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

export default function DashboardPage() {
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [surveyId, setSurveyId] = useState<string>('all')
  const [periodStart, setPeriodStart] = useState(daysAgoISO(30))
  const [periodEnd, setPeriodEnd] = useState(todayISO())
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [insightLoading, setInsightLoading] = useState(false)
  const [insight, setInsight] = useState<InsightResult | null>(null)
  const [insightError, setInsightError] = useState('')

  useEffect(() => {
    surveysApi.list().then(setSurveys).catch(() => {})
  }, [])

  useEffect(() => {
    if (surveyId === 'all') {
      setInsight(null)
      setInsightError('')
      return
    }
    insightsApi.getSurvey(Number(surveyId))
      .then((result) => setInsight(result))
      .catch(() => setInsight(null))
  }, [surveyId])

  const handleGenerateInsight = async () => {
    setInsightLoading(true)
    setInsightError('')
    try {
      const result = await insightsApi.generateSurvey(Number(surveyId))
      setInsight(result)
    } catch (err) {
      if (err instanceof AdminApiError) {
        if (err.status === 504) {
          setInsightError('Tempo limite excedido. O agente de IA não respondeu a tempo. Tente novamente.')
        } else if (err.status === 502) {
          setInsightError('Erro de comunicação com o agente de IA. Tente novamente.')
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

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await dashboardApi.get(surveyId, periodStart, periodEnd)
      setData(result)
    } catch (err) {
      if (err instanceof AdminApiError) {
        setError(err.message)
      } else {
        setError('Erro ao carregar dashboard.')
      }
    } finally {
      setLoading(false)
    }
  }, [surveyId, periodStart, periodEnd])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Indicadores de preenchimento e conversão</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-8 p-4 bg-white rounded-xl border border-gray-200">
        <div className="min-w-[200px] flex-1">
          <Select
            label="Survey"
            value={surveyId}
            onChange={(e) => setSurveyId(e.target.value)}
          >
            <option value="all">Todos os surveys</option>
            {surveys.map((s) => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </Select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">De</label>
          <input
            type="date"
            value={periodStart}
            max={periodEnd}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="block rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Até</label>
          <input
            type="date"
            value={periodEnd}
            min={periodStart}
            max={todayISO()}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="block rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex items-end">
          <Button onClick={loadDashboard} loading={loading} variant="secondary">
            Atualizar
          </Button>
        </div>
      </div>

      {surveyId !== 'all' && (
        <div className="mb-6">
          <InsightButton
            onClick={handleGenerateInsight}
            loading={insightLoading}
            disabled={data?.totals.completed === 0}
          />
          {insightError && (
            <p className="mt-2 text-sm text-red-600">{insightError}</p>
          )}
          {insight && <InsightCard conteudo={insight.conteudo} createdAt={insight.created_at} />}
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <svg className="h-6 w-6 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Carregando...
        </div>
      )}

      {data && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard
              label="Acessos à página"
              value={data.totals.page_views.toLocaleString('pt-BR')}
              color="text-blue-600"
              icon={<EyeIcon />}
            />
            <StatCard
              label="Iniciados"
              value={data.totals.started.toLocaleString('pt-BR')}
              color="text-yellow-600"
              icon={<PlayIcon />}
            />
            <StatCard
              label="Completos"
              value={data.totals.completed.toLocaleString('pt-BR')}
              color="text-green-600"
              icon={<CheckIcon />}
            />
            <StatCard
              label="Taxa de conclusão"
              value={fmtPct(data.totals.completion_rate)}
              sub={data.totals.avg_fill_seconds !== null ? `Tempo médio: ${fmtSeconds(data.totals.avg_fill_seconds)}` : undefined}
              color="text-indigo-600"
              icon={<ChartIcon />}
            />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard label="Relatório visualizado" value={data.totals.report_visualized} color="text-purple-600" icon={<DocIcon />} />
            <StatCard label="Enviado por e-mail" value={data.totals.email_sent} color="text-blue-600" icon={<MailIcon />} />
            <StatCard label="Enviado por WhatsApp" value={data.totals.whatsapp_sent} color="text-green-600" icon={<PhoneIcon />} />
            <StatCard label="Solicitaram consultor" value={data.totals.consultant_requested} color="text-orange-600" icon={<UserIcon />} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Funnel */}
            <Card>
              <CardHeader>
                <h2 className="font-semibold text-gray-900">Funil de conversão</h2>
              </CardHeader>
              <CardBody>
                {data.funnel.length === 0 ? (
                  <p className="text-sm text-gray-400">Nenhum dado no período.</p>
                ) : (
                  <div className="space-y-3">
                    {data.funnel.map((step, i) => {
                      const max = data.funnel[0]?.count || 1
                      const pct = Math.round((step.count / max) * 100)
                      return (
                        <div key={i}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-600">{step.step}</span>
                            <span className="font-medium text-gray-900">{step.count.toLocaleString('pt-BR')}</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardBody>
            </Card>

            {/* Daily series */}
            <Card>
              <CardHeader>
                <h2 className="font-semibold text-gray-900">Respostas por dia</h2>
              </CardHeader>
              <CardBody>
                {data.daily_series.length === 0 ? (
                  <p className="text-sm text-gray-400">Nenhum dado no período.</p>
                ) : (
                  <DailyChart series={data.daily_series} />
                )}
              </CardBody>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Dropout question */}
            <Card>
              <CardHeader>
                <h2 className="font-semibold text-gray-900">Pergunta com maior abandono</h2>
              </CardHeader>
              <CardBody>
                {data.top_dropout_question ? (
                  <div>
                    <p className="text-gray-700 font-medium">{data.top_dropout_question.texto}</p>
                    <p className="text-sm text-gray-400 mt-1">
                      {data.top_dropout_question.count} abandonos nesta pergunta
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Nenhum abandono registrado.</p>
                )}
              </CardBody>
            </Card>

            {/* Top checklist */}
            <Card>
              <CardHeader>
                <h2 className="font-semibold text-gray-900">Top itens do checklist</h2>
              </CardHeader>
              <CardBody>
                {data.top_checklist.length === 0 ? (
                  <p className="text-sm text-gray-400">Nenhum dado.</p>
                ) : (
                  <div className="space-y-2">
                    {data.top_checklist.slice(0, 8).map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 truncate flex-1">{item.nome}</span>
                        <span className="ml-3 text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                          {item.grupo.replace('_', ' ')}
                        </span>
                        <span className="ml-2 font-semibold text-gray-900">{item.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          </div>

          {/* Answer distribution */}
          {data.answer_distribution.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="font-semibold text-gray-900">Distribuição de respostas por pergunta</h2>
              </CardHeader>
              <CardBody>
                <div className="space-y-6">
                  {data.answer_distribution.map((q) => {
                    const max = Math.max(...q.options.map((o) => o.count), 1)
                    return (
                      <div key={q.question_id}>
                        <p className="text-sm font-medium text-gray-800 mb-3">{q.texto}</p>
                        <div className="space-y-2">
                          {q.options.map((opt, i) => (
                            <div key={i}>
                              <div className="flex justify-between text-xs mb-0.5">
                                <span className="text-gray-600">{opt.texto}</span>
                                <span className="font-medium">{opt.count}</span>
                              </div>
                              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-indigo-400 rounded-full"
                                  style={{ width: `${Math.round((opt.count / max) * 100)}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

// ─── Mini daily chart ─────────────────────────────────────────────────────────

function DailyChart({ series }: { series: Array<{ date: string; count: number }> }) {
  const max = Math.max(...series.map((s) => s.count), 1)
  const last14 = series.slice(-14)

  return (
    <div className="flex items-end gap-1 h-32">
      {last14.map((s, i) => {
        const h = Math.max(4, Math.round((s.count / max) * 100))
        const label = new Date(s.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
        return (
          <div key={i} className="flex flex-col items-center flex-1 gap-1" title={`${label}: ${s.count}`}>
            <span className="text-xs text-gray-500">{s.count > 0 ? s.count : ''}</span>
            <div
              className="w-full bg-indigo-500 rounded-t"
              style={{ height: `${h}%` }}
            />
            <span className="text-[10px] text-gray-400 leading-none">{label}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const iconCls = 'h-5 w-5'
const EyeIcon = () => <svg className={iconCls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
const PlayIcon = () => <svg className={iconCls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
const CheckIcon = () => <svg className={iconCls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
const ChartIcon = () => <svg className={iconCls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
const DocIcon = () => <svg className={iconCls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
const MailIcon = () => <svg className={iconCls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
const PhoneIcon = () => <svg className={iconCls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
const UserIcon = () => <svg className={iconCls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
