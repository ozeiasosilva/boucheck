'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { checklistApi, surveysApi, type ChecklistItem, type Survey, AdminApiError } from '@/lib/admin/api'
import { Button } from '@/components/admin/ui/button'
import { Input, Select } from '@/components/admin/ui/input'
import { Modal } from '@/components/admin/ui/modal'
import { Badge } from '@/components/admin/ui/badge'
import { useToast } from '@/components/admin/ui/toast'

const GRUPOS: ChecklistItem['grupo'][] = ['servico_cloud', 'fabricante', 'solucao']
const GRUPO_LABELS: Record<ChecklistItem['grupo'], string> = { servico_cloud: 'Serviço Cloud', fabricante: 'Fabricante', solucao: 'Solução' }

export default function ChecklistPage() {
  const { id } = useParams<{ id: string }>()
  const { toast } = useToast()
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [importModal, setImportModal] = useState(false)
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [importSurveyId, setImportSurveyId] = useState('')
  const [editItem, setEditItem] = useState<ChecklistItem | null>(null)
  const [form, setForm] = useState({ nome: '', grupo: 'servico_cloud' as ChecklistItem['grupo'] })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    checklistApi.list(Number(id)).then(setItems).catch(() => toast('Erro ao carregar checklist.', 'error')).finally(() => setLoading(false))
  }, [id, toast])

  async function saveItem() {
    setSaving(true)
    try {
      if (editItem) {
        const updated = await checklistApi.update(editItem.id, form)
        setItems((prev) => prev.map((i) => (i.id === editItem.id ? updated : i)))
      } else {
        const created = await checklistApi.store(Number(id), form)
        setItems((prev) => [...prev, created])
      }
      toast('Item salvo!', 'success')
      setModal(false)
      setEditItem(null)
      setForm({ nome: '', grupo: 'servico_cloud' })
    } catch (err) {
      toast(err instanceof AdminApiError ? err.message : 'Erro ao salvar.', 'error')
    } finally { setSaving(false) }
  }

  async function deleteItem(item: ChecklistItem) {
    if (!confirm(`Excluir "${item.nome}"?`)) return
    try {
      await checklistApi.delete(item.id)
      setItems((prev) => prev.filter((i) => i.id !== item.id))
      toast('Item excluído.', 'success')
    } catch { toast('Erro ao excluir.', 'error') }
  }

  async function handleImport() {
    if (!importSurveyId) return
    try {
      const imported = await checklistApi.import(Number(id), Number(importSurveyId))
      setItems((prev) => [...prev, ...imported])
      toast(`${imported.length} item(s) importado(s)!`, 'success')
      setImportModal(false)
    } catch (err) {
      toast(err instanceof AdminApiError ? err.message : 'Erro ao importar.', 'error')
    }
  }

  function openEdit(item: ChecklistItem) {
    setEditItem(item)
    setForm({ nome: item.nome, grupo: item.grupo })
    setModal(true)
  }

  function openAdd() {
    setEditItem(null)
    setForm({ nome: '', grupo: 'servico_cloud' })
    setModal(true)
  }

  async function openImport() {
    const all = await surveysApi.list().catch(() => [])
    setSurveys(all.filter((s) => s.id !== Number(id)))
    setImportModal(true)
  }

  const grouped = GRUPOS.reduce((acc, g) => ({ ...acc, [g]: items.filter((i) => i.grupo === g) }), {} as Record<string, ChecklistItem[]>)

  if (loading) return <div className="text-center py-12 text-gray-400">Carregando...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-500">{items.length} item(s)</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={openImport}>Importar de outro survey</Button>
          <Button onClick={openAdd}>+ Adicionar item</Button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
          <p className="text-gray-400 mb-3">Nenhum item no checklist. Quando vazio, a etapa é pulada automaticamente.</p>
          <Button variant="secondary" onClick={openAdd}>Adicionar primeiro item</Button>
        </div>
      ) : (
        <div className="space-y-6">
          {GRUPOS.map((grupo) => (
            <div key={grupo} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <span className="font-medium text-gray-700">{GRUPO_LABELS[grupo]}</span>
                <Badge variant="gray">{grouped[grupo].length}</Badge>
              </div>
              {grouped[grupo].length === 0 ? (
                <p className="px-6 py-4 text-sm text-gray-400">Nenhum item neste grupo.</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {grouped[grupo].map((item) => (
                    <div key={item.id} className="flex items-center justify-between px-6 py-3 group hover:bg-gray-50">
                      <span className="text-sm text-gray-700">{item.nome}</span>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>Editar</Button>
                        <Button variant="ghost" size="sm" onClick={() => deleteItem(item)}>
                          <svg className="h-4 w-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editItem ? 'Editar item' : 'Novo item'}>
        <div className="space-y-4">
          <Input label="Nome" value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} required />
          <Select label="Grupo" value={form.grupo} onChange={(e) => setForm((f) => ({ ...f, grupo: e.target.value as ChecklistItem['grupo'] }))}>
            {GRUPOS.map((g) => <option key={g} value={g}>{GRUPO_LABELS[g]}</option>)}
          </Select>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModal(false)}>Cancelar</Button>
            <Button onClick={saveItem} loading={saving} disabled={!form.nome.trim()}>Salvar</Button>
          </div>
        </div>
      </Modal>

      <Modal open={importModal} onClose={() => setImportModal(false)} title="Importar checklist">
        <div className="space-y-4">
          <Select label="Survey de origem" value={importSurveyId} onChange={(e) => setImportSurveyId(e.target.value)}>
            <option value="">Selecione um survey</option>
            {surveys.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </Select>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setImportModal(false)}>Cancelar</Button>
            <Button onClick={handleImport} disabled={!importSurveyId}>Importar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
