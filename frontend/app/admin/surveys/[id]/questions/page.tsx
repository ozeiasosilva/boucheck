'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import {
  surveysApi, questionsApi, optionsApi, rulesApi, aiApi,
  type Question, type QuestionOption, type QuestionRule, type AiQuestion, type Survey,
  AdminApiError,
} from '@/lib/admin/api'
import { Button } from '@/components/admin/ui/button'
import { Input, Textarea, Select } from '@/components/admin/ui/input'
import { Modal } from '@/components/admin/ui/modal'
import { useToast } from '@/components/admin/ui/toast'
import { Badge } from '@/components/admin/ui/badge'
import { ConfirmVersionDialog } from '@/components/admin/ui/confirm-version-dialog'

type QuestionForm = {
  texto: string; descricao: string; tipo: Question['tipo']
  obrigatoria: boolean; peso: string; dimensao: string
}

const emptyQForm = (): QuestionForm => ({
  texto: '', descricao: '', tipo: 'escolha_unica',
  obrigatoria: true, peso: '1', dimensao: '',
})

export default function QuestionsPage() {
  const { id } = useParams<{ id: string }>()
  const { toast } = useToast()
  const [survey, setSurvey] = useState<Survey | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)

  // Add/edit question modal
  const [qModal, setQModal] = useState(false)
  const [editQ, setEditQ] = useState<Question | null>(null)
  const [qForm, setQForm] = useState<QuestionForm>(emptyQForm())
  const [qSaving, setQSaving] = useState(false)

  // Options management
  const [optModal, setOptModal] = useState<Question | null>(null)
  const [optForm, setOptForm] = useState({ texto: '', pontuacao: '0' })
  const [editOpt, setEditOpt] = useState<QuestionOption | null>(null)
  const [optSaving, setOptSaving] = useState(false)

  // Rule management
  const [ruleModal, setRuleModal] = useState<{ question: Question; option: QuestionOption } | null>(null)
  const [ruleForm, setRuleForm] = useState({ next_question_id: '', finalizar: false, priority: '1' })
  const [ruleSaving, setRuleSaving] = useState(false)

  // AI generation
  const [aiModal, setAiModal] = useState(false)
  const [aiForm, setAiForm] = useState({ tema: '', quantidade: '5', publico_alvo: '', tipos: 'escolha_unica,multipla_escolha,aberta' })
  const [aiLoading, setAiLoading] = useState(false)
  const [aiPreview, setAiPreview] = useState<AiQuestion[]>([])
  const [aiConfirming, setAiConfirming] = useState(false)

  // Version confirmation dialog
  const [versionDialog, setVersionDialog] = useState(false)
  const [versionLoading, setVersionLoading] = useState(false)
  const [pendingConfirmAction, setPendingConfirmAction] = useState<(() => Promise<void>) | null>(null)

  function requestVersionConfirm(action: () => Promise<void>) {
    setPendingConfirmAction(() => action)
    setVersionDialog(true)
  }

  async function handleVersionConfirm() {
    if (!pendingConfirmAction) return
    setVersionLoading(true)
    try {
      await pendingConfirmAction()
    } finally {
      setVersionLoading(false)
      setVersionDialog(false)
      setPendingConfirmAction(null)
    }
  }

  function handleVersionCancel() {
    setVersionDialog(false)
    setPendingConfirmAction(null)
  }

  const loadSurvey = useCallback(async () => {
    try {
      const s = await surveysApi.get(Number(id))
      setSurvey(s)
      const list = await questionsApi.list(Number(id))
      setQuestions(list)
    } catch {
      toast('Erro ao carregar perguntas.', 'error')
    } finally {
      setLoading(false)
    }
  }, [id, toast])

  useEffect(() => { loadSurvey() }, [loadSurvey])

  // ── Question CRUD ──────────────────────────────────────────────────────────
  function openAddQuestion() { setEditQ(null); setQForm(emptyQForm()); setQModal(true) }
  function openEditQuestion(q: Question) {
    setEditQ(q)
    setQForm({ texto: q.texto, descricao: q.descricao ?? '', tipo: q.tipo, obrigatoria: q.obrigatoria, peso: String(q.peso), dimensao: q.dimensao ?? '' })
    setQModal(true)
  }

  async function saveQuestion(confirmed = false) {
    setQSaving(true)
    try {
      const payload = { texto: qForm.texto, descricao: qForm.descricao || null, tipo: qForm.tipo, obrigatoria: qForm.obrigatoria, peso: Number(qForm.peso), dimensao: qForm.dimensao || null, confirmed }
      if (editQ) {
        await questionsApi.update(editQ.id, payload)
      } else {
        await questionsApi.store(Number(id), { ...payload, ordem: questions.length + 1 })
      }
      toast(editQ ? 'Pergunta atualizada!' : 'Pergunta adicionada!', 'success')
      setQModal(false)
      loadSurvey()
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 409 && !confirmed) {
        requestVersionConfirm(() => saveQuestion(true))
      } else {
        toast(err instanceof AdminApiError ? err.message : 'Erro ao salvar pergunta.', 'error')
      }
    } finally { setQSaving(false) }
  }

  async function deleteQuestion(q: Question, confirmed = false) {
    if (!confirmed && !confirm(`Excluir "${q.texto.slice(0, 60)}"?`)) return
    try {
      await questionsApi.delete(q.id, confirmed)
      toast('Pergunta excluída.', 'success')
      loadSurvey()
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 409 && !confirmed) {
        requestVersionConfirm(() => deleteQuestion(q, true))
      } else {
        toast(err instanceof AdminApiError ? err.message : 'Erro ao excluir.', 'error')
      }
    }
  }

  async function moveQuestion(q: Question, dir: 'up' | 'down', confirmed = false) {
    const sorted = [...questions].sort((a, b) => a.ordem - b.ordem)
    const idx = sorted.findIndex((x) => x.id === q.id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const order = sorted.map((x, i) => {
      if (i === idx) return { id: x.id, ordem: sorted[swapIdx].ordem }
      if (i === swapIdx) return { id: x.id, ordem: sorted[idx].ordem }
      return { id: x.id, ordem: x.ordem }
    })
    try {
      await questionsApi.reorder(Number(id), order, confirmed)
      loadSurvey()
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 409 && !confirmed) {
        requestVersionConfirm(() => moveQuestion(q, dir, true))
      } else {
        toast('Erro ao reordenar.', 'error')
      }
    }
  }

  // ── Option CRUD ────────────────────────────────────────────────────────────
  function openOptModal(q: Question, opt?: QuestionOption) {
    setOptModal(q)
    setEditOpt(opt ?? null)
    setOptForm(opt ? { texto: opt.texto, pontuacao: String(opt.pontuacao) } : { texto: '', pontuacao: '0' })
  }

  async function saveOption(confirmed = false) {
    if (!optModal) return
    setOptSaving(true)
    try {
      const payload = { texto: optForm.texto, pontuacao: Number(optForm.pontuacao), confirmed }
      if (editOpt) {
        await optionsApi.update(editOpt.id, payload)
      } else {
        await optionsApi.store(optModal.id, { ...payload, ordem: (optModal.options?.length ?? 0) + 1 })
      }
      toast(editOpt ? 'Opção atualizada!' : 'Opção adicionada!', 'success')
      setEditOpt(null)
      setOptForm({ texto: '', pontuacao: '0' })
      loadSurvey()
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 409 && !confirmed) {
        requestVersionConfirm(() => saveOption(true))
      } else {
        toast(err instanceof AdminApiError ? err.message : 'Erro ao salvar opção.', 'error')
      }
    } finally { setOptSaving(false) }
  }

  async function deleteOption(opt: QuestionOption, confirmed = false) {
    if (!confirmed && !confirm(`Excluir opção "${opt.texto}"?`)) return
    try {
      await optionsApi.delete(opt.id, confirmed)
      loadSurvey()
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 409 && !confirmed) {
        requestVersionConfirm(() => deleteOption(opt, true))
      } else {
        toast('Erro ao excluir opção.', 'error')
      }
    }
  }

  // ── Rule CRUD ──────────────────────────────────────────────────────────────
  function openRuleModal(question: Question, option: QuestionOption) {
    setRuleModal({ question, option })
    const r = option.rule
    setRuleForm({ next_question_id: r?.next_question_id ? String(r.next_question_id) : '', finalizar: r?.finalizar ?? false, priority: r ? String(r.priority) : '1' })
  }

  async function saveRule(confirmed = false) {
    if (!ruleModal) return
    setRuleSaving(true)
    try {
      const opt = ruleModal.option
      const payload = { question_option_id: opt.id, next_question_id: ruleForm.finalizar ? null : (ruleForm.next_question_id ? Number(ruleForm.next_question_id) : null), finalizar: ruleForm.finalizar, priority: Number(ruleForm.priority), confirmed }
      if (opt.rule?.id) {
        await rulesApi.update(opt.rule.id, payload)
      } else {
        await rulesApi.store(payload)
      }
      toast('Regra salva!', 'success')
      setRuleModal(null)
      loadSurvey()
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 409 && !confirmed) {
        requestVersionConfirm(() => saveRule(true))
      } else {
        toast(err instanceof AdminApiError ? err.message : 'Erro ao salvar regra.', 'error')
      }
    } finally { setRuleSaving(false) }
  }

  async function deleteRule(rule: QuestionRule) {
    try {
      await rulesApi.delete(rule.id)
      loadSurvey()
    } catch { toast('Erro ao excluir regra.', 'error') }
  }

  // ── AI Generation ──────────────────────────────────────────────────────────
  async function handleAiGenerate() {
    setAiLoading(true)
    setAiPreview([])
    try {
      const result = await aiApi.generate(Number(id), {
        tema: aiForm.tema,
        quantidade: Number(aiForm.quantidade),
        tipos: aiForm.tipos.split(',').filter(Boolean),
        publico_alvo: aiForm.publico_alvo,
      })
      setAiPreview(result.questions)
    } catch (err) {
      toast(err instanceof AdminApiError ? err.message : 'Erro ao gerar perguntas com IA.', 'error')
    } finally { setAiLoading(false) }
  }

  async function handleAiConfirm() {
    setAiConfirming(true)
    try {
      const result = await aiApi.confirm(Number(id), aiPreview)
      toast(`${result.created} pergunta(s) adicionada(s) com sucesso!`, 'success')
      setAiModal(false)
      setAiPreview([])
      loadSurvey()
    } catch (err) {
      toast(err instanceof AdminApiError ? err.message : 'Erro ao confirmar perguntas.', 'error')
    } finally { setAiConfirming(false) }
  }

  const sorted = [...questions].sort((a, b) => a.ordem - b.ordem)

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-gray-400">
      <svg className="h-5 w-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      Carregando...
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-500">{sorted.length} pergunta{sorted.length !== 1 ? 's' : ''}</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setAiModal(true)}>
            <SparkleIcon /> Gerar com IA
          </Button>
          <Button onClick={openAddQuestion}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Adicionar pergunta
          </Button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
          <p className="text-gray-400 mb-3">Nenhuma pergunta ainda.</p>
          <Button variant="secondary" onClick={openAddQuestion}>Adicionar primeira pergunta</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {sorted.map((q, idx) => (
            <div key={q.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start gap-3">
                {/* Order controls */}
                <div className="flex flex-col gap-0.5 mt-0.5">
                  <button onClick={() => moveQuestion(q, 'up')} disabled={idx === 0} className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-30" aria-label="Mover para cima">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
                  </button>
                  <span className="text-xs text-gray-400 text-center w-4">{q.ordem}</span>
                  <button onClick={() => moveQuestion(q, 'down')} disabled={idx === sorted.length - 1} className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-30" aria-label="Mover para baixo">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                  </button>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{q.texto}</p>
                      {q.descricao && <p className="text-sm text-gray-500 mt-0.5">{q.descricao}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="gray">{typeLabel(q.tipo)}</Badge>
                      {q.obrigatoria ? <Badge variant="indigo">Obrigatória</Badge> : <Badge variant="gray">Opcional</Badge>}
                      {q.dimensao && <Badge variant="blue">{q.dimensao}</Badge>}
                      <span className="text-xs text-gray-400">peso {q.peso}</span>
                    </div>
                  </div>

                  {/* Options */}
                  {q.tipo !== 'aberta' && (
                    <div className="mt-3 space-y-1.5">
                      {(q.options ?? []).map((opt) => (
                        <div key={opt.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 group">
                          <span className="flex-1 text-sm text-gray-700">{opt.texto}</span>
                          <span className="text-xs text-gray-400">pts: {opt.pontuacao}</span>
                          {opt.rule && (
                            <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">
                              {opt.rule.finalizar ? '→ Finalizar' : `→ Q${opt.rule.next_question_id}`}
                            </span>
                          )}
                          <button onClick={() => openRuleModal(q, opt)} className="opacity-0 group-hover:opacity-100 text-xs text-indigo-500 hover:text-indigo-700 px-1" title="Configurar regra">regra</button>
                          <button onClick={() => openOptModal(q, opt)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-700" aria-label="Editar opção">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button onClick={() => deleteOption(opt)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500" aria-label="Excluir opção">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      ))}
                      <button onClick={() => openOptModal(q)} className="text-xs text-indigo-600 hover:text-indigo-700 hover:underline mt-1">
                        + Adicionar opção
                      </button>
                    </div>
                  )}
                </div>

                {/* Question actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => openEditQuestion(q)}>Editar</Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteQuestion(q)}>
                    <svg className="h-4 w-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add/Edit Question Modal ── */}
      <Modal open={qModal} onClose={() => setQModal(false)} title={editQ ? 'Editar pergunta' : 'Nova pergunta'} size="lg">
        <div className="space-y-4">
          <Textarea label="Texto da pergunta" value={qForm.texto} onChange={(e) => setQForm((f) => ({ ...f, texto: e.target.value }))} rows={3} maxLength={500} required />
          <Textarea label="Descrição de apoio (opcional)" value={qForm.descricao} onChange={(e) => setQForm((f) => ({ ...f, descricao: e.target.value }))} rows={2} maxLength={300} />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Tipo" value={qForm.tipo} onChange={(e) => setQForm((f) => ({ ...f, tipo: e.target.value as Question['tipo'] }))}>
              <option value="escolha_unica">Escolha única</option>
              <option value="multipla_escolha">Múltipla escolha</option>
              <option value="aberta">Aberta</option>
            </Select>
            <Input label="Peso para pontuação" type="number" min={0} step="0.1" value={qForm.peso} onChange={(e) => setQForm((f) => ({ ...f, peso: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Dimensão (opcional)" value={qForm.dimensao} onChange={(e) => setQForm((f) => ({ ...f, dimensao: e.target.value }))} placeholder="Ex: Segurança" hint="Para gráfico radar no relatório." />
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">Obrigatoriedade</span>
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input type="checkbox" checked={qForm.obrigatoria} onChange={(e) => setQForm((f) => ({ ...f, obrigatoria: e.target.checked }))} className="h-4 w-4 rounded border-gray-300 text-indigo-600" />
                <span className="text-sm text-gray-600">Pergunta obrigatória</span>
              </label>
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setQModal(false)}>Cancelar</Button>
            <Button onClick={() => saveQuestion()} loading={qSaving} disabled={!qForm.texto.trim()}>Salvar</Button>
          </div>
        </div>
      </Modal>

      {/* ── Option Modal ── */}
      <Modal open={!!optModal} onClose={() => { setOptModal(null); setEditOpt(null) }} title={editOpt ? 'Editar opção' : `Adicionar opção${optModal ? ` em "${optModal.texto.slice(0, 40)}"` : ''}`}>
        <div className="space-y-4">
          <Input label="Texto da opção" value={optForm.texto} onChange={(e) => setOptForm((f) => ({ ...f, texto: e.target.value }))} required />
          <Input label="Pontuação" type="number" min={0} step="0.5" value={optForm.pontuacao} onChange={(e) => setOptForm((f) => ({ ...f, pontuacao: e.target.value }))} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setOptModal(null); setEditOpt(null) }}>Cancelar</Button>
            <Button onClick={() => saveOption()} loading={optSaving} disabled={!optForm.texto.trim()}>Salvar</Button>
          </div>
        </div>
      </Modal>

      {/* ── Rule Modal ── */}
      <Modal open={!!ruleModal} onClose={() => setRuleModal(null)} title={`Regra para "${ruleModal?.option.texto ?? ''}"`}>
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Quando esta opção for selecionada, o respondente vai para:</p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={ruleForm.finalizar} onChange={(e) => setRuleForm((f) => ({ ...f, finalizar: e.target.checked }))} className="h-4 w-4 rounded border-gray-300 text-indigo-600" />
            <span className="text-sm font-medium text-gray-700">Finalizar survey (encerramento antecipado)</span>
          </label>
          {!ruleForm.finalizar && (
            <Select label="Próxima pergunta" value={ruleForm.next_question_id} onChange={(e) => setRuleForm((f) => ({ ...f, next_question_id: e.target.value }))}>
              <option value="">Fluxo padrão (próxima na ordem)</option>
              {sorted.filter((q) => q.id !== ruleModal?.question.id && q.ordem > (ruleModal?.question.ordem ?? 0)).map((q) => (
                <option key={q.id} value={q.id}>{q.ordem}. {q.texto.slice(0, 60)}</option>
              ))}
            </Select>
          )}
          <Input label="Prioridade (menor = maior prioridade)" type="number" min={1} value={ruleForm.priority} onChange={(e) => setRuleForm((f) => ({ ...f, priority: e.target.value }))} hint="Usado em múltipla escolha com conflito de regras." />
          <div className="flex items-center justify-between pt-2">
            {ruleModal?.option.rule && (
              <Button variant="danger" size="sm" onClick={() => { deleteRule(ruleModal.option.rule!); setRuleModal(null) }}>Remover regra</Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="secondary" onClick={() => setRuleModal(null)}>Cancelar</Button>
              <Button onClick={() => saveRule()} loading={ruleSaving}>Salvar regra</Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── AI Modal ── */}
      <Modal open={aiModal} onClose={() => { setAiModal(false); setAiPreview([]) }} title="Gerar perguntas com IA" size="xl">
        {aiPreview.length === 0 ? (
          <div className="space-y-4">
            <Textarea label="Tema / contexto" value={aiForm.tema} onChange={(e) => setAiForm((f) => ({ ...f, tema: e.target.value }))} rows={3} required placeholder="Ex: Maturidade de observabilidade em times de engenharia" />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Quantidade" type="number" min={1} max={20} value={aiForm.quantidade} onChange={(e) => setAiForm((f) => ({ ...f, quantidade: e.target.value }))} />
              <Input label="Público-alvo" value={aiForm.publico_alvo} onChange={(e) => setAiForm((f) => ({ ...f, publico_alvo: e.target.value }))} placeholder="Ex: CTO, tech lead" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setAiModal(false)}>Cancelar</Button>
              <Button onClick={handleAiGenerate} loading={aiLoading} disabled={!aiForm.tema.trim()}>
                <SparkleIcon /> Gerar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">{aiPreview.length} pergunta(s) gerada(s). Revise antes de confirmar.</p>
            <div className="max-h-[50vh] overflow-y-auto space-y-3 pr-1">
              {aiPreview.map((q, i) => (
                <div key={i} className="p-3 rounded-lg border border-gray-200 bg-gray-50">
                  <div className="flex items-start justify-between gap-2">
                    <input
                      className="flex-1 bg-transparent font-medium text-gray-900 focus:outline-none text-sm"
                      value={q.texto}
                      onChange={(e) => {
                        const updated = [...aiPreview]
                        updated[i] = { ...updated[i], texto: e.target.value }
                        setAiPreview(updated)
                      }}
                    />
                    <button onClick={() => setAiPreview((prev) => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500" aria-label="Remover">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <div className="flex gap-2 mt-1.5 flex-wrap">
                    <Badge variant="gray">{typeLabel(q.tipo)}</Badge>
                    {q.obrigatoria ? <Badge variant="indigo">Obrigatória</Badge> : <Badge variant="gray">Opcional</Badge>}
                    {q.tipo !== 'aberta' && <span className="text-xs text-gray-400">{q.opcoes?.length ?? 0} opções</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="secondary" onClick={() => setAiPreview([])}>← Gerar novamente</Button>
              <Button onClick={handleAiConfirm} loading={aiConfirming}>
                Confirmar e adicionar {aiPreview.length} pergunta(s)
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Version Confirmation Dialog ── */}
      <ConfirmVersionDialog
        open={versionDialog}
        onConfirm={handleVersionConfirm}
        onCancel={handleVersionCancel}
        loading={versionLoading}
      />
    </div>
  )
}

function typeLabel(tipo: Question['tipo']): string {
  return { escolha_unica: 'Escolha única', multipla_escolha: 'Múltipla escolha', aberta: 'Aberta' }[tipo] ?? tipo
}

const SparkleIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
)
