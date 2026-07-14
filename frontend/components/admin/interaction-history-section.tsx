'use client'

import { useState, useEffect, useCallback } from 'react'
import { insightsApi, type InteractionEntry, type PaginatedInteractions, AdminApiError } from '@/lib/admin/api'
import { Card, CardHeader, CardBody } from '@/components/admin/ui/card'

const INTERACTION_TYPES = [
  { value: 'enviou_orcamento', label: 'Enviou orçamento' },
  { value: 'fechou_negocio', label: 'Fechou negócio' },
  { value: 'nao_respondeu_contato', label: 'Não respondeu contato' },
  { value: 'agendou_reuniao', label: 'Agendou reunião' },
  { value: 'em_negociacao', label: 'Em negociação' },
  { value: 'perdeu_para_concorrente', label: 'Perdeu para concorrente' },
  { value: 'cliente_nao_qualificado', label: 'Cliente não qualificado' },
  { value: 'retornar_futuramente', label: 'Retornar futuramente' },
] as const

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function tipoLabel(tipo: string): string {
  const found = INTERACTION_TYPES.find((t) => t.value === tipo)
  return found ? found.label : tipo
}

interface InteractionHistorySectionProps {
  responseId: string
}

export function InteractionHistorySection({ responseId }: InteractionHistorySectionProps) {
  const [entries, setEntries] = useState<InteractionEntry[]>([])
  const [meta, setMeta] = useState<PaginatedInteractions['meta'] | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [tipo, setTipo] = useState<string>(INTERACTION_TYPES[0].value)
  const [observacao, setObservacao] = useState('')

  const loadEntries = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const result = await insightsApi.getInteractions(responseId, p)
      setEntries(result.data)
      setMeta(result.meta)
      setPage(p)
    } catch {
      // silent fail on load
    } finally {
      setLoading(false)
    }
  }, [responseId])

  useEffect(() => {
    loadEntries(1)
  }, [loadEntries])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await insightsApi.createInteraction(responseId, {
        tipo,
        ...(observacao.trim() ? { observacao: observacao.trim() } : {}),
      })
      setObservacao('')
      setTipo(INTERACTION_TYPES[0].value)
      await loadEntries(1)
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Erro ao salvar registro. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-gray-900">Acompanhamento Comercial</h2>
      </CardHeader>
      <CardBody>
        {/* Add interaction form */}
        <form onSubmit={handleSubmit} className="mb-4 space-y-3">
          <div className="flex gap-3">
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="block w-48 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
              disabled={saving}
            >
              {INTERACTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Salvando...' : 'Adicionar'}
            </button>
          </div>
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Observação (opcional, máx. 500 caracteres)"
            maxLength={500}
            rows={2}
            disabled={saving}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500 disabled:opacity-50"
          />
          {observacao.length > 0 && (
            <p className="text-xs text-gray-400">{observacao.length}/500</p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>

        {/* Entries list */}
        {loading ? (
          <p className="text-sm text-gray-400">Carregando histórico...</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhuma interação registrada.</p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-800">{tipoLabel(entry.tipo)}</span>
                  <span className="text-xs text-gray-400">{fmtDate(entry.created_at)}</span>
                </div>
                {entry.observacao && (
                  <p className="mt-1 text-sm text-gray-600">{entry.observacao}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {meta && meta.lastPage > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => loadEntries(page - 1)}
              disabled={page <= 1 || loading}
              className="text-sm text-indigo-600 hover:text-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ← Anterior
            </button>
            <span className="text-xs text-gray-400">
              Página {meta.currentPage} de {meta.lastPage}
            </span>
            <button
              type="button"
              onClick={() => loadEntries(page + 1)}
              disabled={page >= meta.lastPage || loading}
              className="text-sm text-indigo-600 hover:text-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Próxima →
            </button>
          </div>
        )}
      </CardBody>
    </Card>
  )
}
