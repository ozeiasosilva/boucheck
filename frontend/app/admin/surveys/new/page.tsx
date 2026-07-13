'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { surveysApi, categoriesApi, type Category, AdminApiError } from '@/lib/admin/api'
import { Button } from '@/components/admin/ui/button'
import { Input, Textarea, Select } from '@/components/admin/ui/input'
import { useToast } from '@/components/admin/ui/toast'

export default function NewSurveyPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    nome: '',
    slug: '',
    categoria_id: '',
    mensagem_objetivo: '',
    tempo_estimado_min: '',
    link_agendamento: '',
    email_notificacao: '',
    usar_ia_no_relatorio: false,
  })

  useEffect(() => {
    categoriesApi.list().then(setCategories).catch(() => {})
  }, [])

  // Auto-generate slug from nome
  function handleNomeChange(nome: string) {
    const slug = nome
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
    setForm((f) => ({ ...f, nome, slug }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const payload = {
        nome: form.nome,
        slug: form.slug,
        categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
        mensagem_objetivo: form.mensagem_objetivo || null,
        tempo_estimado_min: form.tempo_estimado_min ? Number(form.tempo_estimado_min) : null,
        link_agendamento: form.link_agendamento || null,
        email_notificacao: form.email_notificacao || null,
        usar_ia_no_relatorio: form.usar_ia_no_relatorio,
      }
      const survey = await surveysApi.create(payload)
      toast('Survey criado!', 'success')
      router.push(`/admin/surveys/${survey.id}`)
    } catch (err) {
      const msg = err instanceof AdminApiError ? err.message : 'Erro ao criar survey.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Voltar
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Novo survey</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <Input
          label="Nome do survey"
          value={form.nome}
          onChange={(e) => handleNomeChange(e.target.value)}
          required
          placeholder="Maturidade de TI"
        />

        <Input
          label="Slug (URL amigável)"
          value={form.slug}
          onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
          required
          placeholder="maturidade-ti"
          hint="Apenas minúsculas, números e hífens. Ex: maturidade-ti"
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
          placeholder="Descreva o objetivo do survey para o respondente..."
          hint="Até 1.000 caracteres."
        />

        <Input
          label="Tempo estimado (minutos)"
          type="number"
          min={1}
          max={120}
          value={form.tempo_estimado_min}
          onChange={(e) => setForm((f) => ({ ...f, tempo_estimado_min: e.target.value }))}
          placeholder="15"
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
          placeholder="comercial@beonup.com.br"
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

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" type="button" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button type="submit" loading={loading}>
            Criar survey
          </Button>
        </div>
      </form>
    </div>
  )
}
