'use client'

import { useState, type FormEvent } from 'react'
import { meApi, AdminApiError } from '@/lib/admin/api'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { useToast } from '@/components/admin/ui/toast'
import { ThemeSelector } from '@/components/admin/theme-toggle'

export default function MePage() {
  const { toast } = useToast()
  const [form, setForm] = useState({ current_password: '', password: '', confirm: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (form.password !== form.confirm) {
      setError('As senhas não coincidem.')
      return
    }
    if (form.password.length < 10) {
      setError('A nova senha deve ter ao menos 10 caracteres.')
      return
    }

    setSaving(true)
    try {
      await meApi.changePassword(form.current_password, form.password)
      toast('Senha alterada com sucesso!', 'success')
      setForm({ current_password: '', password: '', confirm: '' })
    } catch (err) {
      if (err instanceof AdminApiError) {
        if (err.status === 401 || err.status === 422) {
          setError('Senha atual incorreta ou nova senha inválida.')
        } else {
          setError(err.message)
        }
      } else {
        setError('Erro ao alterar senha.')
      }
    } finally { setSaving(false) }
  }

  return (
    <div className="p-8 max-w-md mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Minha conta</h1>

      {/* Theme preference */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <h2 className="font-semibold text-gray-800 dark:text-gray-100">Aparência</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Escolha o tema do painel administrativo. A preferência é salva na sua conta.
        </p>
        <ThemeSelector />
      </div>

      {/* Change password */}
      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-5">
        <h2 className="font-semibold text-gray-800 dark:text-gray-100">Alterar senha</h2>

        <Input
          label="Senha atual"
          type="password"
          value={form.current_password}
          onChange={(e) => setForm((f) => ({ ...f, current_password: e.target.value }))}
          autoComplete="current-password"
          required
        />

        <Input
          label="Nova senha"
          type="password"
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          autoComplete="new-password"
          required
          hint="Mínimo 10 caracteres, ao menos 1 letra e 1 número."
        />

        <Input
          label="Confirmar nova senha"
          type="password"
          value={form.confirm}
          onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
          autoComplete="new-password"
          required
        />

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <Button
          type="submit"
          loading={saving}
          disabled={!form.current_password || !form.password || !form.confirm}
        >
          Alterar senha
        </Button>
      </form>
    </div>
  )
}
