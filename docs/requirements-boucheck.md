# Documento de Requisitos — Plataforma BouCheck (Surveys Inteligentes)

**Produto:** BouCheck — Plataforma de Surveys de Diagnóstico
**Domínio:** `boucheck.beonup.com.br`
**Versão do documento:** 1.0
**Data:** 2026-07-08
**Autor:** BeOnUp Tecnologia
**Público-alvo deste documento:** Agentes de desenvolvimento (Kiro / AWS) e equipe técnica

> **Nota para os agentes Kiro:** Os requisitos seguem o padrão de *user stories* com critérios de aceitação no formato **EARS** (Easy Approach to Requirements Syntax), compatível com o fluxo spec-driven do Kiro (`requirements.md` → `design.md` → `tasks.md`). Cada requisito é identificado por um código único (ex.: `REQ-ADM-003`) para rastreabilidade nas tarefas de implementação.

---

## 1. Visão Geral

### 1.1 Objetivo do produto

Plataforma web para criação, publicação e gestão de surveys de diagnóstico (ex.: maturidade de TI, observabilidade, infraestrutura), usada pela BeOnUp como ferramenta de diagnóstico e veículo comercial. A solução possui duas áreas:

1. **Área pública (respondente):** onde leads/clientes respondem surveys publicados em URLs amigáveis (ex.: `boucheck.beonup.com.br/maturidadeti`).
2. **Área administrativa:** onde administradores criam surveys (manualmente ou com auxílio de IA), gerenciam perguntas com lógica condicional, acompanham preenchimentos com rastreabilidade completa e visualizam dashboards de indicadores.

### 1.2 Escopo

**Dentro do escopo (v1):**
- CRUD de surveys, categorias, perguntas e opções
- Tipos de pergunta: escolha única, múltipla escolha, aberta; obrigatória/opcional
- Lógica condicional em cascata entre perguntas
- Geração de perguntas assistida por IA (Amazon Bedrock)
- Identidade visual configurável por survey (cores e logo)
- Coleta de dados do respondente com aceite de política de privacidade (LGPD)
- Geração de relatório de resultado com envio por WhatsApp e e-mail
- Rastreabilidade de eventos do respondente (funil de preenchimento)
- Dashboard de indicadores
- Gestão de usuários administradores

**Fora do escopo (v1):**
- Alta disponibilidade / multi-AZ
- Multi-idioma (somente pt-BR)
- Pagamentos / billing
- App mobile nativo
- White-label multi-empresa (a plataforma serve apenas à BeOnUp)

### 1.3 Stack tecnológica definida

| Camada | Tecnologia | Observação |
|---|---|---|
| Backend (API REST) | AdonisJS 6 (Node.js 22, TypeScript) | Lucid ORM, Validator nativo (VineJS) |
| Frontend | Next.js 15 (App Router, TypeScript) | Área pública com SSR; área admin como SPA autenticada |
| Banco de dados | PostgreSQL 16 (Amazon RDS, single-AZ, db.t4g.micro) | Migrações via Lucid |
| Fila assíncrona | Amazon SQS (standard) | Worker via comando `node ace queue:listen` |
| Armazenamento de arquivos | Amazon S3 | Logos, relatórios PDF |
| IA generativa | Amazon Bedrock — Claude (modelo Sonnet mais recente disponível na conta) | Geração de perguntas e texto do relatório |
| E-mail transacional | Amazon SES | Domínio verificado beonup.com.br |
| WhatsApp | Meta WhatsApp Cloud API | Templates aprovados para envio de relatório |
| Deploy backend | AWS App Runner (ou 1 task ECS Fargate) | Sem HA |
| Deploy frontend | AWS Amplify Hosting | CI/CD via Git |
| CDN / DNS | CloudFront + Route53 | |

---

## 2. Glossário

| Termo | Definição |
|---|---|
| **Survey** | Questionário publicado em uma URL própria (slug), composto de perguntas ordenadas. |
| **Slug** | Identificador único do survey na URL pública (ex.: `maturidadeti`). |
| **Pergunta em cascata** | Pergunta cuja exibição depende da resposta dada a uma pergunta anterior (lógica condicional). |
| **Respondente** | Pessoa que acessa a URL pública e responde o survey (lead). |
| **Sessão de resposta (Response)** | Registro de um preenchimento (parcial ou completo) de um survey por um respondente. |
| **Evento de resposta** | Registro atômico de rastreabilidade (iniciou, respondeu pergunta, concluiu, clicou no relatório, etc.). |
| **Relatório** | Documento gerado ao final do preenchimento com o resultado do diagnóstico (HTML na tela + PDF para envio). |
| **Administrador** | Usuário autenticado da área administrativa. |

---

## 3. Atores

| Ator | Descrição | Autenticação |
|---|---|---|
| **Respondente** | Acessa a URL pública, aceita a política de privacidade, se identifica e responde o survey. | Não autenticado (identificado por dados do formulário + token de sessão de resposta) |
| **Administrador** | Cria e gerencia surveys, acompanha resultados, gerencia usuários. | E-mail + senha (sessão via token) |
| **Sistema (workers)** | Processa jobs assíncronos: geração de PDF, envio de WhatsApp/e-mail, chamadas de IA. | Credenciais IAM |

---

## 4. Requisitos Funcionais — Área Pública (Respondente)

### REQ-PUB-001 — Acesso ao survey por slug

**User story:** Como respondente, quero acessar um survey por uma URL amigável, para responder o diagnóstico sem cadastro prévio.

**Critérios de aceitação:**
1. QUANDO o respondente acessa `boucheck.beonup.com.br/{slug}` E existe um survey ativo com esse slug, O SISTEMA DEVE renderizar a página inicial do survey com a identidade visual configurada (cores e logo).
2. QUANDO o slug não existe OU o survey está inativo/arquivado, O SISTEMA DEVE exibir uma página 404 amigável com a marca BeOnUp.
3. O SISTEMA DEVE permitir múltiplos surveys ativos simultaneamente, cada um em seu próprio slug.
4. A página pública DEVE ser renderizada via SSR com metadados Open Graph (título, descrição e imagem do survey) para compartilhamento em redes sociais e WhatsApp.

### REQ-PUB-002 — Tela inicial: objetivo e mensagem explicativa

**User story:** Como respondente, quero entender o objetivo do survey antes de começar, para decidir se vale meu tempo.

**Critérios de aceitação:**
1. QUANDO a página inicial do survey é exibida, O SISTEMA DEVE apresentar: título do survey, mensagem de objetivo (texto curto configurado pelo administrador), tempo estimado de preenchimento e botão "Iniciar".
2. A mensagem de objetivo DEVE ser um campo rich-text simples (negrito, itálico, listas) configurado no admin, com limite de 1.000 caracteres.

### REQ-PUB-003 — Aceite de política de privacidade e identificação (LGPD)

**User story:** Como respondente, quero saber como meus dados serão usados e fornecer minhas informações de contato, para receber o relatório do diagnóstico.

**Critérios de aceitação:**
1. QUANDO o respondente clica em "Iniciar", O SISTEMA DEVE exibir o formulário de identificação ANTES da primeira pergunta, contendo os campos: **Nome** (obrigatório), **Telefone/WhatsApp** (obrigatório, máscara BR `+55 (00) 00000-0000`), **Empresa** (obrigatório), **E-mail** (obrigatório, validado), **Cargo** (obrigatório), **Cidade** (obrigatório).
2. O formulário DEVE conter um checkbox de aceite: "Li e aceito a Política de Privacidade", com link para a política em nova aba.
3. ENQUANTO o checkbox não estiver marcado, O SISTEMA DEVE manter o botão de prosseguir desabilitado.
4. QUANDO o respondente submete o formulário com dados válidos, O SISTEMA DEVE criar uma sessão de resposta (`response`) com status `iniciado`, registrar `started_at`, registrar o evento `privacidade_aceita` com timestamp e versão da política, e retornar um token de sessão de resposta (UUID) que o frontend armazena para as chamadas seguintes.
5. QUANDO o e-mail informado já possui uma sessão `iniciado` (não concluída) para o mesmo survey criada nos últimos 7 dias, O SISTEMA DEVE oferecer a opção de retomar de onde parou ou começar de novo.
6. O SISTEMA DEVE validar formato de e-mail e de telefone no backend (não confiar apenas na validação do frontend).

### REQ-PUB-004 — Navegação e resposta das perguntas

**User story:** Como respondente, quero responder as perguntas uma a uma com indicação de progresso, em qualquer dispositivo.

**Critérios de aceitação:**
1. O SISTEMA DEVE exibir uma pergunta por vez, com barra de progresso (percentual baseado no caminho estimado).
2. O SISTEMA DEVE suportar os tipos de pergunta: **escolha única** (radio), **múltipla escolha** (checkbox), **aberta** (textarea, limite de 2.000 caracteres).
3. QUANDO a pergunta é obrigatória E o respondente tenta avançar sem responder, O SISTEMA DEVE exibir mensagem de validação e impedir o avanço.
4. QUANDO a pergunta é opcional, O SISTEMA DEVE exibir a ação "Pular" e permitir avanço sem resposta.
5. QUANDO o respondente responde uma pergunta, O SISTEMA DEVE persistir a resposta imediatamente (auto-save por pergunta, não apenas no final), registrando o evento `pergunta_respondida` com `question_id` e timestamp.
6. O SISTEMA DEVE permitir voltar à pergunta anterior e alterar a resposta; QUANDO uma resposta que controla lógica condicional é alterada, O SISTEMA DEVE invalidar (excluir) as respostas de perguntas que deixaram de fazer parte do caminho.
7. A interface DEVE ser responsiva (mobile-first) — espera-se que a maioria dos acessos venha de WhatsApp/celular.

### REQ-PUB-005 — Lógica condicional em cascata

**User story:** Como respondente, quero que o survey mostre apenas perguntas relevantes ao meu contexto, com base nas minhas respostas anteriores.

**Critérios de aceitação:**
1. QUANDO o respondente seleciona uma opção que possui regra de desvio configurada, O SISTEMA DEVE exibir como próxima pergunta aquela definida na regra (ex.: respondeu "A" → vai para a questão 3; respondeu "B" → vai para a questão 4).
2. QUANDO a opção selecionada não possui regra, O SISTEMA DEVE seguir para a próxima pergunta na ordem sequencial padrão.
3. QUANDO a pergunta é de múltipla escolha E mais de uma opção selecionada possui regra, O SISTEMA DEVE aplicar a regra da opção de maior prioridade (campo `priority` da regra; menor número = maior prioridade).
4. O motor de navegação DEVE ser executado no frontend a partir da estrutura completa de perguntas + regras entregue pela API em uma única chamada (`GET /api/public/surveys/{slug}/structure`), sem round-trip por pergunta; o backend DEVE revalidar o caminho na conclusão.
5. QUANDO uma regra aponta para uma pergunta anterior no fluxo (potencial loop), O SISTEMA DEVE ter rejeitado essa configuração no momento do cadastro (ver REQ-ADM-006), portanto o motor público pode assumir grafo acíclico.

### REQ-PUB-006 — Checklist final de serviços, fabricantes e soluções

**User story:** Como respondente, quero indicar ao final quais serviços cloud, fabricantes e soluções utilizo ou tenho interesse, para que o consultor chegue preparado.

**Critérios de aceitação:**
1. QUANDO o respondente conclui a última pergunta do survey, O SISTEMA DEVE exibir uma etapa de checklist com três grupos de itens selecionáveis (multi-select com busca): **Serviços cloud**, **Fabricantes**, **Soluções**.
2. Os itens de cada grupo DEVEM ser configuráveis por survey no admin (catálogo com nome e grupo).
3. A etapa de checklist DEVE ser opcional (botão "Pular esta etapa").
4. QUANDO o respondente confirma o checklist, O SISTEMA DEVE persistir os itens selecionados vinculados à sessão de resposta.

### REQ-PUB-007 — Conclusão, relatório e ações finais

**User story:** Como respondente, quero ver meu resultado imediatamente e escolher como recebê-lo, para aproveitar o diagnóstico.

**Critérios de aceitação:**
1. QUANDO o respondente conclui o survey (após o checklist), O SISTEMA DEVE: atualizar o status da sessão para `completo`, registrar `completed_at`, calcular o resultado (ver REQ-REP-001) e exibir a tela final.
2. A tela final DEVE conter exatamente quatro ações: **(a)** "Agendar apresentação com um consultor", **(b)** "Receber relatório por WhatsApp", **(c)** "Receber relatório por e-mail", **(d)** "Visualizar relatório".
3. QUANDO o respondente clica em "Visualizar relatório", O SISTEMA DEVE exibir o relatório em HTML na própria página E registrar o evento `relatorio_visualizado`.
4. QUANDO o respondente clica em "Receber por e-mail", O SISTEMA DEVE enfileirar job de envio via SES para o e-mail informado na identificação, registrar `relatorio_email_solicitado` e, após confirmação de envio pelo worker, `relatorio_email_enviado`. A interface DEVE exibir confirmação ("Enviado para j***@empresa.com").
5. QUANDO o respondente clica em "Receber por WhatsApp", O SISTEMA DEVE enfileirar job de envio via WhatsApp Cloud API (template aprovado com link do relatório) para o telefone informado, com registro dos eventos `relatorio_whatsapp_solicitado` e `relatorio_whatsapp_enviado`.
6. QUANDO o respondente clica em "Agendar apresentação com um consultor", O SISTEMA DEVE registrar o evento `consultor_solicitado` e exibir o link/calendário configurado no survey (URL configurável no admin, ex.: link de agendamento), além de disparar notificação interna por e-mail para o endereço comercial configurado.
7. QUANDO o envio por e-mail ou WhatsApp falha após 3 tentativas do worker, O SISTEMA DEVE registrar o evento `relatorio_envio_falhou` com o motivo, para visibilidade no admin.
8. O link do relatório enviado por WhatsApp/e-mail DEVE ser uma URL pública assinada com token não sequencial (ex.: `boucheck.beonup.com.br/r/{token}`), com validade de 90 dias; QUANDO acessado, O SISTEMA DEVE registrar `relatorio_link_acessado`.

---

## 5. Requisitos Funcionais — Área Administrativa

### REQ-ADM-001 — Autenticação de administradores

**Critérios de aceitação:**
1. QUANDO um administrador acessa qualquer rota do admin sem sessão válida, O SISTEMA DEVE redirecionar para a tela de login.
2. QUANDO credenciais válidas são submetidas, O SISTEMA DEVE emitir token de acesso (Adonis access tokens, expiração 12h) e registrar `last_login_at`.
3. QUANDO ocorrem 5 tentativas de login inválidas para o mesmo e-mail em 15 minutos, O SISTEMA DEVE bloquear novas tentativas por 15 minutos (rate limit).
4. Senhas DEVEM ser armazenadas com hash (scrypt — padrão AdonisJS) e política mínima: 10 caracteres, ao menos 1 letra e 1 número.
5. O SISTEMA DEVE oferecer fluxo "Esqueci minha senha" com token de redefinição por e-mail (validade 1h, uso único).

### REQ-ADM-002 — Gestão de surveys

**User story:** Como administrador, quero criar e configurar surveys com identidade visual própria e URL amigável.

**Critérios de aceitação:**
1. O SISTEMA DEVE permitir criar/editar/duplicar/arquivar surveys com os campos: **nome**, **slug** (único, validado: minúsculas, números e hífens), **categoria** (seleção de catálogo de categorias com CRUD próprio), **mensagem de objetivo** (rich-text, até 1.000 caracteres), **tempo estimado**, **status** (`rascunho`, `ativo`, `inativo`, `arquivado`), **link de agendamento do consultor**, **e-mail de notificação comercial**.
2. O SISTEMA DEVE permitir configurar identidade visual por survey: **cor primária**, **cor secundária**, **cor de fundo** (color pickers com preview) e **logo** (upload PNG/SVG/JPG até 2 MB, armazenado em S3, servido via CloudFront).
3. QUANDO o administrador tenta ativar um survey sem ao menos 1 pergunta, O SISTEMA DEVE impedir e informar o motivo.
4. QUANDO um survey é arquivado, O SISTEMA DEVE preservar todas as respostas e eventos históricos (soft-archive; nunca excluir dados de resposta).
5. QUANDO um survey ativo com respostas tem perguntas alteradas, O SISTEMA DEVE alertar o administrador de que respostas existentes referenciam a estrutura anterior e criar nova **versão** da estrutura (campo `version` no survey; respostas gravam a versão respondida).
6. A duplicação de survey DEVE copiar perguntas, opções, regras e checklist, gerando novo slug obrigatório.

### REQ-ADM-003 — Cadastro manual de perguntas

**Critérios de aceitação:**
1. O SISTEMA DEVE permitir CRUD de perguntas por survey com: **texto** (até 500 caracteres), **descrição de apoio** (opcional, até 300), **tipo** (`escolha_unica`, `multipla_escolha`, `aberta`), **obrigatoriedade** (obrigatória/opcional), **ordem** (reordenável por drag-and-drop), **peso para pontuação** (numérico, ver REQ-REP-001).
2. Para perguntas de escolha (única/múltipla), O SISTEMA DEVE permitir cadastrar de 2 a 10 opções, cada uma com **texto** e **valor de pontuação** (numérico, pode ser zero).
3. QUANDO uma pergunta com respostas registradas é excluída em survey `rascunho`, O SISTEMA DEVE permitir; QUANDO o survey já teve respostas, O SISTEMA DEVE exigir versionamento (REQ-ADM-002.5) em vez de exclusão física.

### REQ-ADM-004 — Geração de perguntas por IA

**User story:** Como administrador, quero gerar um conjunto inicial de perguntas por IA a partir do tema do survey, para acelerar a criação.

**Critérios de aceitação:**
1. O SISTEMA DEVE oferecer a ação "Gerar perguntas com IA" no editor do survey, com formulário: **tema/contexto** (texto livre), **quantidade desejada** (1–20), **tipos permitidos**, **público-alvo** (texto livre).
2. QUANDO o administrador solicita a geração, O SISTEMA DEVE chamar o Amazon Bedrock (Claude) com prompt estruturado que exige resposta **exclusivamente em JSON** no schema: `[{ "texto": string, "tipo": "escolha_unica"|"multipla_escolha"|"aberta", "obrigatoria": boolean, "opcoes": [{ "texto": string, "pontuacao": number }] }]`.
3. O SISTEMA DEVE exibir as perguntas geradas em modo **pré-visualização editável** (o administrador pode editar, excluir ou aceitar cada uma) ANTES de persistir; nada é salvo sem confirmação explícita.
4. QUANDO a resposta da IA não é um JSON válido no schema esperado, O SISTEMA DEVE tentar 1 retry automático com instrução de correção; persistindo a falha, DEVE exibir erro amigável sem quebrar o editor.
5. A chamada ao Bedrock DEVE ter timeout de 60s e ser executada de forma assíncrona na UI (loading state, sem travar o editor).
6. O SISTEMA DEVE registrar em log interno: usuário, survey, prompt enviado, tokens consumidos (se disponível na resposta) e resultado, para auditoria de custo.

### REQ-ADM-005 — Configuração do checklist final

**Critérios de aceitação:**
1. O SISTEMA DEVE permitir CRUD de itens do checklist por survey, com campos: **nome** e **grupo** (`servico_cloud`, `fabricante`, `solucao`).
2. O SISTEMA DEVE permitir importar o catálogo de checklist de outro survey existente (cópia).
3. QUANDO o survey não possui itens de checklist cadastrados, O SISTEMA DEVE pular a etapa de checklist no fluxo público automaticamente.

### REQ-ADM-006 — Configuração de lógica condicional (cascata)

**User story:** Como administrador, quero definir desvios de fluxo por opção de resposta, para personalizar o caminho do respondente.

**Critérios de aceitação:**
1. O SISTEMA DEVE permitir, em cada **opção** de perguntas de escolha, configurar a regra: "SE selecionada, ENTÃO ir para a pergunta X", onde X é qualquer pergunta posterior do mesmo survey.
2. O SISTEMA DEVE permitir configurar também a regra de opção "ENTÃO finalizar survey" (encerramento antecipado — vai direto ao checklist/conclusão).
3. QUANDO o administrador tenta criar uma regra que aponta para pergunta anterior ou para a própria pergunta, O SISTEMA DEVE rejeitar com mensagem clara (prevenção de loops — o grafo DEVE ser acíclico e somente "para frente").
4. QUANDO uma pergunta destino de regra é excluída/reordenada de forma que a regra fique inválida, O SISTEMA DEVE alertar e exigir correção antes de permitir ativar o survey.
5. O editor DEVE exibir uma **visualização do fluxo** (mínimo: lista indentada mostrando os desvios; desejável: diagrama simples) para o administrador validar a árvore.
6. Regras DEVEM possuir campo `priority` (inteiro) para resolução de conflito em múltipla escolha (REQ-PUB-005.3), default = ordem da opção.

### REQ-ADM-007 — Gestão e rastreabilidade de preenchimentos

**User story:** Como administrador, quero ver quem começou, quem terminou, quem recebeu o relatório e quanto tempo levou, para priorizar o follow-up comercial.

**Critérios de aceitação:**
1. O SISTEMA DEVE listar todas as sessões de resposta com colunas: nome, empresa, e-mail, telefone, cargo, cidade, survey, status (`iniciado`, `completo`), data de início, data de conclusão, **tempo total de preenchimento**, percentual de progresso (para parciais) e indicadores de relatório (visualizou / enviado por e-mail / enviado por WhatsApp / solicitou consultor).
2. O SISTEMA DEVE oferecer filtros combináveis: **por survey**, **por período** (data início/fim), **por status** (completo/parcial), **por nome** (busca textual), **por empresa** (busca textual), **por ação de relatório** (visualizou, recebeu, solicitou consultor, envio falhou).
3. QUANDO o administrador abre o detalhe de uma sessão, O SISTEMA DEVE exibir: dados do respondente, todas as respostas dadas (pergunta + resposta), itens do checklist, e a **linha do tempo completa de eventos** com timestamps (aceite de privacidade, cada pergunta respondida, conclusão, cliques nos botões finais, envios, falhas, acesso ao link do relatório).
4. O SISTEMA DEVE calcular e exibir o tempo por pergunta (derivado dos eventos `pergunta_respondida`) no detalhe da sessão.
5. O SISTEMA DEVE permitir exportar a listagem filtrada em **CSV** (separador `;`, encoding UTF-8 com BOM, compatível com Excel BR).
6. QUANDO um envio de relatório falhou (evento `relatorio_envio_falhou`), O SISTEMA DEVE permitir o **reenvio manual** pelo administrador.
7. O SISTEMA DEVE permitir excluir/anonimizar os dados pessoais de um respondente sob solicitação (LGPD — direito de eliminação): substitui dados pessoais por valores anonimizados, preservando respostas para estatística.

### REQ-ADM-008 — Dashboard de indicadores

**Critérios de aceitação:**
1. O SISTEMA DEVE exibir um dashboard com filtro por survey e por período, contendo no mínimo:
   - **Total de acessos à página inicial** (evento `pagina_acessada`), **iniciados**, **completos** e **taxa de conclusão** (%).
   - **Funil**: acessou → identificou-se → respondeu 1ª pergunta → concluiu → visualizou relatório → solicitou envio (e-mail/WhatsApp) → solicitou consultor.
   - **Tempo médio de preenchimento** (apenas completos).
   - **Pergunta com maior abandono** (última pergunta respondida das sessões parciais, agregada).
   - **Distribuição de respostas por pergunta** (gráfico de barras por opção).
   - **Série temporal** de respostas por dia no período.
   - **Top itens do checklist** selecionados (por grupo).
2. Os dados do dashboard DEVEM ser calculados por queries agregadas no PostgreSQL (sem ferramenta externa de BI); QUANDO o volume exigir, materialized views são aceitáveis.
3. O dashboard DEVE carregar em até 3 segundos para até 10.000 sessões.

### REQ-ADM-009 — Gestão de usuários administradores

**Critérios de aceitação:**
1. O SISTEMA DEVE permitir a um administrador: criar novo administrador (nome, e-mail, senha temporária enviada por e-mail com troca obrigatória no primeiro login), inativar administrador e reativar.
2. O SISTEMA DEVE permitir ao usuário logado trocar a própria senha (exige senha atual).
3. QUANDO um administrador é inativado, O SISTEMA DEVE invalidar seus tokens ativos imediatamente.
4. O SISTEMA DEVE impedir a inativação do último administrador ativo.
5. (v1 tem papel único `admin`; a modelagem DEVE prever campo `role` para papéis futuros, ex.: `viewer`.)

---

## 6. Requisitos Funcionais — Relatório de Resultado

### REQ-REP-001 — Cálculo do resultado

**Critérios de aceitação:**
1. O SISTEMA DEVE calcular a pontuação da sessão como: soma de (`pontuacao da opção` × `peso da pergunta`) para perguntas de escolha; perguntas abertas não pontuam.
2. O SISTEMA DEVE classificar o resultado em **faixas de maturidade** configuráveis por survey (CRUD de faixas: nome, pontuação mínima, pontuação máxima, texto descritivo, cor). Ex.: 0–25 "Inicial", 26–50 "Em desenvolvimento", 51–75 "Gerenciado", 76–100 "Otimizado".
3. QUANDO o survey possui perguntas agrupadas por **dimensão** (campo opcional `dimensao` na pergunta), O SISTEMA DEVE calcular pontuação por dimensão para alimentar gráfico radar no relatório.
4. A pontuação DEVE ser normalizada para escala 0–100 (percentual do máximo possível **no caminho percorrido** pelo respondente, considerando a lógica condicional).

### REQ-REP-002 — Conteúdo e formato do relatório

**Critérios de aceitação:**
1. O relatório DEVE conter: identidade visual do survey, dados do respondente (nome, empresa), pontuação geral e faixa, gráfico radar por dimensão (quando houver dimensões), texto descritivo da faixa, resumo das respostas e recomendações.
2. O SISTEMA DEVE gerar, opcionalmente por survey (flag `usar_ia_no_relatorio`), um parágrafo de **recomendações personalizadas via Bedrock** com base nas respostas; QUANDO a chamada de IA falhar, O SISTEMA DEVE usar o texto padrão da faixa (fallback obrigatório — a geração do relatório nunca pode falhar por causa da IA).
3. O relatório DEVE existir em duas formas: **HTML** (visualização na tela final e no link público) e **PDF** (gerado pelo worker, armazenado em S3, anexado no e-mail). O PDF DEVE ser gerado a partir do mesmo HTML (Playwright/Chromium headless no worker).
4. O rodapé do relatório DEVE conter os dados de contato da BeOnUp e CTA para agendamento com consultor.

---

## 7. Requisitos Não Funcionais

### REQ-NFR-001 — Arquitetura e infraestrutura
1. Backend AdonisJS exposto como API REST em `api.boucheck.beonup.com.br` (App Runner ou 1 task Fargate, 0.5 vCPU / 1 GB).
2. Frontend Next.js em Amplify Hosting servindo `boucheck.beonup.com.br` (páginas públicas SSR; admin em `/admin` como SPA client-side).
3. Banco RDS PostgreSQL 16 single-AZ `db.t4g.micro`, em subnet privada; backend acessa via VPC connector; backups automáticos com retenção de 7 dias.
4. Jobs assíncronos (PDF, e-mail, WhatsApp, IA de relatório) via SQS + worker (`node ace queue:listen`) rodando no mesmo serviço/container do backend como processo separado; DLQ configurada com alarme.
5. Arquivos (logos, PDFs) em S3 com Block Public Access ativado; entrega via CloudFront com origin access control; PDFs de relatório acessados somente via URL assinada/tokenizada.
6. Infraestrutura descrita como código (preferência: AWS CDK em TypeScript) no repositório.

### REQ-NFR-002 — Segurança
1. HTTPS obrigatório em todas as rotas (certificados via ACM).
2. Endpoints públicos de resposta protegidos por rate limiting (ex.: 30 req/min por IP) e o token de sessão de resposta DEVE ser exigido em todas as escritas.
3. CORS restrito ao domínio do frontend.
4. Dados pessoais (nome, e-mail, telefone) tratados conforme LGPD: coleta com consentimento explícito e versão da política registrada (REQ-PUB-003), eliminação/anonimização sob demanda (REQ-ADM-007.7).
5. Segredos (chaves Meta/WhatsApp, credenciais SES) em AWS Secrets Manager ou SSM Parameter Store — nunca em variáveis de ambiente commitadas.
6. Logs de aplicação sem dados pessoais em claro (mascarar e-mail/telefone).

### REQ-NFR-003 — Desempenho e capacidade
1. Página pública do survey: LCP ≤ 2,5s em 4G.
2. API: p95 ≤ 500ms para endpoints de resposta.
3. Capacidade alvo v1: 100 respondentes simultâneos; 50.000 sessões/ano. Alta disponibilidade está explicitamente fora do escopo.

### REQ-NFR-004 — Qualidade de código e testes
1. TypeScript estrito em backend e frontend.
2. Testes automatizados (Japa no Adonis): cobertura obrigatória para o **motor de lógica condicional** (navegação, invalidação de respostas ao voltar, prevenção de loops), **cálculo de pontuação/normalização** e **registro de eventos**.
3. Migrações de banco versionadas (Lucid); seeds para dados de desenvolvimento (1 survey exemplo com cascata).
4. Lint + format padronizados (ESLint/Prettier) com verificação em CI.

### REQ-NFR-005 — Observabilidade
1. Logs estruturados (JSON) enviados ao CloudWatch Logs.
2. Métricas mínimas: erros 5xx, profundidade da fila SQS, falhas de envio (e-mail/WhatsApp), latência p95.
3. Alarme CloudWatch para DLQ > 0 e para taxa de erro 5xx > 5% em 5 min, com notificação por e-mail (SNS).

---

## 8. Modelo de Dados (referência para o design)

> O design detalhado (índices, constraints) será elaborado na fase de `design.md`. Estrutura de referência:

```
categories            (id, nome, timestamps)
surveys               (id, slug UNIQUE, nome, categoria_id FK, status, version,
                       mensagem_objetivo, tempo_estimado_min, config_visual JSONB{cor_primaria, cor_secundaria, cor_fundo, logo_s3_key},
                       link_agendamento, email_notificacao, usar_ia_no_relatorio BOOL,
                       created_by FK admin_users, timestamps)
questions             (id, survey_id FK, survey_version, texto, descricao, tipo ENUM, obrigatoria BOOL,
                       ordem INT, peso NUMERIC, dimensao VARCHAR NULL, timestamps)
question_options      (id, question_id FK, texto, pontuacao NUMERIC, ordem INT)
question_rules        (id, question_option_id FK, next_question_id FK NULL, finalizar BOOL DEFAULT false,
                       priority INT)          -- next_question_id NULL + finalizar=true => encerramento antecipado
checklist_items       (id, survey_id FK, nome, grupo ENUM(servico_cloud|fabricante|solucao))
score_ranges          (id, survey_id FK, nome, min NUMERIC, max NUMERIC, descricao TEXT, cor)
responses             (id UUID, survey_id FK, survey_version, token UUID UNIQUE,
                       nome, telefone, empresa, email, cargo, cidade,
                       politica_versao, status ENUM(iniciado|completo),
                       pontuacao NUMERIC NULL, faixa_id FK NULL,
                       started_at, completed_at, anonimizado BOOL DEFAULT false, timestamps)
response_answers      (id, response_id FK, question_id FK, question_option_id FK NULL, texto_livre TEXT NULL,
                       UNIQUE(response_id, question_id, question_option_id))
response_checklist    (id, response_id FK, checklist_item_id FK)
response_events       (id, response_id FK, tipo VARCHAR, payload JSONB NULL, created_at)
                       -- tipos: pagina_acessada, privacidade_aceita, pergunta_respondida, concluido,
                       --        relatorio_visualizado, relatorio_email_solicitado, relatorio_email_enviado,
                       --        relatorio_whatsapp_solicitado, relatorio_whatsapp_enviado,
                       --        relatorio_envio_falhou, relatorio_link_acessado, consultor_solicitado
reports               (id, response_id FK UNIQUE, html_s3_key, pdf_s3_key NULL, public_token UNIQUE,
                       expires_at, timestamps)
admin_users           (id, nome, email UNIQUE, password_hash, role, ativo BOOL,
                       must_change_password BOOL, last_login_at, timestamps)
ai_generation_logs    (id, admin_user_id FK, survey_id FK, prompt TEXT, resultado JSONB,
                       tokens_input INT NULL, tokens_output INT NULL, sucesso BOOL, created_at)
```

---

## 9. Contratos de API (visão de alto nível)

**Público (`/api/public`):**
- `GET /surveys/{slug}` — metadados + identidade visual da página inicial
- `GET /surveys/{slug}/structure` — perguntas, opções e regras (para o motor de navegação)
- `POST /surveys/{slug}/responses` — cria sessão (identificação + aceite) → retorna token
- `PUT /responses/{token}/answers/{questionId}` — grava/atualiza resposta (auto-save)
- `POST /responses/{token}/checklist` — grava checklist
- `POST /responses/{token}/complete` — conclui, revalida caminho, calcula pontuação
- `POST /responses/{token}/report/email` | `/report/whatsapp` — enfileira envio
- `POST /responses/{token}/events` — eventos de UI (ex.: `relatorio_visualizado`, `consultor_solicitado`)
- `GET /r/{publicToken}` — relatório público (HTML)

**Admin (`/api/admin`, autenticado):**
- CRUD `surveys`, `categories`, `questions`, `options`, `rules`, `checklist-items`, `score-ranges`
- `POST /surveys/{id}/ai/generate-questions` — geração via Bedrock (preview, não persiste)
- `GET /responses` (filtros + paginação) | `GET /responses/{id}` (detalhe + timeline) | `POST /responses/{id}/resend`
- `GET /responses/export.csv`
- `GET /dashboard` (agregados, com filtros)
- CRUD `admin-users`; `POST /auth/login`, `/auth/forgot`, `/auth/reset`, `PUT /me/password`

---

## 10. Critérios de Aceite Gerais da Entrega (Definition of Done)

1. Todos os requisitos `REQ-*` implementados com seus critérios de aceitação verificáveis.
2. Testes automatizados passando em CI para os módulos críticos (REQ-NFR-004.2).
3. Seed com survey de demonstração contendo: 8+ perguntas dos 3 tipos, ao menos 2 regras de cascata, checklist e faixas de pontuação.
4. Fluxo ponta-a-ponta validado manualmente: acesso público → identificação → respostas com desvio condicional → checklist → conclusão → visualizar relatório → envio por e-mail e WhatsApp → verificação da timeline e do dashboard no admin.
5. Infra provisionada via IaC, com README de deploy e variáveis de ambiente documentadas.
6. Nenhum segredo em código ou repositório.

---

## 11. Riscos e Premissas

| # | Item | Tipo | Mitigação |
|---|---|---|---|
| 1 | Aprovação de template WhatsApp pela Meta pode demorar | Risco | Iniciar solicitação do template na semana 1; e-mail como canal garantido |
| 2 | Custo de Bedrock em geração de perguntas/relatórios | Risco | Log de tokens (REQ-ADM-004.6), limite de 20 perguntas por geração, fallback sem IA no relatório |
| 3 | Geração de PDF com Chromium no worker consome memória | Risco | Gerar PDF sob demanda (apenas quando solicitado envio), 1 job por vez no worker |
| 4 | Conta AWS já possui domínio beonup.com.br no Route53 | Premissa | Validar acesso à zona hospedada antes do deploy |
| 5 | Política de privacidade será fornecida pelo jurídico/BeOnUp | Premissa | Campo de conteúdo versionado no admin; placeholder em dev |
| 6 | Identidade visual (cores/logo) será fornecida pelo Leonardo | Premissa | Upload configurável por survey já cobre a entrega tardia |
