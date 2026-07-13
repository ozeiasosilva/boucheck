'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useResponseToken } from '@/lib/api/response-context'
import { useSurveyTheme } from '@/lib/api/survey-theme-context'
import { fetchSurveyStructure, submitChecklist, logEvent } from '@/lib/api/client'

interface ChecklistItem {
  id: number
  nome: string
  grupo: 'servico_cloud' | 'fabricante' | 'solucao'
}

interface GroupConfig {
  key: 'servico_cloud' | 'fabricante' | 'solucao'
  label: string
}

const GROUPS: GroupConfig[] = [
  { key: 'servico_cloud', label: 'Serviços Cloud' },
  { key: 'fabricante', label: 'Fabricantes' },
  { key: 'solucao', label: 'Soluções' },
]

export default function ChecklistPage() {
  const params = useParams<{ slug: string }>()
  const router = useRouter()
  const slug = params.slug
  const { token } = useResponseToken()
  const { theme: surveyTheme, mounted } = useSurveyTheme()
  const isDark = mounted && surveyTheme === 'escuro'

  const [items, setItems] = useState<ChecklistItem[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({
    servico_cloud: '',
    fabricante: '',
    solucao: '',
  })
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadChecklist() {
      if (!token) {
        router.replace(`/${slug}/identificacao`)
        return
      }

      // Try to get structure from sessionStorage first
      const cachedStructure = sessionStorage.getItem('survey_structure')
      let checklistItems: ChecklistItem[] = []

      if (cachedStructure) {
        try {
          const structure = JSON.parse(cachedStructure)
          if (!structure.has_checklist || !structure.checklist_items?.length) {
            router.replace(`/${slug}/concluido`)
            return
          }
          checklistItems = structure.checklist_items
        } catch {
          // Re-fetch if parsing fails
        }
      }

      // If no cached items, re-fetch
      if (checklistItems.length === 0) {
        try {
          const structure = await fetchSurveyStructure(slug)
          if (!structure.has_checklist || !(structure as unknown as Record<string, unknown>)['checklist_items']) {
            router.replace(`/${slug}/concluido`)
            return
          }
          checklistItems = (structure as unknown as Record<string, unknown>)['checklist_items'] as ChecklistItem[]
          // Update cache
          sessionStorage.setItem('survey_structure', JSON.stringify(structure))
        } catch {
          setError('Erro ao carregar checklist.')
          setLoading(false)
          return
        }
      }

      setItems(checklistItems)
      setLoading(false)

      // Fire pagina_acessada event for the checklist page (Req 8.1, 8.2)
      if (token) {
        logEvent(token, 'pagina_acessada', {
          slug,
          pagina: 'checklist',
          timestamp: new Date().toISOString(),
        }).catch(() => {})
      }
    }

    loadChecklist()
  }, [slug, router, token])

  const groupedItems = useMemo(() => {
    const grouped: Record<string, ChecklistItem[]> = {
      servico_cloud: [],
      fabricante: [],
      solucao: [],
    }
    for (const item of items) {
      if (grouped[item.grupo]) {
        grouped[item.grupo].push(item)
      }
    }
    return grouped
  }, [items])

  const filteredGroupItems = useMemo(() => {
    const filtered: Record<string, ChecklistItem[]> = {}
    for (const group of GROUPS) {
      const term = searchTerms[group.key].toLowerCase()
      filtered[group.key] = term
        ? groupedItems[group.key].filter((item) =>
            item.nome.toLowerCase().includes(term)
          )
        : groupedItems[group.key]
    }
    return filtered
  }, [groupedItems, searchTerms])

  function toggleItem(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function getSelectedCount(grupo: string): number {
    return groupedItems[grupo]?.filter((item) => selectedIds.has(item.id)).length ?? 0
  }

  async function handleSubmit() {
    if (!token) {
      router.replace(`/${slug}/identificacao`)
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      await submitChecklist(token, Array.from(selectedIds))
      router.push(`/${slug}/concluido`)
    } catch {
      setError('Erro ao salvar checklist. Tente novamente.')
      setSubmitting(false)
    }
  }

  function handleSkip() {
    router.push(`/${slug}/concluido`)
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-gray-500 text-lg">Carregando...</div>
      </main>
    )
  }

  if (error && items.length === 0) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-red-600 text-center">{error}</div>
      </main>
    )
  }

  return (
    <main className={`min-h-screen py-6 px-4 sm:px-6 lg:px-8 ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="max-w-3xl mx-auto">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <img src="/logo_completo.png" alt="BouCheck" className="h-10 w-auto object-contain" />
        </div>

        <h1 className={`text-2xl font-bold mb-2 text-center ${isDark ? 'text-white' : 'text-gray-900'}`}>
          Checklist
        </h1>
        <p className={`text-center mb-6 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
          Selecione os itens que se aplicam à sua empresa.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm text-center">
            {error}
          </div>
        )}

        <div className="space-y-6">
          {GROUPS.map((group) => {
            const groupItems = filteredGroupItems[group.key]
            const totalInGroup = groupedItems[group.key].length
            const selectedCount = getSelectedCount(group.key)

            if (totalInGroup === 0) return null

            return (
              <section
                key={group.key}
                className={`rounded-xl shadow-sm border overflow-hidden ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
              >
                <div className={`px-4 py-3 border-b ${isDark ? 'bg-gray-750 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-center justify-between">
                    <h2 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>
                      {group.label}
                    </h2>
                    <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {selectedCount} selecionado{selectedCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <input
                    type="text"
                    placeholder={`Buscar em ${group.label.toLowerCase()}...`}
                    value={searchTerms[group.key]}
                    onChange={(e) =>
                      setSearchTerms((prev) => ({
                        ...prev,
                        [group.key]: e.target.value,
                      }))
                    }
                    className={`mt-2 w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400' : 'border-gray-300'}`}
                    aria-label={`Buscar ${group.label}`}
                  />
                </div>

                <div className="max-h-60 overflow-y-auto">
                  {groupItems.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-400 text-center">
                      Nenhum item encontrado.
                    </div>
                  ) : (
                    <ul role="list" className={`divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-100'}`}>
                      {groupItems.map((item) => (
                        <li key={item.id}>
                          <label className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(item.id)}
                              onChange={() => toggleItem(item.id)}
                              className="h-4 w-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue"
                            />
                            <span className={`text-sm ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                              {item.nome}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )
          })}
        </div>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full sm:w-auto px-6 py-3 bg-brand-blue text-white font-semibold rounded-lg hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Salvando...' : 'Confirmar'}
          </button>
          <button
            onClick={handleSkip}
            disabled={submitting}
            className="w-full sm:w-auto px-6 py-3 text-gray-600 font-medium hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Pular esta etapa
          </button>
        </div>
      </div>
    </main>
  )
}
