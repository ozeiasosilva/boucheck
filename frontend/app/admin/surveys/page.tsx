'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { surveysApi, type Survey, AdminApiError } from '@/lib/admin/api'
import { Button } from '@/components/admin/ui/button'
import { SurveyStatusBadge } from '@/components/admin/ui/badge'
import { useToast } from '@/components/admin/ui/toast'
import { Modal } from '@/components/admin/ui/modal'
import { Input } from '@/components/admin/ui/input'

export default function SurveysPage() {
  const { toast } = useToast()
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [loading, setLoading] = useState(true)

  // Duplicate modal
  const [duplicateTarget, setDuplicateTarget] = useState<Survey | null>(null)
  const [dupSlug, setDupSlug] = useState('')
  const [dupLoading, setDupLoading] = useState(false)

  useEffect(() => {
    surveysApi.list()
      .then(setSurveys)
      .catch(() => toast('Erro ao carregar surveys.', 'error'))
      .finally(() => setLoading(false))
  }, [toast])

  async function handleSetStatus(survey: Survey, status: Survey['status']) {
    try {
      const updated = await surveysApi.setStatus(survey.id, status)
      setSurveys((prev) => prev.map((s) => (s.id === survey.id ? updated : s)))
      toast(`Survey "${survey.nome}" atualizado para "${status}".`, 'success')
    } catch (err) {
      const msg = err instanceof AdminApiError ? err.message : 'Erro ao atualizar status.'
      toast(msg, 'error')
    }
  }

  async function handleArchive(survey: Survey) {
    if (!confirm(`Arquivar "${survey.nome}"? Nenhum dado de resposta será perdido.`)) return
    try {
      const updated = await surveysApi.archive(survey.id)
      setSurveys((prev) => prev.map((s) => (s.id === survey.id ? updated : s)))
      toast('Survey arquivado.', 'success')
    } catch {
      toast('Erro ao arquivar survey.', 'error')
    }
  }

  async function handleDuplicate() {
    if (!duplicateTarget || !dupSlug.trim()) return
    setDupLoading(true)
    try {
      const created = await surveysApi.duplicate(duplicateTarget.id, dupSlug.trim())
      setSurveys((prev) => [...prev, created])
      toast('Survey duplicado com sucesso!', 'success')
      setDuplicateTarget(null)
      setDupSlug('')
    } catch (err) {
      const msg = err instanceof AdminApiError ? err.message : 'Erro ao duplicar.'
      toast(msg, 'error')
    } finally {
      setDupLoading(false)
    }
  }

  const statusGroups = {
    ativo: surveys.filter((s) => s.status === 'ativo'),
    rascunho: surveys.filter((s) => s.status === 'rascunho'),
    inativo: surveys.filter((s) => s.status === 'inativo'),
    arquivado: surveys.filter((s) => s.status === 'arquivado'),
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Surveys</h1>
          <p className="text-sm text-gray-500 mt-0.5">{surveys.length} survey{surveys.length !== 1 ? 's' : ''}</p>
        </div>
        <Link href="/admin/surveys/new">
          <Button>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Novo survey
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <svg className="h-5 w-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Carregando...
        </div>
      ) : surveys.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-500 mb-4">Nenhum survey criado ainda.</p>
          <Link href="/admin/surveys/new">
            <Button>Criar primeiro survey</Button>
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Nome</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Slug</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Versão</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {surveys.map((survey) => (
                <tr key={survey.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <Link href={`/admin/surveys/${survey.id}`} className="font-medium text-gray-900 hover:text-indigo-600">
                      {survey.nome}
                    </Link>
                    {survey.categoria && (
                      <p className="text-xs text-gray-400 mt-0.5">{survey.categoria.nome}</p>
                    )}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500 font-mono">{survey.slug}</td>
                  <td className="px-4 py-4">
                    <SurveyStatusBadge status={survey.status} />
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500">v{survey.version}</td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/admin/surveys/${survey.id}`}>
                        <Button variant="ghost" size="sm">Editar</Button>
                      </Link>

                      {survey.status === 'rascunho' && (
                        <Button variant="ghost" size="sm" onClick={() => handleSetStatus(survey, 'ativo')}>
                          Ativar
                        </Button>
                      )}
                      {survey.status === 'ativo' && (
                        <Button variant="ghost" size="sm" onClick={() => handleSetStatus(survey, 'inativo')}>
                          Desativar
                        </Button>
                      )}
                      {survey.status === 'inativo' && (
                        <Button variant="ghost" size="sm" onClick={() => handleSetStatus(survey, 'ativo')}>
                          Reativar
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDuplicateTarget(survey)
                          setDupSlug(`${survey.slug}-copia`)
                        }}
                      >
                        Duplicar
                      </Button>

                      {survey.status !== 'arquivado' && (
                        <Button variant="ghost" size="sm" onClick={() => handleArchive(survey)}>
                          Arquivar
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Duplicate modal */}
      <Modal
        open={!!duplicateTarget}
        onClose={() => { setDuplicateTarget(null); setDupSlug('') }}
        title={`Duplicar "${duplicateTarget?.nome}"`}
      >
        <div className="space-y-4">
          <Input
            label="Slug para o novo survey"
            value={dupSlug}
            onChange={(e) => setDupSlug(e.target.value)}
            placeholder="meu-survey-copia"
            hint="Apenas minúsculas, números e hífens."
            required
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setDuplicateTarget(null); setDupSlug('') }}>
              Cancelar
            </Button>
            <Button onClick={handleDuplicate} loading={dupLoading} disabled={!dupSlug.trim()}>
              Duplicar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
