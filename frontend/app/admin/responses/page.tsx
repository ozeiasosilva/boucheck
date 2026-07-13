'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { responsesApi, surveysApi, type ResponseSession, type Survey, type ResponseFilters, AdminApiError } from '@/lib/admin/api'
import { Button } from '@/components/admin/ui/button'
import { Input, Select } from '@/components/admin/ui/input'
import { ResponseStatusBadge } from '@/components/admin/ui/badge'
import { useToast } from '@/components/admin/ui/toast'

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}
function fmtSeconds(s: number | null) {
  if (!s) return '—'
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

export default function ResponsesPage() {
  const { toast } = useToast()
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [rows, setRows] = useState<ResponseSession[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  const [filters, setFilters] = useState<ResponseFilters>({ page: 1, per_page: 20 })
  const [tmpFilters, setTmpFilters] = useState<ResponseFilters>({ page: 1, per_page: 20 })

  useEffect(() => {
    surveysApi.list().then(setSurveys).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await responsesApi.list(filters)
      setRows(result.data)
      setTotal(result.meta.total)
    } catch {
      toast('Erro ao carregar respostas.', 'error')
    } finally { setLoading(false) }
  }, [filters, toast])

  useEffect(() => { load() }, [load])

  function applyFilters() {
    setFilters({ ...tmpFilters, page: 1 })
  }

  function clearFilters() {
    const reset: ResponseFilters = { page: 1, per_page: 20 }
    setTmpFilters(reset)
    setFilters(reset)
  }

  async function handleExport() {
    setExporting(true)
    try {
      const blob = await responsesApi.exportCsv(filters)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `respostas-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch { toast('Erro ao exportar CSV.', 'error') }
    finally { setExporting(false) }
  }

  const totalPages = Math.ceil(total / (filters.per_page ?? 20))

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Respostas</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total.toLocaleString('pt-BR')} resposta(s)</p>
        </div>
        <Button variant="secondary" onClick={handleExport} loading={exporting}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          Exportar CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <Select label="Survey" value={tmpFilters.survey_id ?? ''} onChange={(e) => setTmpFilters((f) => ({ ...f, survey_id: e.target.value ? Number(e.target.value) : undefined }))}>
            <option value="">Todos os surveys</option>
            {surveys.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </Select>
          <Select label="Status" value={tmpFilters.status ?? ''} onChange={(e) => setTmpFilters((f) => ({ ...f, status: e.target.value as ResponseFilters['status'] || undefined }))}>
            <option value="">Todos</option>
            <option value="iniciado">Iniciado</option>
            <option value="completo">Completo</option>
          </Select>
          <Input label="Nome" value={tmpFilters.nome ?? ''} onChange={(e) => setTmpFilters((f) => ({ ...f, nome: e.target.value || undefined }))} placeholder="Buscar por nome..." />
          <Input label="Empresa" value={tmpFilters.empresa ?? ''} onChange={(e) => setTmpFilters((f) => ({ ...f, empresa: e.target.value || undefined }))} placeholder="Buscar por empresa..." />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data início</label>
            <input type="date" value={tmpFilters.start_date ?? ''} onChange={(e) => setTmpFilters((f) => ({ ...f, start_date: e.target.value || undefined }))} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data fim</label>
            <input type="date" value={tmpFilters.end_date ?? ''} onChange={(e) => setTmpFilters((f) => ({ ...f, end_date: e.target.value || undefined }))} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <Select label="Ação de relatório" value={tmpFilters.report_action ?? ''} onChange={(e) => setTmpFilters((f) => ({ ...f, report_action: e.target.value || undefined }))}>
            <option value="">Qualquer</option>
            <option value="visualized">Visualizou relatório</option>
            <option value="email_sent">Recebeu por e-mail</option>
            <option value="whatsapp_sent">Recebeu por WhatsApp</option>
            <option value="consultant">Solicitou consultor</option>
            <option value="failed">Envio falhou</option>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button onClick={applyFilters} size="sm">Filtrar</Button>
          <Button variant="ghost" size="sm" onClick={clearFilters}>Limpar</Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <svg className="h-5 w-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
            Carregando...
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 text-gray-400">Nenhuma resposta encontrada.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Nome', 'Empresa', 'E-mail', 'Survey', 'Status', 'Início', 'Duração', 'Relatório', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                      {r.anonimizado ? <span className="text-gray-400 italic">Anonimizado</span> : r.nome}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.anonimizado ? '—' : r.empresa}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{r.anonimizado ? '—' : r.email}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.survey?.nome ?? '—'}</td>
                    <td className="px-4 py-3"><ResponseStatusBadge status={r.status} /></td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(r.started_at)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtSeconds(r.fill_time_seconds)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {r.report_visualized && <span title="Visualizou">👁</span>}
                        {r.report_email_sent && <span title="E-mail enviado">📧</span>}
                        {r.report_whatsapp_sent && <span title="WhatsApp enviado">📱</span>}
                        {r.consultant_requested && <span title="Consultor solicitado">🗓</span>}
                        {r.report_failed && <span title="Envio falhou" className="text-red-500">⚠</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/responses/${r.id}`}>
                        <Button variant="ghost" size="sm">Ver</Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
          <span>Página {filters.page} de {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={filters.page === 1} onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}>Anterior</Button>
            <Button variant="secondary" size="sm" disabled={filters.page === totalPages} onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}>Próxima</Button>
          </div>
        </div>
      )}
    </div>
  )
}
