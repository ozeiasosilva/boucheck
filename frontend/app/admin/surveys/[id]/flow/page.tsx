'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { rulesApi, type Question, type QuestionOption, type QuestionRule } from '@/lib/admin/api'
import { useToast } from '@/components/admin/ui/toast'

interface FlowBranch {
  rule_id: number
  option_id: number
  option_texto: string
  priority: number
  kind: 'goto' | 'finalizar'
  next_question_id: number | null
  invalid: boolean
}

interface FlowNode {
  question_id: number
  ordem: number
  texto: string
  tipo: 'escolha_unica' | 'multipla_escolha' | 'aberta'
  depth: number
  branches: FlowBranch[]
}

interface FlowData {
  nodes: FlowNode[]
}

export default function FlowPage() {
  const { id } = useParams<{ id: string }>()
  const { toast } = useToast()
  const [flow, setFlow] = useState<FlowData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    rulesApi.flow(Number(id))
      .then((data) => setFlow(data as FlowData))
      .catch(() => toast('Erro ao carregar fluxo.', 'error'))
      .finally(() => setLoading(false))
  }, [id, toast])

  if (loading) return <div className="text-center py-12 text-gray-400">Carregando...</div>
  if (!flow) return null

  const nodes = [...(flow.nodes ?? [])].sort((a, b) => a.ordem - b.ordem)
  const nodeMap = new Map(nodes.map((n) => [n.question_id, n]))

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-semibold text-gray-900">Visualização do fluxo</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Lista indentada mostrando os desvios configurados. Opções sem regra seguem a ordem padrão.
        </p>
      </div>

      {nodes.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
          <p className="text-gray-400">Nenhuma pergunta cadastrada.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {nodes.map((node, idx) => (
            <div key={node.question_id} className="p-5">
              {/* Question */}
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-sm font-bold flex items-center justify-center">
                  {node.ordem}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900">{node.texto}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {node.tipo === 'escolha_unica' ? 'Escolha única' : node.tipo === 'multipla_escolha' ? 'Múltipla escolha' : 'Aberta'}
                  </p>

                  {/* Branches (rules) */}
                  {node.branches.length > 0 && (
                    <div className="mt-3 ml-3 space-y-1.5">
                      {node.branches.map((branch) => {
                        const targetNode = branch.next_question_id ? nodeMap.get(branch.next_question_id) : null
                        return (
                          <div key={branch.rule_id} className={`flex items-center gap-2 text-sm ${branch.invalid ? 'opacity-50' : ''}`}>
                            <span className="text-gray-400">▸</span>
                            <span className="text-gray-700">{branch.option_texto}</span>
                            <span className="ml-1 flex items-center gap-1 text-xs">
                              <span className="text-indigo-400">→</span>
                              {branch.kind === 'finalizar' ? (
                                <span className="bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-medium">Finalizar</span>
                              ) : targetNode ? (
                                <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">
                                  Q{targetNode.ordem}: {targetNode.texto.slice(0, 40)}{targetNode.texto.length > 40 ? '…' : ''}
                                </span>
                              ) : (
                                <span className="bg-yellow-50 text-yellow-700 px-1.5 py-0.5 rounded">Pergunta removida</span>
                              )}
                              {branch.priority !== 1 && (
                                <span className="text-gray-400">(prioridade {branch.priority})</span>
                              )}
                              {branch.invalid && (
                                <span className="bg-red-50 text-red-600 px-1.5 py-0.5 rounded text-xs">Inválida</span>
                              )}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Default next */}
                  {idx < nodes.length - 1 && (
                    <div className="mt-2 ml-3 text-xs text-gray-400 flex items-center gap-1">
                      <span>↓</span>
                      <span>Padrão: Q{nodes[idx + 1].ordem}: {nodes[idx + 1].texto.slice(0, 50)}</span>
                    </div>
                  )}
                  {idx === nodes.length - 1 && (
                    <div className="mt-2 ml-3 text-xs text-gray-400 flex items-center gap-1">
                      <span>↓</span>
                      <span>Checklist → Conclusão</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
