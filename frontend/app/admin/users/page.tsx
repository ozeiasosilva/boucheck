'use client'

import { useState, useEffect } from 'react'
import { adminUsersApi, type AdminUser, AdminApiError } from '@/lib/admin/api'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { Modal } from '@/components/admin/ui/modal'
import { Badge } from '@/components/admin/ui/badge'
import { useToast } from '@/components/admin/ui/toast'

export default function UsersPage() {
  const { toast } = useToast()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)

  // Create modal state
  const [createModal, setCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({ nome: '', email: '', password: '' })
  const [saving, setSaving] = useState(false)

  // Reset password modal state
  const [resetModal, setResetModal] = useState(false)
  const [resetUser, setResetUser] = useState<AdminUser | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    adminUsersApi.list()
      .then(setUsers)
      .catch(() => toast('Erro ao carregar usuários.', 'error'))
      .finally(() => setLoading(false))
  }, [toast])

  async function handleCreate() {
    if (!createForm.nome.trim() || !createForm.email.trim()) return
    setSaving(true)
    try {
      const created = await adminUsersApi.create(
        createForm.nome,
        createForm.email,
        createForm.password || undefined
      )
      setUsers((prev) => [...prev, created])
      if (createForm.password) {
        toast('Usuário criado com a senha definida.', 'success')
      } else {
        toast('Usuário criado! Uma senha temporária foi enviada por e-mail.', 'success')
      }
      setCreateModal(false)
      setCreateForm({ nome: '', email: '', password: '' })
    } catch (err) {
      toast(err instanceof AdminApiError ? err.message : 'Erro ao criar usuário.', 'error')
    } finally { setSaving(false) }
  }

  async function handleResetPassword() {
    if (!resetUser || !resetPassword.trim()) return
    setResetting(true)
    try {
      await adminUsersApi.resetPassword(resetUser.id, resetPassword)
      toast(`Senha de "${resetUser.nome}" redefinida com sucesso.`, 'success')
      setResetModal(false)
      setResetUser(null)
      setResetPassword('')
    } catch (err) {
      toast(err instanceof AdminApiError ? err.message : 'Erro ao redefinir senha.', 'error')
    } finally { setResetting(false) }
  }

  function openResetModal(user: AdminUser) {
    setResetUser(user)
    setResetPassword('')
    setResetModal(true)
  }

  async function handleToggleActive(user: AdminUser) {
    const action = user.ativo ? 'desativar' : 'reativar'
    if (!confirm(`Deseja ${action} o usuário "${user.nome}"?`)) return
    try {
      const updated = await adminUsersApi.setActive(user.id, !user.ativo)
      setUsers((prev) => prev.map((u) => (u.id === user.id ? updated : u)))
      toast(`Usuário ${user.ativo ? 'desativado' : 'reativado'}.`, 'success')
    } catch (err) {
      toast(err instanceof AdminApiError ? err.message : `Erro ao ${action} usuário.`, 'error')
    }
  }

  function fmtDate(d: string | null) {
    if (!d) return 'Nunca'
    return new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usuários</h1>
          <p className="text-sm text-gray-500 mt-0.5">{users.length} administrador(es)</p>
        </div>
        <Button onClick={() => setCreateModal(true)}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Novo usuário
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Carregando...</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {['Nome', 'E-mail', 'Status', 'Último login', 'Desde', ''].map((h) => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">{user.nome}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{user.email}</td>
                  <td className="px-6 py-4">
                    <Badge variant={user.ativo ? 'green' : 'gray'}>
                      {user.ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{fmtDate(user.last_login_at)}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(user.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openResetModal(user)}
                      >
                        Senha
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleActive(user)}
                      >
                        {user.ativo ? 'Desativar' : 'Reativar'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
        <strong>Atenção:</strong> O último administrador ativo não pode ser desativado.
      </div>

      {/* Create User Modal */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Novo administrador">
        <div className="space-y-4">
          <Input
            label="Nome completo"
            value={createForm.nome}
            onChange={(e) => setCreateForm((f) => ({ ...f, nome: e.target.value }))}
            required
            placeholder="Maria Silva"
          />
          <Input
            label="E-mail"
            type="email"
            value={createForm.email}
            onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
            required
            placeholder="maria@beonup.com.br"
          />
          <Input
            label="Senha"
            type="password"
            value={createForm.password}
            onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
            placeholder="Deixe em branco para gerar automaticamente"
          />
          <p className="text-xs text-gray-500">
            {createForm.password
              ? 'A senha deve ter no mínimo 10 caracteres, com pelo menos 1 letra e 1 número.'
              : 'Uma senha temporária será enviada para o e-mail informado. O usuário será solicitado a trocá-la no primeiro login.'}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCreateModal(false)}>Cancelar</Button>
            <Button
              onClick={handleCreate}
              loading={saving}
              disabled={!createForm.nome.trim() || !createForm.email.trim()}
            >
              Criar usuário
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reset Password Modal */}
      <Modal open={resetModal} onClose={() => setResetModal(false)} title="Redefinir senha">
        <div className="space-y-4">
          {resetUser && (
            <p className="text-sm text-gray-600">
              Defina uma nova senha para <strong>{resetUser.nome}</strong> ({resetUser.email}).
            </p>
          )}
          <Input
            label="Nova senha"
            type="password"
            value={resetPassword}
            onChange={(e) => setResetPassword(e.target.value)}
            required
            placeholder="Mínimo 10 caracteres"
          />
          <p className="text-xs text-gray-500">
            A senha deve ter no mínimo 10 caracteres, com pelo menos 1 letra e 1 número.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setResetModal(false)}>Cancelar</Button>
            <Button
              onClick={handleResetPassword}
              loading={resetting}
              disabled={!resetPassword.trim()}
            >
              Redefinir senha
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
