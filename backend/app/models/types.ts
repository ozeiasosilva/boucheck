// app/models/types.ts
export type SurveyStatus = 'rascunho' | 'ativo' | 'inativo' | 'arquivado'
export type QuestionTipo = 'escolha_unica' | 'multipla_escolha' | 'aberta'
export type ChecklistGrupo = 'servico_cloud' | 'fabricante' | 'solucao'
export type ResponseStatus = 'iniciado' | 'completo'

export type SurveyTema = 'claro' | 'escuro'

export interface ConfigVisual {
  cor_primaria?: string
  cor_secundaria?: string
  cor_fundo?: string
  logo_s3_key?: string
  tema?: SurveyTema
}
