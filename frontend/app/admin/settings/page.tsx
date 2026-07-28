'use client'

import { useState, useEffect, useCallback } from 'react'
import { settingsApi, surveysApi, type Setting, type Survey, AdminApiError } from '@/lib/admin/api'
import { Card, CardHeader, CardBody } from '@/components/admin/ui/card'
import { Button } from '@/components/admin/ui/button'
import { useToast } from '@/components/admin/ui/toast'

export default function AdminSettingsPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [selectedSlug, setSelectedSlug] = useState<string>('')
  const [currentSlug, setCurrentSlug] = useState<string | null>(null)
  const [validationError, setValidationError] = useState('')
  const [inactiveWarning, setInactiveWarning] = useState(false)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [settings, allSurveys] = await Promise.all([
        settingsApi.getAll(),
        surveysApi.list(),
      ])

      // Filter only active surveys for the dropdown
      const activeSurveys = allSurveys.filter((s) => s.status === 'ativo')
      setSurveys(activeSurveys)

      // Find the current landing_survey_link setting
      const landingSetting = settings.find((s: Setting) => s.key === 'landing_survey_link')
      const savedSlug = landingSetting?.value || ''
      setCurrentSlug(savedSlug || null)
      setSelectedSlug(savedSlug)

      // Check if the saved slug references an inactive survey
      if (savedSlug) {
        const isActive = activeSurveys.some((s) => s.slug === savedSlug)
        if (!isActive) {
          setInactiveWarning(true)
        }
      }
    } catch {
      toast('Erro ao carregar configurações. Tente novamente.', 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSave = async () => {
    // Validate selection
    if (!selectedSlug) {
      setValidationError('Selecione uma survey para vincular à landing page.')
      return
    }

    setValidationError('')
    setSaving(true)

    try {
      await settingsApi.update({ landing_survey_link: selectedSlug })
      setCurrentSlug(selectedSlug)
      setInactiveWarning(false)
      toast('Configuração salva com sucesso!', 'success')
    } catch (err) {
      if (err instanceof AdminApiError) {
        toast(`Erro ao salvar: ${err.message}`, 'error')
      } else {
        toast('Erro ao salvar configuração. Verifique sua conexão e tente novamente.', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <svg className="h-6 w-6 animate-spin text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <span className="ml-2 text-gray-500">Carregando configurações...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Configurações</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Gerencie as configurações gerais da plataforma.
        </p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Link da Landing Page
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Selecione a survey que será vinculada ao botão de CTA da landing page.
          </p>
        </CardHeader>
        <CardBody>
          {inactiveWarning && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <svg className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-amber-800">
                  A survey vinculada atualmente está inativa
                </p>
                <p className="text-sm text-amber-700 mt-0.5">
                  A survey <strong>&quot;{currentSlug}&quot;</strong> não está mais com status &quot;ativo&quot;. Selecione uma nova survey para exibir na landing page.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <label htmlFor="survey-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Survey vinculada
            </label>
            <select
              id="survey-select"
              value={selectedSlug}
              onChange={(e) => {
                setSelectedSlug(e.target.value)
                setValidationError('')
              }}
              className={[
                'w-full rounded-lg border px-3 py-2.5 text-sm text-gray-800 dark:text-gray-200 dark:bg-gray-800',
                'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
                validationError ? 'border-red-400 focus:ring-red-400' : 'border-gray-300 dark:border-gray-600',
              ].join(' ')}
            >
              <option value="">Selecione uma survey...</option>
              {surveys.map((survey) => (
                <option key={survey.id} value={survey.slug}>
                  {survey.nome}
                </option>
              ))}
            </select>

            {validationError && (
              <p className="text-sm text-red-600 dark:text-red-400">{validationError}</p>
            )}

            {surveys.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Nenhuma survey com status &quot;ativo&quot; encontrada. Publique uma survey primeiro.
              </p>
            )}
          </div>

          <div className="mt-6">
            <Button
              onClick={handleSave}
              loading={saving}
              disabled={surveys.length === 0}
            >
              Salvar Configuração
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
