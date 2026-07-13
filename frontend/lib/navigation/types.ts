export interface SurveyStructure {
  survey_id: number
  survey_version: number
  questions: Question[]
  has_checklist: boolean
}

export interface Question {
  id: number
  texto: string
  descricao: string | null
  tipo: 'escolha_unica' | 'multipla_escolha' | 'aberta'
  obrigatoria: boolean
  ordem: number
  options: Option[]
}

export interface Option {
  id: number
  texto: string
  ordem: number
  rules: Rule[]
}

export interface Rule {
  next_question_id: number | null
  finalizar: boolean
  priority: number
}

export interface Answer {
  questionId: number
  selectedOptionIds: number[] // empty for aberta
  textoLivre: string | null // null for choice types
}

export interface NavigationState {
  currentQuestionId: number
  answeredPath: number[] // ordered list of visited question IDs
  answers: Map<number, Answer>
  progress: number // 0-100
}
