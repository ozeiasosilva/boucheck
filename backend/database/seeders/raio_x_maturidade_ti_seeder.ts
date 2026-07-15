import { BaseSeeder } from '@adonisjs/lucid/seeders'
import AdminUser from '#models/admin_user'
import Category from '#models/category'
import Survey from '#models/survey'
import Question from '#models/question'
import QuestionOption from '#models/question_option'
import QuestionRule from '#models/question_rule'
import ScoreRange from '#models/score_range'

/**
 * Seeder for the "Raio-X de Maturidade de TI" survey.
 *
 * Reproduces the full question bank from the original HTML assessment with:
 * - 8 dimensions/pillars: Perfil (unscored), Segurança, Continuidade,
 *   Infraestrutura, Capacidade, Monitoramento, Governança, LGPD, Fechamento (unscored)
 * - Conditional questions (cascade rules via showIf → QuestionRule skip-ahead)
 * - Scoring on 0-4 scale normalized to 0-100 per pillar
 * - 5 maturity levels (Inicial, Reativo, Definido, Gerenciado, Otimizado)
 *
 * Idempotent: uses `updateOrCreate` keyed on survey slug + question texto.
 */
export default class RaioXMaturidadeTiSeeder extends BaseSeeder {
  async run() {
    const admin = await AdminUser.query().where('role', 'admin').firstOrFail()
    const category = await this.seedCategory()
    const survey = await this.seedSurvey(category.id, admin.id)
    const questions = await this.seedQuestions(survey.id, survey.version)
    await this.seedOptions(questions)
    await this.seedCascadeRules(questions)
    await this.seedScoreRanges(survey.id)
  }

  private async seedCategory(): Promise<Category> {
    return Category.updateOrCreate(
      { nome: 'Maturidade em TI' },
      {}
    )
  }

  private async seedSurvey(categoriaId: number, createdBy: number): Promise<Survey> {
    return Survey.updateOrCreate(
      { slug: 'raio-x-maturidade-ti' },
      {
        nome: 'Raio-X de Maturidade de TI',
        categoriaId,
        status: 'ativo',
        version: 1,
        tempoEstimadoMin: 12,
        mensagemObjetivo:
          'Responda perguntas objetivas sobre o dia a dia da sua operação e receba um diagnóstico com gráfico de maturidade, nível da sua TI e os principais riscos identificados.',
        configVisual: {
          cor_primaria: '#0E7C86',
          cor_secundaria: '#16232E',
          cor_fundo: '#F3F6F7',
          logo_s3_key: 'logos/beonup-default.png',
          tema: 'claro',
        },
        linkAgendamento: null,
        emailNotificacao: 'contato@beonup.com.br',
        usarIaNoRelatorio: true,
        createdBy,
      }
    )
  }

  // ---------------------------------------------------------------------------
  // Questions — organized by pillar, preserving original order
  // ---------------------------------------------------------------------------

  private async seedQuestions(
    surveyId: number,
    surveyVersion: number
  ): Promise<Question[]> {
    const questions: Question[] = []
    let ordem = 0

    for (const qDef of QUESTION_DEFS) {
      ordem++
      const question = await Question.updateOrCreate(
        { surveyId, texto: qDef.texto },
        {
          surveyVersion,
          tipo: qDef.tipo,
          obrigatoria: true,
          ordem,
          peso: qDef.peso,
          dimensao: qDef.dimensao,
          descricao: qDef.descricao || null,
        }
      )
      questions.push(question)
    }

    return questions
  }

  // ---------------------------------------------------------------------------
  // Options — each option has a pontuacao matching the original HTML score
  // ---------------------------------------------------------------------------

  private async seedOptions(questions: Question[]): Promise<void> {
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i]
      const qDef = QUESTION_DEFS[i]

      if (qDef.tipo === 'aberta' || !qDef.options) continue

      for (let j = 0; j < qDef.options.length; j++) {
        const opt = qDef.options[j]
        await QuestionOption.updateOrCreate(
          { questionId: question.id, texto: opt.texto },
          { pontuacao: opt.pontuacao, ordem: j + 1 }
        )
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Cascade Rules — conditional question visibility via skip-ahead
  //
  // The HTML uses showIf/zeroIf functions. We model this with QuestionRule:
  // - When an option is selected that should SKIP dependent questions,
  //   we create a rule pointing to the next non-dependent question.
  // ---------------------------------------------------------------------------

  private async seedCascadeRules(questions: Question[]): Promise<void> {
    // Helper: find question by its ref ID (from QUESTION_DEFS)
    const qByRef = (ref: string) => {
      const idx = QUESTION_DEFS.findIndex((d) => d.ref === ref)
      return idx >= 0 ? questions[idx] : null
    }

    // Helper: find option by question ref + option letter
    const findOption = async (qRef: string, letter: string) => {
      const question = qByRef(qRef)
      if (!question) return null
      const qDef = QUESTION_DEFS.find((d) => d.ref === qRef)
      const optDef = qDef?.options?.find((o) => o.key === letter)
      if (!optDef) return null
      return QuestionOption.query()
        .where('questionId', question.id)
        .where('texto', optDef.texto)
        .first()
    }

    // --- BK-01 = "a" (Não/não sei) → skip BK-02..BK-05, go to BK-06 ---
    const bk01OptA = await findOption('BK-01', 'a')
    const bk06 = qByRef('BK-06')
    if (bk01OptA && bk06) {
      await QuestionRule.updateOrCreate(
        { questionOptionId: bk01OptA.id, nextQuestionId: bk06.id },
        { finalizar: false, priority: 1 }
      )
    }

    // --- SG-01: if answer is NOT "a" or "b", skip SG-01a ---
    // We model this inversely: SG-01 answer "c" or "d" → skip to SG-02
    const sg02 = qByRef('SG-02')
    for (const letter of ['c', 'd']) {
      const opt = await findOption('SG-01', letter)
      if (opt && sg02) {
        await QuestionRule.updateOrCreate(
          { questionOptionId: opt.id, nextQuestionId: sg02.id },
          { finalizar: false, priority: 1 }
        )
      }
    }

    // --- MN-01: if answer is "c" or "d", skip MN-02 → go to MN-03 ---
    const mn03 = qByRef('MN-03')
    for (const letter of ['c', 'd']) {
      const opt = await findOption('MN-01', letter)
      if (opt && mn03) {
        await QuestionRule.updateOrCreate(
          { questionOptionId: opt.id, nextQuestionId: mn03.id },
          { finalizar: false, priority: 1 }
        )
      }
    }

    // --- MN-02: if answer is "a" (Não/não sei), skip MN-03 → go to MN-04 ---
    const mn02OptA = await findOption('MN-02', 'a')
    const mn04 = qByRef('MN-04')
    if (mn02OptA && mn04) {
      await QuestionRule.updateOrCreate(
        { questionOptionId: mn02OptA.id, nextQuestionId: mn04.id },
        { finalizar: false, priority: 1 }
      )
    }
  }

  // ---------------------------------------------------------------------------
  // Score Ranges — 5 maturity levels matching the original HTML assessment
  // ---------------------------------------------------------------------------

  private async seedScoreRanges(surveyId: number): Promise<void> {
    const ranges = [
      {
        nome: 'Inicial',
        min: 0,
        max: 20,
        cor: '#C4453C',
        descricao:
          'A TI é improvisada: sem processos, ferramentas ou responsáveis definidos. Os riscos existem, mas são invisíveis para a gestão.',
      },
      {
        nome: 'Reativo',
        min: 21,
        max: 40,
        cor: '#D96B3B',
        descricao:
          'A TI age quando algo quebra. Existem ferramentas básicas, mas falta prevenção — cada incidente custa mais do que deveria.',
      },
      {
        nome: 'Definido',
        min: 41,
        max: 60,
        cor: '#D99A32',
        descricao:
          'Processos existem e são conhecidos, mas a execução é inconsistente. Há lacunas importantes que aparecem nos momentos críticos.',
      },
      {
        nome: 'Gerenciado',
        min: 61,
        max: 80,
        cor: '#3E8E5A',
        descricao:
          'TI proativa, com processos medidos e testados. Este é o nível recomendado de mercado — o desafio agora é sustentá-lo.',
      },
      {
        nome: 'Otimizado',
        min: 81,
        max: 100,
        cor: '#0E7C86',
        descricao:
          'TI estratégica, com melhoria contínua e alinhamento total ao negócio. Poucas empresas chegam aqui.',
      },
    ]

    for (const range of ranges) {
      await ScoreRange.updateOrCreate(
        { surveyId, nome: range.nome },
        { min: range.min, max: range.max, descricao: range.descricao, cor: range.cor }
      )
    }
  }
}

// =============================================================================
// QUESTION DEFINITIONS
//
// Each entry has:
//   ref       — internal reference ID (matches original HTML id)
//   texto     — question text
//   tipo      — 'escolha_unica' | 'multipla_escolha' | 'aberta'
//   peso      — weight (derived from pillar weights in the original)
//   dimensao  — pillar/dimension name (null for unscored profile/closing)
//   descricao — helper text (optional)
//   options   — array of {key, texto, pontuacao}
// =============================================================================

interface OptionDef {
  key: string
  texto: string
  pontuacao: number
}

interface QuestionDef {
  ref: string
  texto: string
  tipo: 'escolha_unica' | 'multipla_escolha' | 'aberta'
  peso: number
  dimensao: string | null
  descricao?: string
  options?: OptionDef[]
}


const QUESTION_DEFS: QuestionDef[] = [
  // =========================================================================
  // PERFIL DA EMPRESA (unscored — dimensao: null, peso: 0)
  // =========================================================================
  {
    ref: 'PF-01',
    texto: 'Quantos colaboradores utilizam computador ou sistemas no dia a dia?',
    tipo: 'escolha_unica',
    peso: 0,
    dimensao: null,
    options: [
      { key: 'a', texto: 'Até 20', pontuacao: 0 },
      { key: 'b', texto: '21 a 50', pontuacao: 0 },
      { key: 'c', texto: '51 a 150', pontuacao: 0 },
      { key: 'd', texto: '151 a 500', pontuacao: 0 },
      { key: 'e', texto: 'Mais de 500', pontuacao: 0 },
    ],
  },
  {
    ref: 'PF-02',
    texto: 'Qual o segmento principal da empresa?',
    tipo: 'escolha_unica',
    peso: 0,
    dimensao: null,
    options: [
      { key: 'a', texto: 'Indústria', pontuacao: 0 },
      { key: 'b', texto: 'Comércio / Varejo', pontuacao: 0 },
      { key: 'c', texto: 'Serviços', pontuacao: 0 },
      { key: 'd', texto: 'Saúde', pontuacao: 0 },
      { key: 'e', texto: 'Financeiro / Contábil', pontuacao: 0 },
      { key: 'f', texto: 'Educação', pontuacao: 0 },
      { key: 'g', texto: 'Outro', pontuacao: 0 },
    ],
  },
  {
    ref: 'PF-03',
    texto: 'Se os sistemas da empresa parassem agora, em quanto tempo a operação seria seriamente impactada?',
    tipo: 'escolha_unica',
    peso: 0,
    dimensao: null,
    options: [
      { key: 'a', texto: 'Em minutos — operamos 100% dependentes de sistemas', pontuacao: 0 },
      { key: 'b', texto: 'Em algumas horas', pontuacao: 0 },
      { key: 'c', texto: 'Em 1 dia', pontuacao: 0 },
      { key: 'd', texto: 'Conseguiríamos operar alguns dias no manual', pontuacao: 0 },
    ],
  },
  {
    ref: 'PF-04',
    texto: 'Como é estruturada a TI da empresa hoje?',
    tipo: 'escolha_unica',
    peso: 0,
    dimensao: null,
    options: [
      { key: 'a', texto: 'Equipe interna de TI', pontuacao: 0 },
      { key: 'b', texto: '1 pessoa interna + apoio externo pontual', pontuacao: 0 },
      { key: 'c', texto: '100% terceirizada', pontuacao: 0 },
      { key: 'd', texto: 'Não temos ninguém formal — "quem entende mais ajuda"', pontuacao: 0 },
    ],
  },
  {
    ref: 'PF-05',
    texto: 'Onde rodam os sistemas críticos da empresa?',
    descricao: 'Pode marcar mais de uma opção.',
    tipo: 'multipla_escolha',
    peso: 0,
    dimensao: null,
    options: [
      { key: 'a', texto: 'Servidores dentro da empresa', pontuacao: 0 },
      { key: 'b', texto: 'Nuvem (AWS, Azure, Google Cloud...)', pontuacao: 0 },
      { key: 'c', texto: 'Sistemas de terceiros / SaaS', pontuacao: 0 },
      { key: 'd', texto: 'Não sei', pontuacao: 0 },
    ],
  },
  // =========================================================================
  // P1 — SEGURANÇA DA INFORMAÇÃO (peso: 25)
  // =========================================================================
  {
    ref: 'SG-01',
    texto: 'Nos últimos 24 meses, a empresa sofreu algum incidente de segurança?',
    descricao: 'Vírus, ransomware, invasão, golpe por e-mail, vazamento de dados.',
    tipo: 'escolha_unica',
    peso: 25,
    dimensao: 'Segurança da Informação',
    options: [
      { key: 'a', texto: 'Sim, com impacto sério (parada, perda de dados ou prejuízo)', pontuacao: 0 },
      { key: 'b', texto: 'Sim, mas contido sem grandes danos', pontuacao: 2 },
      { key: 'c', texto: 'Não que eu saiba', pontuacao: 3 },
      { key: 'd', texto: 'Não, e temos como comprovar (relatórios/auditoria)', pontuacao: 4 },
    ],
  },
  {
    ref: 'SG-01a',
    texto: 'Após o incidente, o que mudou na empresa?',
    tipo: 'escolha_unica',
    peso: 25,
    dimensao: 'Segurança da Informação',
    options: [
      { key: 'a', texto: 'Nada de estruturado — resolvemos e seguimos', pontuacao: 0 },
      { key: 'b', texto: 'Trocamos algumas ferramentas/senhas', pontuacao: 1 },
      { key: 'c', texto: 'Revisão formal e melhorias implementadas', pontuacao: 3 },
      { key: 'd', texto: 'Apoio especializado + plano de resposta criado', pontuacao: 4 },
    ],
  },
  {
    ref: 'SG-02',
    texto: 'Todos os computadores possuem antivírus/proteção gerenciada centralmente?',
    tipo: 'escolha_unica',
    peso: 25,
    dimensao: 'Segurança da Informação',
    options: [
      { key: 'a', texto: 'Não sei / cada um instala o seu', pontuacao: 0 },
      { key: 'b', texto: 'Alguns têm, sem padrão', pontuacao: 1 },
      { key: 'c', texto: 'Todos têm, mas ninguém acompanha alertas', pontuacao: 2 },
      { key: 'd', texto: 'Todos têm, com acompanhamento ativo', pontuacao: 4 },
    ],
  },
  {
    ref: 'SG-03',
    texto: 'Para acessar e-mails e sistemas importantes, é exigido um segundo fator de autenticação?',
    descricao: 'Código no celular ou aplicativo autenticador, além da senha.',
    tipo: 'escolha_unica',
    peso: 25,
    dimensao: 'Segurança da Informação',
    options: [
      { key: 'a', texto: 'Não / não sei o que é isso', pontuacao: 0 },
      { key: 'b', texto: 'Só algumas pessoas ou sistemas', pontuacao: 2 },
      { key: 'c', texto: 'Sim, obrigatório para todos nos sistemas críticos', pontuacao: 4 },
    ],
  },
  {
    ref: 'SG-04',
    texto: 'Como são tratadas as atualizações de segurança (Windows, sistemas, rede)?',
    tipo: 'escolha_unica',
    peso: 25,
    dimensao: 'Segurança da Informação',
    options: [
      { key: 'a', texto: 'Cada usuário atualiza quando quer / não sei', pontuacao: 0 },
      { key: 'b', texto: 'Atualizamos quando algo dá problema', pontuacao: 1 },
      { key: 'c', texto: 'Há rotina, sem controle formal', pontuacao: 2 },
      { key: 'd', texto: 'Processo gerenciado, com verificação de pendências', pontuacao: 4 },
    ],
  },
  {
    ref: 'SG-05',
    texto: 'Os colaboradores recebem orientação sobre golpes digitais?',
    descricao: 'Phishing, e-mails falsos, engenharia social.',
    tipo: 'escolha_unica',
    peso: 25,
    dimensao: 'Segurança da Informação',
    options: [
      { key: 'a', texto: 'Nunca', pontuacao: 0 },
      { key: 'b', texto: 'Já houve comunicado pontual', pontuacao: 1 },
      { key: 'c', texto: 'Orientações periódicas informais', pontuacao: 2 },
      { key: 'd', texto: 'Treinamento recorrente e/ou simulações', pontuacao: 4 },
    ],
  },
  {
    ref: 'SG-06',
    texto: 'Se um notebook da empresa for roubado hoje, os dados nele estão protegidos?',
    tipo: 'escolha_unica',
    peso: 25,
    dimensao: 'Segurança da Informação',
    options: [
      { key: 'a', texto: 'Não / não sei', pontuacao: 0 },
      { key: 'b', texto: 'Apenas senha de login', pontuacao: 1 },
      { key: 'c', texto: 'Sim, disco criptografado', pontuacao: 3 },
      { key: 'd', texto: 'Criptografia + bloqueio/apagamento remoto', pontuacao: 4 },
    ],
  },
  {
    ref: 'SG-07',
    texto: 'Em um ataque cibernético, existe um responsável claro que seria acionado imediatamente, com um plano do que fazer?',
    tipo: 'escolha_unica',
    peso: 25,
    dimensao: 'Segurança da Informação',
    options: [
      { key: 'a', texto: 'Não', pontuacao: 0 },
      { key: 'b', texto: 'Sabemos quem chamar, mas sem plano definido', pontuacao: 2 },
      { key: 'c', texto: 'Sim — responsável e plano documentado', pontuacao: 4 },
    ],
  },

  // =========================================================================
  // P2 — BACKUP & CONTINUIDADE (peso: 20)
  // =========================================================================
  {
    ref: 'BK-01',
    texto: 'A empresa realiza backup dos dados e sistemas críticos?',
    tipo: 'escolha_unica',
    peso: 20,
    dimensao: 'Backup & Continuidade',
    options: [
      { key: 'a', texto: 'Não / não sei', pontuacao: 0 },
      { key: 'b', texto: 'Sim, manual/esporádico', pontuacao: 1 },
      { key: 'c', texto: 'Sim, automático diário', pontuacao: 3 },
      { key: 'd', texto: 'Automático, múltiplas cópias e retenção definida', pontuacao: 4 },
    ],
  },
  {
    ref: 'BK-02',
    texto: 'Existe cópia do backup fora do prédio da empresa?',
    descricao: 'Nuvem ou outro local físico.',
    tipo: 'escolha_unica',
    peso: 20,
    dimensao: 'Backup & Continuidade',
    options: [
      { key: 'a', texto: 'Não / não sei', pontuacao: 0 },
      { key: 'b', texto: 'Sim, em nuvem ou local externo', pontuacao: 3 },
      { key: 'c', texto: 'Sim, seguindo a regra 3-2-1', pontuacao: 4 },
    ],
  },
  {
    ref: 'BK-03',
    texto: 'Quando foi a última vez que testaram restaurar um backup de verdade?',
    tipo: 'escolha_unica',
    peso: 20,
    dimensao: 'Backup & Continuidade',
    options: [
      { key: 'a', texto: 'Nunca testamos / não sei', pontuacao: 0 },
      { key: 'b', texto: 'Há mais de 1 ano', pontuacao: 1 },
      { key: 'c', texto: 'Nos últimos 6 a 12 meses', pontuacao: 3 },
      { key: 'd', texto: 'Testes periódicos programados', pontuacao: 4 },
    ],
  },
  {
    ref: 'BK-04',
    texto: 'O backup está protegido contra ransomware?',
    descricao: 'Cópia imutável ou desconectada da rede — um ataque não consegue apagá-la.',
    tipo: 'escolha_unica',
    peso: 20,
    dimensao: 'Backup & Continuidade',
    options: [
      { key: 'a', texto: 'Não sei', pontuacao: 0 },
      { key: 'b', texto: 'Não — o backup fica acessível na mesma rede', pontuacao: 1 },
      { key: 'c', texto: 'Sim, cópia imutável/offline', pontuacao: 4 },
    ],
  },
  {
    ref: 'BK-05',
    texto: 'Se o sistema principal falhar totalmente, em quanto tempo a empresa volta a operar?',
    tipo: 'escolha_unica',
    peso: 20,
    dimensao: 'Backup & Continuidade',
    options: [
      { key: 'a', texto: 'Não faço ideia', pontuacao: 0 },
      { key: 'b', texto: 'Dias', pontuacao: 1 },
      { key: 'c', texto: 'Horas', pontuacao: 3 },
      { key: 'd', texto: 'Tempo definido e testado em plano de recuperação', pontuacao: 4 },
    ],
  },
  {
    ref: 'BK-06',
    texto: 'Existe um plano documentado do que fazer em um desastre (incêndio, ransomware, falha total)?',
    descricao: 'Quem faz o quê, em que ordem.',
    tipo: 'escolha_unica',
    peso: 20,
    dimensao: 'Backup & Continuidade',
    options: [
      { key: 'a', texto: 'Não', pontuacao: 0 },
      { key: 'b', texto: 'Está "na cabeça" de uma pessoa', pontuacao: 1 },
      { key: 'c', texto: 'Documentado, mas nunca testado', pontuacao: 2 },
      { key: 'd', texto: 'Documentado e testado ao menos 1x ao ano', pontuacao: 4 },
    ],
  },

  // =========================================================================
  // P3 — INFRAESTRUTURA & PERFORMANCE (peso: 15)
  // =========================================================================
  {
    ref: 'IF-01',
    texto: 'Com que frequência colaboradores reclamam de lentidão (sistemas, rede, computadores)?',
    tipo: 'escolha_unica',
    peso: 15,
    dimensao: 'Infraestrutura & Performance',
    options: [
      { key: 'a', texto: 'Diariamente', pontuacao: 0 },
      { key: 'b', texto: 'Semanalmente', pontuacao: 1 },
      { key: 'c', texto: 'Ocasionalmente', pontuacao: 3 },
      { key: 'd', texto: 'Raramente / temos medições que comprovam', pontuacao: 4 },
    ],
  },
  {
    ref: 'IF-02',
    texto: 'Qual a idade média dos computadores em uso?',
    tipo: 'escolha_unica',
    peso: 15,
    dimensao: 'Infraestrutura & Performance',
    options: [
      { key: 'a', texto: 'Não sei', pontuacao: 0 },
      { key: 'b', texto: 'Mais de 6 anos, sem plano de troca', pontuacao: 1 },
      { key: 'c', texto: 'Mistura de idades — trocamos quando quebra', pontuacao: 2 },
      { key: 'd', texto: 'Até 4-5 anos, com renovação planejada', pontuacao: 4 },
    ],
  },
  {
    ref: 'IF-03',
    texto: 'A internet possui redundância — um segundo link que assume automaticamente em caso de queda?',
    tipo: 'escolha_unica',
    peso: 15,
    dimensao: 'Infraestrutura & Performance',
    options: [
      { key: 'a', texto: 'Não / não sei', pontuacao: 0 },
      { key: 'b', texto: 'Temos segundo link, mas a troca é manual', pontuacao: 2 },
      { key: 'c', texto: 'Sim, failover automático', pontuacao: 4 },
    ],
  },
  {
    ref: 'IF-04',
    texto: 'Os servidores locais possuem proteção contra falhas?',
    descricao: 'Nobreak dimensionado, discos redundantes, equipamento reserva.',
    tipo: 'escolha_unica',
    peso: 15,
    dimensao: 'Infraestrutura & Performance',
    options: [
      { key: 'a', texto: 'Não / não sei', pontuacao: 0 },
      { key: 'b', texto: 'Apenas nobreak básico', pontuacao: 1 },
      { key: 'c', texto: 'Nobreak + discos redundantes (RAID)', pontuacao: 3 },
      { key: 'd', texto: 'Redundância completa (energia, discos, virtualização)', pontuacao: 4 },
    ],
  },
  {
    ref: 'IF-05',
    texto: 'A rede Wi-Fi e cabeada atende bem toda a operação?',
    tipo: 'escolha_unica',
    peso: 15,
    dimensao: 'Infraestrutura & Performance',
    options: [
      { key: 'a', texto: 'Há áreas sem sinal ou quedas constantes', pontuacao: 0 },
      { key: 'b', texto: 'Funciona, mas com instabilidades frequentes', pontuacao: 2 },
      { key: 'c', texto: 'Estável, equipamentos profissionais, rede separada p/ visitantes', pontuacao: 4 },
    ],
  },
  // =========================================================================
  // P4 — CAPACIDADE & ESCALABILIDADE (peso: 10)
  // =========================================================================
  {
    ref: 'CP-01',
    texto: 'Se a empresa dobrasse de tamanho em 12 meses, a TI atual suportaria?',
    tipo: 'escolha_unica',
    peso: 10,
    dimensao: 'Capacidade & Escalabilidade',
    options: [
      { key: 'a', texto: 'Não faço ideia', pontuacao: 0 },
      { key: 'b', texto: 'Não — teríamos que refazer muita coisa', pontuacao: 1 },
      { key: 'c', texto: 'Parcialmente — alguns pontos travariam', pontuacao: 2 },
      { key: 'd', texto: 'Sim — a estrutura foi pensada para crescer', pontuacao: 4 },
    ],
  },
  {
    ref: 'CP-02',
    texto: 'Alguém acompanha o consumo de recursos (disco, licenças, servidores/nuvem) antes que acabem?',
    tipo: 'escolha_unica',
    peso: 10,
    dimensao: 'Capacidade & Escalabilidade',
    options: [
      { key: 'a', texto: 'Não — descobrimos quando estoura', pontuacao: 0 },
      { key: 'b', texto: 'Olhamos de vez em quando', pontuacao: 1 },
      { key: 'c', texto: 'Acompanhamento periódico informal', pontuacao: 2 },
      { key: 'd', texto: 'Monitoramento com alertas e planejamento', pontuacao: 4 },
    ],
  },
  {
    ref: 'CP-03',
    texto: 'A empresa já avaliou levar sistemas para a nuvem (ou otimizar o que já está lá)?',
    tipo: 'escolha_unica',
    peso: 10,
    dimensao: 'Capacidade & Escalabilidade',
    options: [
      { key: 'a', texto: 'Nunca avaliamos', pontuacao: 1 },
      { key: 'b', texto: 'Avaliamos, mas não seguimos adiante', pontuacao: 2 },
      { key: 'c', texto: 'Em migração / uso híbrido consciente', pontuacao: 3 },
      { key: 'd', texto: 'Nuvem com gestão de custos e dimensionamento ativo', pontuacao: 4 },
    ],
  },
  {
    ref: 'CP-04',
    texto: 'Um novo colaborador: em quanto tempo tem computador, acessos e e-mail funcionando?',
    tipo: 'escolha_unica',
    peso: 10,
    dimensao: 'Capacidade & Escalabilidade',
    options: [
      { key: 'a', texto: 'Dias, sempre com improviso', pontuacao: 0 },
      { key: 'b', texto: 'Alguns dias, caso a caso', pontuacao: 1 },
      { key: 'c', texto: '1 a 2 dias, com roteiro conhecido', pontuacao: 3 },
      { key: 'd', texto: 'No mesmo dia, processo padronizado', pontuacao: 4 },
    ],
  },
  // =========================================================================
  // P5 — MONITORAMENTO (peso: 15)
  // =========================================================================
  {
    ref: 'MN-01',
    texto: 'Quando um sistema ou serviço cai, quem geralmente descobre primeiro?',
    tipo: 'escolha_unica',
    peso: 15,
    dimensao: 'Monitoramento',
    options: [
      { key: 'a', texto: 'Os clientes', pontuacao: 0 },
      { key: 'b', texto: 'Os usuários internos, que reclamam', pontuacao: 1 },
      { key: 'c', texto: 'A TI, quase junto com os usuários', pontuacao: 2 },
      { key: 'd', texto: 'A TI, por alertas automáticos, antes de afetar alguém', pontuacao: 4 },
    ],
  },
  {
    ref: 'MN-02',
    texto: 'Existe alguma ferramenta de monitoramento do ambiente (servidores, links, sistemas)?',
    tipo: 'escolha_unica',
    peso: 15,
    dimensao: 'Monitoramento',
    options: [
      { key: 'a', texto: 'Não / não sei', pontuacao: 0 },
      { key: 'b', texto: 'Existe, mas ninguém acompanha', pontuacao: 1 },
      { key: 'c', texto: 'Existe e é acompanhada em horário comercial', pontuacao: 2 },
    ],
  },
  {
    ref: 'MN-03',
    texto: 'O monitoramento gera alertas automáticos (WhatsApp, e-mail) para os responsáveis, inclusive fora do horário comercial?',
    tipo: 'escolha_unica',
    peso: 15,
    dimensao: 'Monitoramento',
    options: [
      { key: 'a', texto: 'Não', pontuacao: 0 },
      { key: 'b', texto: 'Sim, mas só em horário comercial', pontuacao: 2 },
      { key: 'c', texto: 'Sim, 24x7 com escalonamento definido', pontuacao: 4 },
    ],
  },
  {
    ref: 'MN-04',
    texto: 'A diretoria recebe relatório periódico sobre a saúde da TI (disponibilidade, incidentes, riscos)?',
    tipo: 'escolha_unica',
    peso: 15,
    dimensao: 'Monitoramento',
    options: [
      { key: 'a', texto: 'Nunca recebi nada', pontuacao: 0 },
      { key: 'b', texto: 'Só quando algo grave acontece', pontuacao: 1 },
      { key: 'c', texto: 'Relatórios eventuais, sem padrão', pontuacao: 2 },
      { key: 'd', texto: 'Relatório mensal/trimestral com indicadores', pontuacao: 4 },
    ],
  },
  {
    ref: 'MN-05',
    texto: 'Vocês sabem, com dados, quanto tempo os sistemas críticos ficaram fora do ar no último trimestre?',
    tipo: 'escolha_unica',
    peso: 15,
    dimensao: 'Monitoramento',
    options: [
      { key: 'a', texto: 'Não temos essa informação', pontuacao: 0 },
      { key: 'b', texto: 'Temos noção, mas sem registro', pontuacao: 1 },
      { key: 'c', texto: 'Sim, registrado por ferramenta de monitoramento', pontuacao: 4 },
    ],
  },
  // =========================================================================
  // P6 — GOVERNANÇA & PROCESSOS (peso: 15)
  // =========================================================================
  {
    ref: 'GV-01',
    texto: 'Quando um colaborador tem problema de TI, o que ele faz?',
    tipo: 'escolha_unica',
    peso: 15,
    dimensao: 'Governança & Processos',
    options: [
      { key: 'a', texto: 'Chama quem "entende mais" / WhatsApp para alguém', pontuacao: 0 },
      { key: 'b', texto: 'Aciona a TI, sem registro formal', pontuacao: 1 },
      { key: 'c', texto: 'Abre chamado em canal definido', pontuacao: 3 },
      { key: 'd', texto: 'Abre chamado com prazos (SLA) acompanhados', pontuacao: 4 },
    ],
  },
  {
    ref: 'GV-02',
    texto: 'Existe inventário atualizado de equipamentos, sistemas e licenças?',
    tipo: 'escolha_unica',
    peso: 15,
    dimensao: 'Governança & Processos',
    options: [
      { key: 'a', texto: 'Não / não sei', pontuacao: 0 },
      { key: 'b', texto: 'Planilha desatualizada', pontuacao: 1 },
      { key: 'c', texto: 'Inventário manual em dia', pontuacao: 3 },
      { key: 'd', texto: 'Inventário automatizado por ferramenta', pontuacao: 4 },
    ],
  },
  {
    ref: 'GV-03',
    texto: 'O ambiente está documentado (senhas de administrador, rede, configurações), sem depender da memória de uma pessoa?',
    tipo: 'escolha_unica',
    peso: 15,
    dimensao: 'Governança & Processos',
    options: [
      { key: 'a', texto: 'Está tudo na cabeça de uma pessoa', pontuacao: 0 },
      { key: 'b', texto: 'Documentação parcial e dispersa', pontuacao: 1 },
      { key: 'c', texto: 'Documentado em local seguro e conhecido', pontuacao: 3 },
      { key: 'd', texto: 'Documentado, com cofre de senhas e atualização contínua', pontuacao: 4 },
    ],
  },
  {
    ref: 'GV-04',
    texto: 'Quando alguém é desligado, em quanto tempo todos os acessos dele são bloqueados?',
    tipo: 'escolha_unica',
    peso: 15,
    dimensao: 'Governança & Processos',
    options: [
      { key: 'a', texto: 'Não há processo — pode ficar ativo indefinidamente', pontuacao: 0 },
      { key: 'b', texto: 'Bloqueamos "quando lembramos"', pontuacao: 1 },
      { key: 'c', texto: 'Em até alguns dias, por processo com o RH', pontuacao: 3 },
      { key: 'd', texto: 'No mesmo dia, por checklist formal', pontuacao: 4 },
    ],
  },
  {
    ref: 'GV-05',
    texto: 'A TI tem orçamento próprio e participa das decisões estratégicas da empresa?',
    tipo: 'escolha_unica',
    peso: 15,
    dimensao: 'Governança & Processos',
    options: [
      { key: 'a', texto: 'Não — TI é vista só como custo quando algo quebra', pontuacao: 0 },
      { key: 'b', texto: 'Gastos recorrentes, sem planejamento anual', pontuacao: 1 },
      { key: 'c', texto: 'Orçamento anual definido', pontuacao: 3 },
      { key: 'd', texto: 'Orçamento + TI no planejamento estratégico', pontuacao: 4 },
    ],
  },
  {
    ref: 'GV-06',
    texto: 'Contratos com fornecedores críticos (internet, ERP, TI terceirizada) têm prazos de atendimento e penalidades definidos?',
    tipo: 'escolha_unica',
    peso: 15,
    dimensao: 'Governança & Processos',
    options: [
      { key: 'a', texto: 'Não sei o que está nos contratos', pontuacao: 0 },
      { key: 'b', texto: 'Contratos básicos, sem SLA', pontuacao: 1 },
      { key: 'c', texto: 'SLA definido nos principais', pontuacao: 3 },
      { key: 'd', texto: 'SLA definido e cobrado ativamente', pontuacao: 4 },
    ],
  },

  // =========================================================================
  // LGPD & COMPLIANCE (peso: 10)
  // =========================================================================
  {
    ref: 'LG-01',
    texto: 'A empresa mapeou quais dados pessoais/sensíveis coleta e onde ficam armazenados?',
    tipo: 'escolha_unica',
    peso: 10,
    dimensao: 'LGPD & Compliance',
    options: [
      { key: 'a', texto: 'Não / não sei', pontuacao: 0 },
      { key: 'b', texto: 'Parcialmente', pontuacao: 2 },
      { key: 'c', texto: 'Sim, com inventário de dados', pontuacao: 4 },
    ],
  },
  {
    ref: 'LG-02',
    texto: 'Existe um responsável pela adequação à LGPD (encarregado/DPO)?',
    tipo: 'escolha_unica',
    peso: 10,
    dimensao: 'LGPD & Compliance',
    options: [
      { key: 'a', texto: 'Não', pontuacao: 0 },
      { key: 'b', texto: 'Alguém acumula informalmente', pontuacao: 2 },
      { key: 'c', texto: 'Sim, formalmente designado', pontuacao: 4 },
    ],
  },
  {
    ref: 'LG-03',
    texto: 'Acessos a dados sensíveis são restritos por perfil, com registro de quem acessou o quê?',
    tipo: 'escolha_unica',
    peso: 10,
    dimensao: 'LGPD & Compliance',
    options: [
      { key: 'a', texto: 'Não / não sei', pontuacao: 0 },
      { key: 'b', texto: 'Restrição parcial, sem registro', pontuacao: 2 },
      { key: 'c', texto: 'Sim, com controle e trilha de auditoria', pontuacao: 4 },
    ],
  },
  // =========================================================================
  // FECHAMENTO (unscored — dimensao: null, peso: 0)
  // =========================================================================
  {
    ref: 'FC-01',
    texto: 'Qual destas frases melhor descreve sua maior preocupação com TI hoje?',
    tipo: 'escolha_unica',
    peso: 0,
    dimensao: null,
    options: [
      { key: 'a', texto: 'Medo de perder dados ou sofrer um ataque', pontuacao: 0 },
      { key: 'b', texto: 'Sistemas lentos ou instáveis atrapalhando a operação', pontuacao: 0 },
      { key: 'c', texto: 'Custo de TI alto sem clareza do retorno', pontuacao: 0 },
      { key: 'd', texto: 'Dependência de uma única pessoa/fornecedor', pontuacao: 0 },
      { key: 'e', texto: 'TI não acompanha o crescimento da empresa', pontuacao: 0 },
      { key: 'f', texto: 'Outra', pontuacao: 0 },
    ],
  },
  {
    ref: 'FC-02',
    texto: 'Se pudesse resolver UM problema de TI nos próximos 90 dias, qual seria?',
    descricao: 'Escreva com suas palavras — é opcional, mas ajuda muito no diagnóstico.',
    tipo: 'aberta',
    peso: 0,
    dimensao: null,
  },
]
