'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { scoreRangesApi, type ScoreRange, AdminApiError } from '@/lib/admin/api'
import { Button } from '@/components/admin/ui/button'
import { Input, Textarea } from '@/components/admin/ui/input'
import { Modal } from '@/components/admin/ui/modal'
import { useToast } from '@/components/admin/ui/toast'

type RangeForm = { nome: string; min: string; max: string; descricao: string; cor: string }
const emptyForm = (): RangeForm => ({ nome: '', min: '0', max: '100', descricao: '', cor: '#4F46E5' })

export default function ScoreRangesPage() {
  const { id } = useParams<{ id: string }>()
  const { toast } = useToast()
  const [ranges, setRanges] = useState<ScoreRange[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editRange, setEditRange] = useState<ScoreRange | null>(null)
  const [form, setForm] = useState<RangeForm>(emptyForm())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    scoreRangesApi.list(Number(id)).then(setRanges).catch(() => toast('Erro ao carregar faixas.', 'error')).finally(() => setLoading(false))
  }, [id, toast])

  async function save() {
    setSaving(true)
    try {
      const payload = { nome: form.nome, min: Number(form.min), max: Number(form.max), descricao: form.descricao, cor: form.cor }
      if (editRange) {
        const updated = await scoreRangesApi.update(editRange.id, payload)
        setRanges((prev) => prev.map((r) => (r.id === editRange.id ? updated : r)))
      } else {
        const created = await scoreRangesApi.store(Number(id), payload)
        setRanges((prev) => [...prev, created])
      }
      toast('Faixa salva!', 'success')
      setModal(false)
    } catch (err) {
      toast(err instanceof AdminApiError ? err.message : 'Erro ao salvar.', 'error')
    } finally { setSaving(false) }
  }

  async function deleteRange(range: ScoreRange) {
    if (!confirm(`Excluir faixa "${range.nome}"?`)) return
    try {
      await scoreRangesApi.delete(range.id)
      setRanges((prev) => prev.filter((r) => r.id !== range.id))
      toast('Faixa excluída.', 'success')
    } catch { toast('Erro ao excluir.', 'error') }
  }

  function openEdit(r: ScoreRange) {
    setEditRange(r)
    setForm({ nome: r.nome, min: String(r.min), max: String(r.max), descricao: r.descricao, cor: r.cor })
    setModal(true)
  }

  if (loading) return <div className="text-center py-12 text-gray-400">Carregando...</div>

  const sorted = [...ranges].sort((a, b) => a.min - b.min)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-gray-500">{ranges.length} faixa(s) de maturidade</p>
          <p className="text-xs text-gray-400 mt-0.5">A pontuação é normalizada de 0 a 100.</p>
        </div>
        <Button onClick={() => { setEditRange(null); setForm(emptyForm()); setModal(true) }}>+ Nova faixa</Button>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
          <p className="text-gray-400 mb-3">Nenhuma faixa cadastrada.</p>
          <Button variant="secondary" onClick={() => { setEditRange(null); setForm(emptyForm()); setModal(true) }}>Criar primeira faixa</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((r) => (
            <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-5 flex gap-4">
              <div className="w-4 rounded-full self-stretch shrink-0" style={{ backgroundColor: r.cor }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{r.nome}</h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Pontuação: {r.min} – {r.max}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>Editar</Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteRange(r)}>
                      <svg className="h-4 w-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </Button>
                  </div>
                </div>
                {r.descricao && <p className="text-sm text-gray-600 mt-2 line-clamp-2">{r.descricao}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editRange ? 'Editar faixa' : 'Nova faixa'} size="lg">
        <div className="space-y-4">
          <Input label="Nome da faixa" value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} required placeholder="Ex: Gerenciado" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Pontuação mínima" type="number" min={0} max={100} value={form.min} onChange={(e) => setForm((f) => ({ ...f, min: e.target.value }))} />
            <Input label="Pontuação máxima" type="number" min={0} max={100} value={form.max} onChange={(e) => setForm((f) => ({ ...f, max: e.target.value }))} />
          </div>
          <Textarea label="Texto descritivo" value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} rows={4} placeholder="Descreva este nível de maturidade e inclua recomendações..." />
          <div className="flex items-center gap-4">
            <input type="color" value={form.cor} onChange={(e) => setForm((f) => ({ ...f, cor: e.target.value }))} className="h-10 w-10 cursor-pointer rounded border border-gray-300 p-0.5" aria-label="Cor da faixa" />
            <Input label="Cor (hex)" value={form.cor} onChange={(e) => setForm((f) => ({ ...f, cor: e.target.value }))} className="font-mono" placeholder="#4F46E5" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModal(false)}>Cancelar</Button>
            <Button onClick={save} loading={saving} disabled={!form.nome.trim()}>Salvar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
