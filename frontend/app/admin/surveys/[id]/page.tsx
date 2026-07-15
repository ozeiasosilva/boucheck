'use client'

import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { useParams } from 'next/navigation'
import { surveysApi, categoriesApi, type Survey, type Category, AdminApiError } from '@/lib/admin/api'
import { Button } from '@/components/admin/ui/button'
import { Input, Textarea, Select } from '@/components/admin/ui/input'
import { Toggle } from '@/components/admin/ui/toggle'
import { useToast } from '@/components/admin/ui/toast'

type ButtonConfigField = 'mostrar_btn_relatorio' | 'mostrar_btn_email' | 'mostrar_btn_whatsapp' | 'mostrar_btn_consultor'

export default function SurveyGeneralPage() {
  const { id } = useParams<{ id: string }>()
  const { toast } = useToast()
  const [survey, setSurvey] = useState<Survey | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState(false)

  // Button config state (managed independently from main form)
  const [buttonConfig, setButtonConfig] = useState({
    mostrar_btn_relatorio: true,
    mostrar_btn_email: true,
    mostrar_btn_whatsapp: true,
    mostrar_btn_consultor: true,
  })
  const [savingToggles, setSavingToggles] = useState<Record<ButtonConfigField, boolean>>({
    mostrar_btn_relatorio: false,
    mostrar_btn_email: false,
    mostrar_btn_whatsapp: false,
    mostrar_btn_consultor: false,
  })

  const [form, setForm] = useState({
    nome: '',
    slug: '',
    categoria_id: '',
    mensagem_objetivo: '',
    tempo_estimado_min: '',
    link_agendamento: '',
    email_notificacao: '',
    usar_ia_no_relatorio: false,
    telefone_whatsapp: '',
  })

  useEffect(() => {
    Promise.all([
      surveysApi.get(Number(id)),
      categoriesApi.list(),
    ]).then(([s, cats]) => {
      setSurvey(s)
      setCategories(cats)
      setForm({
        nome: s.nome,
        slug: s.slug,
        categoria_id: s.categoria_id ? String(s.categoria_id) : '',
        mensagem_objetivo: s.mensagem_objetivo ?? '',
        tempo_estimado_min: s.tempo_estimado_min ? String(s.tempo_estimado_min) : '',
        link_agendamento: s.link_agendamento ?? '',
        email_notificacao: s.email_notificacao ?? '',
        usar_ia_no_relatorio: s.usar_ia_no_relatorio ?? false,
        telefone_whatsapp: s.telefone_whatsapp ?? '',
      })
      setButtonConfig({
        mostrar_btn_relatorio: s.mostrar_btn_relatorio ?? true,
        mostrar_btn_email: s.mostrar_btn_email ?? true,
        mostrar_btn_whatsapp: s.mostrar_btn_whatsapp ?? true,
        mostrar_btn_consultor: s.mostrar_btn_consultor ?? true,
      })
      setLoadError(false)
    }).catch(() => {
      toast('Erro ao carregar survey.', 'error')
      setLoadError(true)
    })
      .finally(() => setLoading(false))
  }, [id, toast])

  const handleToggleChange = useCallback(async (field: ButtonConfigField, newValue: boolean) => {
    // Store previous state for rollback
    const previousValue = buttonConfig[field]

    // Optimistic update
    setButtonConfig((prev) => ({ ...prev, [field]: newValue }))
    setSavingToggles((prev) => ({ ...prev, [field]: true }))

    try {
      const updated = await surveysApi.update(Number(id), { [field]: newValue })
      setSurvey(updated)
      toast('Configuração salva!', 'success')
    } catch {
      // Revert to previous state on failure
      setButtonConfig((prev) => ({ ...prev, [field]: previousValue }))
      toast('Erro ao salvar configuração. Tente novamente.', 'error')
    } finally {
      setSavingToggles((prev) => ({ ...prev, [field]: false }))
    }
  }, [buttonConfig, id, toast])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const updated = await surveysApi.update(Number(id), {
        nome: form.nome,
        slug: form.slug,
        categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
        mensagem_objetivo: form.mensagem_objetivo || null,
        tempo_estimado_min: form.tempo_estimado_min ? Number(form.tempo_estimado_min) : null,
        link_agendamento: form.link_agendamento || null,
        email_notificacao: form.email_notificacao || null,
        usar_ia_no_relatorio: form.usar_ia_no_relatorio,
        telefone_whatsapp: form.telefone_whatsapp || null,
      })
      setSurvey(updated)
      toast('Survey salvo!', 'success')
    } catch (err) {
      const msg = err instanceof AdminApiError ? err.message : 'Erro ao salvar.'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <svg className="h-5 w-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Carregando...
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5 max-w-2xl">
      <Input
        label="Nome do survey"
        value={form.nome}
        onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
        required
      />

      <Input
        label="Slug (URL amigável)"
        value={form.slug}
        onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
        required
        hint="Apenas minúsculas, números e hífens."
      />

      <Select
        label="Categoria"
        value={form.categoria_id}
        onChange={(e) => setForm((f) => ({ ...f, categoria_id: e.target.value }))}
      >
        <option value="">Sem categoria</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.nome}</option>
        ))}
      </Select>

      <Textarea
        label="Mensagem de objetivo"
        value={form.mensagem_objetivo}
        onChange={(e) => setForm((f) => ({ ...f, mensagem_objetivo: e.target.value }))}
        rows={4}
        maxLength={1000}
        hint={`${form.mensagem_objetivo.length}/1000 caracteres`}
      />

      <Input
        label="Tempo estimado (minutos)"
        type="number"
        min={1}
        value={form.tempo_estimado_min}
        onChange={(e) => setForm((f) => ({ ...f, tempo_estimado_min: e.target.value }))}
      />

      <Input
        label="Link de agendamento do consultor"
        type="url"
        value={form.link_agendamento}
        onChange={(e) => setForm((f) => ({ ...f, link_agendamento: e.target.value }))}
        placeholder="https://calendly.com/..."
      />

      <Input
        label="E-mail de notificação comercial"
        type="email"
        value={form.email_notificacao}
        onChange={(e) => setForm((f) => ({ ...f, email_notificacao: e.target.value }))}
      />

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={form.usar_ia_no_relatorio}
          onChange={(e) => setForm((f) => ({ ...f, usar_ia_no_relatorio: e.target.checked }))}
          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />
        <span className="text-sm text-gray-700">
          Usar IA para gerar recomendações personalizadas no relatório
        </span>
      </label>

      {/* Botões de conclusão da pesquisa */}
      <fieldset className="rounded-lg border border-gray-200 p-4 space-y-3">
        <legend className="px-2 text-sm font-medium text-gray-700">
          Botões na tela de conclusão
        </legend>
        {loadError ? (
          <p className="text-sm text-red-600">Falha ao carregar configurações de botões</p>
        ) : (
          <>
            <Toggle
              label="Visualizar relatório"
              checked={buttonConfig.mostrar_btn_relatorio}
              onChange={(checked) => handleToggleChange('mostrar_btn_relatorio', checked)}
              disabled={savingToggles.mostrar_btn_relatorio}
            />
            <Toggle
              label="Receber relatório por e-mail"
              checked={buttonConfig.mostrar_btn_email}
              onChange={(checked) => handleToggleChange('mostrar_btn_email', checked)}
              disabled={savingToggles.mostrar_btn_email}
            />
            <Toggle
              label="Receber relatório por WhatsApp"
              checked={buttonConfig.mostrar_btn_whatsapp}
              onChange={(checked) => handleToggleChange('mostrar_btn_whatsapp', checked)}
              disabled={savingToggles.mostrar_btn_whatsapp}
            />
            <Toggle
              label="Falar com um consultor"
              checked={buttonConfig.mostrar_btn_consultor}
              onChange={(checked) => handleToggleChange('mostrar_btn_consultor', checked)}
              disabled={savingToggles.mostrar_btn_consultor}
            />
            {buttonConfig.mostrar_btn_consultor && (
              <div className="ml-6 mt-1">
                <Input
                  label="Telefone WhatsApp do consultor"
                  value={form.telefone_whatsapp}
                  onChange={(e) => setForm((f) => ({ ...f, telefone_whatsapp: e.target.value }))}
                  placeholder="5511999999999"
                  hint="Número com DDI+DDD, sem espaços ou símbolos. Ex: 5511999999999"
                />
              </div>
            )}
          </>
        )}
      </fieldset>

      {/* Survey status info */}
      {survey && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 text-sm text-gray-600">
          <p>
            Status atual: <strong>{survey.status}</strong> · Versão: <strong>v{survey.version}</strong>
          </p>
          {survey.status === 'rascunho' && (
            <p className="mt-1 text-gray-400">
              Para ativar o survey, vá à lista e clique em "Ativar" após cadastrar ao menos uma pergunta.
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" loading={saving}>Salvar alterações</Button>
      </div>
    </form>
  )
}
