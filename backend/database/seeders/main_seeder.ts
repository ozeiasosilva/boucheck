import { BaseSeeder } from '@adonisjs/lucid/seeders'
import hash from '@adonisjs/core/services/hash'
import AdminUser from '#models/admin_user'
import Category from '#models/category'
import Survey from '#models/survey'
import Question from '#models/question'
import QuestionOption from '#models/question_option'
import QuestionRule from '#models/question_rule'
import ChecklistItem from '#models/checklist_item'
import ScoreRange from '#models/score_range'
import SystemAdminUserSeeder from './system_admin_user_seeder.js'

/**
 * Main seeder that orchestrates all sub-seeders in dependency order.
 * Uses `updateOrCreate` on natural/deterministic keys for idempotency.
 *
 * Running this seeder multiple times yields the same database state.
 */
export default class MainSeeder extends BaseSeeder {
  async run() {
    // 0. System admin user (reserved for service-level actions)
    const systemSeeder = new SystemAdminUserSeeder(this.client)
    await systemSeeder.run()

    // 1. Admin user
    const admin = await this.seedAdmin()

    // 2. Category
    const category = await this.seedCategory()

    // 3. Demonstration survey
    const survey = await this.seedSurvey(category.id, admin.id)

    // 4. Questions (≥8, covering all three `tipo` values)
    const questions = await this.seedQuestions(survey.id, survey.version)

    // 5. Options with scoring for choice-type questions
    const options = await this.seedOptions(questions)

    // 6. Cascade rules (skip-ahead + early-termination)
    await this.seedRules(options, questions)

    // 7. Checklist items covering all three `grupo` values
    await this.seedChecklistItems(survey.id)

    // 8. Score ranges (non-overlapping)
    await this.seedScoreRanges(survey.id)
  }

  private async seedAdmin(): Promise<AdminUser> {
    const passwordHash = await hash.make('admin123')

    return AdminUser.updateOrCreate(
      { email: 'admin@boucheck.local' },
      {
        nome: 'Administrador BouCheck',
        passwordHash,
        role: 'admin',
        ativo: true,
        mustChangePassword: true,
      }
    )
  }

  private async seedCategory(): Promise<Category> {
    return Category.updateOrCreate(
      { nome: 'Maturidade em Cloud' },
      {}
    )
  }

  private async seedSurvey(categoriaId: number, createdBy: number): Promise<Survey> {
    return Survey.updateOrCreate(
      { slug: 'maturidade-cloud' },
      {
        nome: 'Pesquisa de Maturidade em Cloud',
        categoriaId,
        status: 'ativo',
        version: 1,
        configVisual: {
          cor_primaria: '#1A73E8',
          cor_secundaria: '#4285F4',
          cor_fundo: '#F8F9FA',
          logo_s3_key: 'logos/boucheck-default.png',
        },
        usarIaNoRelatorio: false,
        createdBy,
      }
    )
  }

  private async seedQuestions(
    surveyId: number,
    surveyVersion: number
  ): Promise<Question[]> {
    const questionData: Array<{
      texto: string
      tipo: 'escolha_unica' | 'multipla_escolha' | 'aberta'
      ordem: number
      peso: number
      dimensao: string | null
    }> = [
      // escolha_unica (3)
      {
        texto: 'Qual o nível atual de adoção de serviços em nuvem na sua organização?',
        tipo: 'escolha_unica',
        ordem: 1,
        peso: 1,
        dimensao: 'Adoção',
      },
      {
        texto: 'Como a governança de cloud é estruturada na empresa?',
        tipo: 'escolha_unica',
        ordem: 2,
        peso: 1,
        dimensao: 'Governança',
      },
      {
        texto: 'Qual modelo de responsabilidade compartilhada é aplicado?',
        tipo: 'escolha_unica',
        ordem: 3,
        peso: 1,
        dimensao: 'Segurança',
      },
      // multipla_escolha (3)
      {
        texto: 'Quais provedores de nuvem a organização utiliza atualmente?',
        tipo: 'multipla_escolha',
        ordem: 4,
        peso: 1,
        dimensao: 'Infraestrutura',
      },
      {
        texto: 'Quais práticas de DevOps estão implementadas?',
        tipo: 'multipla_escolha',
        ordem: 5,
        peso: 1,
        dimensao: 'DevOps',
      },
      {
        texto: 'Quais certificações de cloud a equipe possui?',
        tipo: 'multipla_escolha',
        ordem: 6,
        peso: 1,
        dimensao: 'Capacitação',
      },
      // aberta (3)
      {
        texto: 'Descreva os principais desafios enfrentados na migração para cloud.',
        tipo: 'aberta',
        ordem: 7,
        peso: 1,
        dimensao: 'Desafios',
      },
      {
        texto: 'Quais são os próximos passos planejados para a estratégia de cloud?',
        tipo: 'aberta',
        ordem: 8,
        peso: 1,
        dimensao: 'Estratégia',
      },
      {
        texto: 'Há algum comentário adicional sobre a maturidade cloud da organização?',
        tipo: 'aberta',
        ordem: 9,
        peso: 1,
        dimensao: null,
      },
    ]

    const questions: Question[] = []
    for (const q of questionData) {
      const question = await Question.updateOrCreate(
        { surveyId, texto: q.texto },
        {
          surveyVersion,
          tipo: q.tipo,
          obrigatoria: true,
          ordem: q.ordem,
          peso: q.peso,
          dimensao: q.dimensao,
        }
      )
      questions.push(question)
    }
    return questions
  }

  private async seedOptions(
    questions: Question[]
  ): Promise<Map<number, QuestionOption[]>> {
    const optionsMap = new Map<number, QuestionOption[]>()

    // Options for choice-type questions (escolha_unica + multipla_escolha)
    const choiceQuestions = questions.filter(
      (q) => q.tipo === 'escolha_unica' || q.tipo === 'multipla_escolha'
    )

    const optionSets: Record<string, Array<{ texto: string; pontuacao: number }>> = {
      // Q1 - escolha_unica: Adoção
      'Qual o nível atual de adoção de serviços em nuvem na sua organização?': [
        { texto: 'Nenhuma adoção — totalmente on-premise', pontuacao: 0 },
        { texto: 'Experimentação — poucos workloads em cloud', pontuacao: 25 },
        { texto: 'Parcial — mix de on-premise e cloud', pontuacao: 50 },
        { texto: 'Majoritária — maior parte em cloud', pontuacao: 75 },
        { texto: 'Cloud-native — tudo em cloud', pontuacao: 100 },
      ],
      // Q2 - escolha_unica: Governança
      'Como a governança de cloud é estruturada na empresa?': [
        { texto: 'Inexistente', pontuacao: 0 },
        { texto: 'Informal — iniciativas isoladas', pontuacao: 25 },
        { texto: 'Em construção — políticas parciais', pontuacao: 50 },
        { texto: 'Estabelecida — CCoE ativo', pontuacao: 75 },
        { texto: 'Otimizada — FinOps e automação', pontuacao: 100 },
      ],
      // Q3 - escolha_unica: Segurança
      'Qual modelo de responsabilidade compartilhada é aplicado?': [
        { texto: 'Desconhecido pela equipe', pontuacao: 0 },
        { texto: 'Conhecido mas não formalizado', pontuacao: 33 },
        { texto: 'Formalizado com controles parciais', pontuacao: 66 },
        { texto: 'Totalmente implementado e auditado', pontuacao: 100 },
      ],
      // Q4 - multipla_escolha: Provedores
      'Quais provedores de nuvem a organização utiliza atualmente?': [
        { texto: 'AWS', pontuacao: 25 },
        { texto: 'Azure', pontuacao: 25 },
        { texto: 'Google Cloud', pontuacao: 25 },
        { texto: 'Oracle Cloud', pontuacao: 15 },
        { texto: 'Nenhum', pontuacao: 0 },
      ],
      // Q5 - multipla_escolha: DevOps
      'Quais práticas de DevOps estão implementadas?': [
        { texto: 'CI/CD', pontuacao: 25 },
        { texto: 'Infrastructure as Code', pontuacao: 25 },
        { texto: 'Monitoramento e observabilidade', pontuacao: 25 },
        { texto: 'Containers e orquestração', pontuacao: 25 },
        { texto: 'Nenhuma', pontuacao: 0 },
      ],
      // Q6 - multipla_escolha: Certificações
      'Quais certificações de cloud a equipe possui?': [
        { texto: 'AWS Certified (qualquer nível)', pontuacao: 25 },
        { texto: 'Azure Certified (qualquer nível)', pontuacao: 25 },
        { texto: 'Google Cloud Certified', pontuacao: 25 },
        { texto: 'Kubernetes (CKA/CKAD)', pontuacao: 25 },
        { texto: 'Nenhuma certificação', pontuacao: 0 },
      ],
    }

    for (const question of choiceQuestions) {
      const opts = optionSets[question.texto]
      if (!opts) continue

      const questionOptions: QuestionOption[] = []
      for (let i = 0; i < opts.length; i++) {
        const opt = opts[i]
        const option = await QuestionOption.updateOrCreate(
          { questionId: question.id, texto: opt.texto },
          {
            pontuacao: opt.pontuacao,
            ordem: i + 1,
          }
        )
        questionOptions.push(option)
      }
      optionsMap.set(question.id, questionOptions)
    }

    return optionsMap
  }

  private async seedRules(
    optionsMap: Map<number, QuestionOption[]>,
    questions: Question[]
  ): Promise<void> {
    // Find specific questions by ordem for rule targets
    const q1 = questions.find((q) => q.ordem === 1)!
    const q4 = questions.find((q) => q.ordem === 4)!
    const q7 = questions.find((q) => q.ordem === 7)!

    const q1Options = optionsMap.get(q1.id) || []

    // Rule 1: Skip-ahead — if Q1 answer is "Cloud-native", skip to Q7 (open question)
    const cloudNativeOption = q1Options.find((o) =>
      o.texto.includes('Cloud-native')
    )
    if (cloudNativeOption) {
      await QuestionRule.updateOrCreate(
        { questionOptionId: cloudNativeOption.id, nextQuestionId: q7.id },
        {
          finalizar: false,
          priority: 1,
        }
      )
    }

    // Rule 2: Early-termination — if Q1 answer is "Nenhuma adoção", end survey early
    const noAdoptionOption = q1Options.find((o) =>
      o.texto.includes('Nenhuma adoção')
    )
    if (noAdoptionOption) {
      await QuestionRule.updateOrCreate(
        { questionOptionId: noAdoptionOption.id, finalizar: true },
        {
          nextQuestionId: null,
          priority: 1,
        }
      )
    }

    // Additional skip-ahead rule on Q4 for coverage
    const q4Options = optionsMap.get(q4.id) || []
    const noneProviderOption = q4Options.find((o) =>
      o.texto.includes('Nenhum')
    )
    if (noneProviderOption) {
      await QuestionRule.updateOrCreate(
        { questionOptionId: noneProviderOption.id, nextQuestionId: q7.id },
        {
          finalizar: false,
          priority: 1,
        }
      )
    }
  }

  private async seedChecklistItems(surveyId: number): Promise<void> {
    const items: Array<{
      nome: string
      grupo: 'servico_cloud' | 'fabricante' | 'solucao'
    }> = [
      { nome: 'Amazon EC2', grupo: 'servico_cloud' },
      { nome: 'Amazon S3', grupo: 'servico_cloud' },
      { nome: 'AWS', grupo: 'fabricante' },
      { nome: 'Microsoft Azure', grupo: 'fabricante' },
      { nome: 'Migração lift-and-shift', grupo: 'solucao' },
      { nome: 'Refatoração para containers', grupo: 'solucao' },
    ]

    for (const item of items) {
      await ChecklistItem.updateOrCreate(
        { surveyId, nome: item.nome },
        { grupo: item.grupo }
      )
    }
  }

  private async seedScoreRanges(surveyId: number): Promise<void> {
    const ranges: Array<{
      nome: string
      min: number
      max: number
      descricao: string
      cor: string
    }> = [
      {
        nome: 'Iniciante',
        min: 0,
        max: 49,
        descricao:
          'A organização está no início da jornada de cloud. Recomenda-se investir em capacitação e definir uma estratégia de migração.',
        cor: '#E53935',
      },
      {
        nome: 'Avançado',
        min: 50,
        max: 100,
        descricao:
          'A organização possui boa maturidade em cloud. Foco em otimização de custos e práticas avançadas de governança.',
        cor: '#43A047',
      },
    ]

    for (const range of ranges) {
      await ScoreRange.updateOrCreate(
        { surveyId, nome: range.nome },
        {
          min: range.min,
          max: range.max,
          descricao: range.descricao,
          cor: range.cor,
        }
      )
    }
  }
}
