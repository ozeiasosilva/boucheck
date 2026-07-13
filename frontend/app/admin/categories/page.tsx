'use client'

import { useState, useEffect } from 'react'
import { categoriesApi, type Category, AdminApiError } from '@/lib/admin/api'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { Modal } from '@/components/admin/ui/modal'
import { useToast } from '@/components/admin/ui/toast'

export default function CategoriesPage() {
  const { toast } = useToast()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  // Create/Edit modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [nome, setNome] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    categoriesApi
      .list()
      .then(setCategories)
      .catch(() => toast('Erro ao carregar categorias.', 'error'))
      .finally(() => setLoading(false))
  }, [toast])

  function openCreateModal() {
    setEditingCategory(null)
    setNome('')
    setModalOpen(true)
  }

  function openEditModal(category: Category) {
    setEditingCategory(category)
    setNome(category.nome)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingCategory(null)
    setNome('')
  }

  async function handleSave() {
    if (!nome.trim()) return
    setSaving(true)
    try {
      if (editingCategory) {
        const updated = await categoriesApi.update(editingCategory.id, nome.trim())
        setCategories((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
        toast('Categoria atualizada.', 'success')
      } else {
        const created = await categoriesApi.create(nome.trim())
        setCategories((prev) => [...prev, created])
        toast('Categoria criada.', 'success')
      }
      closeModal()
    } catch (err) {
      toast(err instanceof AdminApiError ? err.message : 'Erro ao salvar categoria.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(category: Category) {
    if (!confirm(`Deseja excluir a categoria "${category.nome}"?`)) return
    try {
      await categoriesApi.delete(category.id)
      setCategories((prev) => prev.filter((c) => c.id !== category.id))
      toast('Categoria excluída.', 'success')
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 422) {
        toast('Não é possível excluir uma categoria em uso por surveys.', 'error')
      } else {
        toast(err instanceof AdminApiError ? err.message : 'Erro ao excluir categoria.', 'error')
      }
    }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Categorias</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {categories.length} categoria(s)
          </p>
        </div>
        <Button onClick={openCreateModal}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Nova categoria
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Carregando...</div>
      ) : categories.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          Nenhuma categoria cadastrada.
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                {['Nome', 'Criada em', ''].map((h) => (
                  <th
                    key={h}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {categories.map((category) => (
                <tr key={category.id} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                  <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">
                    {category.nome}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                    {new Date(category.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEditModal(category)}>
                        Editar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(category)}>
                        Excluir
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingCategory ? 'Editar categoria' : 'Nova categoria'}
      >
        <div className="space-y-4">
          <Input
            label="Nome da categoria"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            placeholder="Ex: Satisfação do cliente"
            autoFocus
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={closeModal}>
              Cancelar
            </Button>
            <Button onClick={handleSave} loading={saving} disabled={!nome.trim()}>
              {editingCategory ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
