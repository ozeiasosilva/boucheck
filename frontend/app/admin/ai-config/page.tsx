'use client'

import { useState, useEffect, useCallback } from 'react'
import { insightsApi, type PromptsConfig, AdminApiError } from '@/lib/admin/api'
import { Card, CardHeader, CardBody } from '@/components/admin/ui/card'
import { Button } from '@/components/admin/ui/button'

const MAX_CHARS = 10000

export default function AiConfigPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [surveyPrompt, setSurveyPrompt] = useState('')
  const [clientPrompt, setClientPrompt] = useState('')
  const [surveyIsDefault, setSurveyIsDefault] = useState(true)
  const [clientIsDefault, setClientIsDefault] = useState(true)
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const loadPrompts = useCallback(async () => {
    try {
      setLoading(true)
      const config: PromptsConfig = await insightsApi.getPrompts()
      setSurveyIsDefault(config.survey_agent.is_default)
      setClientIsDefault(config.client_agent.is_default)
      setSurveyPrompt(config.survey_agent.is_default ? '' : (config.survey_agent.conteudo ?? ''))
      setClientPrompt(config.client_agent.is_default ? '' : (config.client_agent.conteudo ?? ''))
    } catch {
      setErrorMsg('Erro ao carregar configurações de prompts.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPrompts()
  }, [loadPrompts])

  const surveyExceedsLimit = surveyPrompt.length > MAX_CHARS
  const clientExceedsLimit = clientPrompt.length > MAX_CHARS
  const hasValidationError = surveyExceedsLimit || clientExceedsLimit

  const handleSave = async () => {
    if (hasValidationError) return

    setSuccessMsg('')
    setErrorMsg('')
    setSaving(true)

    const payload: { survey_agent_prompt?: string; client_agent_prompt?: string } = {}
    if (surveyPrompt.trim().length > 0) {
      payload.survey_agent_prompt = surveyPrompt
    }
    if (clientPrompt.trim().length > 0) {
      payload.client_agent_prompt = clientPrompt
    }

    try {
      await insightsApi.updatePrompts(payload)
      setSuccessMsg('Configurações salvas com sucesso!')
      if (surveyPrompt.trim().length > 0) setSurveyIsDefault(false)
      if (clientPrompt.trim().length > 0) setClientIsDefault(false)
    } catch (err) {
      if (err instanceof AdminApiError) {
        setErrorMsg(`Erro ao salvar: ${err.message}`)
      } else {
        setErrorMsg('Erro ao salvar configurações. Verifique sua conexão e tente novamente.')
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configurações de IA</h1>
        <p className="mt-1 text-sm text-gray-500">Configure os prompts dos agentes de análise.</p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-800">Prompt do Agente Survey</h2>
          <p className="text-sm text-gray-500 mt-1">
            Este prompt define como o agente analisa os dados agregados de um survey.
          </p>
        </CardHeader>
        <CardBody>
          {surveyIsDefault && surveyPrompt.length === 0 && (
            <p className="text-sm text-amber-600 mb-2">
              Usando prompt padrão. Edite para personalizar.
            </p>
          )}
          <textarea
            rows={10}
            className={[
              'w-full rounded-lg border px-3 py-2 text-sm text-gray-800 placeholder-gray-400',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
              'resize-y',
              surveyExceedsLimit ? 'border-red-400 focus:ring-red-400' : 'border-gray-300',
            ].join(' ')}
            placeholder="Digite o prompt customizado para o Agente Survey..."
            value={surveyPrompt}
            onChange={(e) => {
              setSurveyPrompt(e.target.value)
              setSuccessMsg('')
            }}
          />
          <div className="flex justify-between items-center mt-1">
            {surveyExceedsLimit && (
              <p className="text-xs text-red-500">Limite de caracteres excedido.</p>
            )}
            {!surveyExceedsLimit && <span />}
            <span className={['text-xs', surveyExceedsLimit ? 'text-red-500 font-medium' : 'text-gray-400'].join(' ')}>
              {surveyPrompt.length}/{MAX_CHARS}
            </span>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-800">Prompt do Agente Cliente</h2>
          <p className="text-sm text-gray-500 mt-1">
            Este prompt define como o agente analisa os dados individuais de cada cliente.
          </p>
        </CardHeader>
        <CardBody>
          {clientIsDefault && clientPrompt.length === 0 && (
            <p className="text-sm text-amber-600 mb-2">
              Usando prompt padrão. Edite para personalizar.
            </p>
          )}
          <textarea
            rows={10}
            className={[
              'w-full rounded-lg border px-3 py-2 text-sm text-gray-800 placeholder-gray-400',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
              'resize-y',
              clientExceedsLimit ? 'border-red-400 focus:ring-red-400' : 'border-gray-300',
            ].join(' ')}
            placeholder="Digite o prompt customizado para o Agente Cliente..."
            value={clientPrompt}
            onChange={(e) => {
              setClientPrompt(e.target.value)
              setSuccessMsg('')
            }}
          />
          <div className="flex justify-between items-center mt-1">
            {clientExceedsLimit && (
              <p className="text-xs text-red-500">Limite de caracteres excedido.</p>
            )}
            {!clientExceedsLimit && <span />}
            <span className={['text-xs', clientExceedsLimit ? 'text-red-500 font-medium' : 'text-gray-400'].join(' ')}>
              {clientPrompt.length}/{MAX_CHARS}
            </span>
          </div>
        </CardBody>
      </Card>

      <div className="flex items-center gap-4">
        <Button
          onClick={handleSave}
          loading={saving}
          disabled={hasValidationError}
        >
          Salvar Configurações
        </Button>

        {successMsg && (
          <p className="text-sm text-green-600 font-medium">{successMsg}</p>
        )}
        {errorMsg && (
          <p className="text-sm text-red-600 font-medium">{errorMsg}</p>
        )}
      </div>
    </div>
  )
}
