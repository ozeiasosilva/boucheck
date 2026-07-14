# BouCheck — Backend API

API REST para a plataforma **BouCheck**, um sistema de pesquisas e diagnósticos empresariais com geração de relatórios, scoring automático e integração com IA.

## Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Runtime | Node.js ≥ 22 |
| Framework | AdonisJS 6 |
| ORM | Lucid (AdonisJS) |
| Banco de dados | PostgreSQL |
| Validação | VineJS |
| Autenticação | Token-based (AdonisJS Auth) |
| IA | AWS Bedrock (Claude 3.5 Sonnet) |
| Storage | AWS S3 |
| Fila | AWS SQS |
| Email | AWS SES |
| Mensageria | WhatsApp Cloud API |
| PDF | Playwright Chromium |
| Linguagem | TypeScript (strict) |

## Pré-requisitos

- Node.js ≥ 22
- PostgreSQL ≥ 14
- Conta AWS com acesso a S3, SQS, SES e Bedrock (para funcionalidades completas)

## Instalação

```bash
# Clonar o repositório
git clone <url-do-repositorio>
cd boucheck-backend

# Instalar dependências
npm install

# Copiar variáveis de ambiente
cp .env.example .env
# Editar .env com suas credenciais

# Rodar migrations
node ace migration:run

# (Opcional) Seed do admin padrão
node ace db:seed

# Iniciar em desenvolvimento
npm run dev
```

## Variáveis de Ambiente

| Variável | Descrição |
|----------|-----------|
| `NODE_ENV` | Ambiente (development, production) |
| `PORT` | Porta do servidor (padrão: 3333) |
| `HOST` | Host de escuta (padrão: 0.0.0.0) |
| `APP_KEY` | Chave secreta da aplicação (gerar com `node ace generate:key`) |
| `LOG_LEVEL` | Nível de log (info, debug, warn, error) |
| `DB_HOST` | Host do PostgreSQL |
| `DB_PORT` | Porta do PostgreSQL |
| `DB_USER` | Usuário do banco |
| `DB_PASSWORD` | Senha do banco |
| `DB_DATABASE` | Nome do banco de dados |
| `CDN_BASE_URL` | URL base do CDN para assets |
| `S3_LOGOS_BUCKET` | Bucket S3 para logos de pesquisas |
| `S3_REPORTS_BUCKET` | Bucket S3 para relatórios PDF |
| `SQS_REPORTING_QUEUE_URL` | URL da fila SQS para processamento de relatórios |
| `AWS_REGION` | Região AWS principal |
| `SES_FROM_EMAIL` | Email remetente para notificações |
| `BEDROCK_MODEL_ID` | ID do modelo AI no Bedrock |
| `BEDROCK_REGION` | Região do Bedrock |
| `BEDROCK_TIMEOUT_MS` | Timeout para chamadas ao Bedrock |
| `WHATSAPP_PHONE_NUMBER_ID` | ID do número WhatsApp Business |
| `WHATSAPP_ACCESS_TOKEN` | Token de acesso da API WhatsApp |
| `WHATSAPP_API_VERSION` | Versão da API WhatsApp |
| `WHATSAPP_TEMPLATE_NAME` | Nome do template de mensagem |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Idioma do template |

## Scripts Disponíveis

```bash
npm run dev          # Servidor de desenvolvimento com hot-reload
npm run build        # Build de produção
npm run start        # Iniciar build de produção
npm run typecheck    # Verificação de tipos TypeScript
npm run lint         # ESLint
npm run format:check # Verificação de formatação (Prettier)
npm run worker       # Worker para processamento de filas (SQS)
npm run test         # Executar testes
```

## Estrutura do Projeto

```
backend/
├── app/
│   ├── controllers/
│   │   ├── admin/           # Controllers do painel administrativo
│   │   └── public/          # Controllers das rotas públicas (respondente)
│   ├── jobs/                # Background jobs (PDF, email, WhatsApp, scoring)
│   ├── middleware/          # Auth, rate-limit, force HTTPS, token validation
│   ├── models/             # Models Lucid (ORM)
│   ├── policies/           # Políticas de autorização
│   ├── services/           # Lógica de negócio (35+ services)
│   └── validators/         # Schemas de validação VineJS
├── config/                 # Configurações do framework
├── database/
│   ├── migrations/         # 24 migrations (schema completo)
│   └── seeders/            # Seeds de dados iniciais
├── start/
│   ├── kernel.ts           # Middleware global e named middleware
│   └── routes.ts           # Definição de todas as rotas
├── tests/
│   ├── unit/               # Testes unitários
│   ├── functional/         # Testes funcionais (integração)
│   └── property/           # Testes baseados em propriedades (fast-check)
├── adonisrc.ts             # Configuração principal do AdonisJS
├── tsconfig.json
└── package.json
```

## Arquitetura da API

### Rotas Admin (`/api/admin`)

Protegidas por autenticação via token + verificação de admin ativo. HTTPS obrigatório.

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/auth/login` | Login do admin |
| POST | `/auth/forgot` | Solicitar reset de senha |
| POST | `/auth/reset` | Redefinir senha |
| GET | `/me` | Dados do admin logado |
| PUT | `/me/password` | Alterar senha |
| PUT | `/me/tema` | Preferência de tema |
| CRUD | `/admin-users` | Gestão de usuários admin |
| CRUD | `/surveys` | Gestão de pesquisas |
| CRUD | `/categories` | Gestão de categorias |
| CRUD | `/surveys/:id/questions` | Gestão de perguntas |
| CRUD | `/questions/:id/options` | Gestão de opções |
| CRUD | `/rules` | Regras de navegação condicional |
| CRUD | `/surveys/:id/checklist-items` | Itens de checklist |
| CRUD | `/surveys/:id/score-ranges` | Faixas de pontuação |
| GET | `/responses` | Listagem de respostas |
| GET | `/responses/:id` | Detalhe de resposta |
| POST | `/responses/:id/resend` | Reenviar relatório |
| POST | `/responses/:id/anonymize` | Anonimizar resposta |
| GET | `/responses/export.csv` | Exportação CSV |
| GET | `/dashboard` | Dados do dashboard |
| POST | `/surveys/:id/ai/generate-questions` | Gerar perguntas com IA |
| POST | `/surveys/:id/ai/confirm-questions` | Confirmar perguntas geradas |
| POST | `/insights/survey` | Gerar insight de pesquisa |
| POST | `/insights/client` | Gerar insight de cliente |
| GET/PUT | `/ai-config/prompts` | Configuração dos prompts de IA |

### Rotas Públicas (`/api/public`)

Para respondentes. Rate-limited por IP. Escrita autenticada por token de sessão.

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/surveys/:slug` | Metadados da pesquisa |
| GET | `/surveys/:slug/structure` | Estrutura completa da pesquisa |
| POST | `/surveys/:slug/responses` | Criar sessão de resposta |
| PUT | `/responses/:token/answers/:questionId` | Salvar resposta (auto-save) |
| POST | `/responses/:token/checklist` | Salvar checklist |
| POST | `/responses/:token/complete` | Finalizar pesquisa |
| POST | `/responses/:token/events` | Registrar eventos de UX |
| GET | `/responses/:token/report` | Visualizar relatório |
| POST | `/responses/:token/deliveries/email` | Enviar relatório por email |
| POST | `/responses/:token/deliveries/whatsapp` | Enviar relatório por WhatsApp |

### Rota de Relatório Público

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/r/:token` | Visualizar relatório via link público |

## Modelos de Dados

- **AdminUser** — Usuários administrativos
- **Survey** — Pesquisas/diagnósticos
- **Category** — Categorias de agrupamento de perguntas
- **Question** — Perguntas da pesquisa
- **QuestionOption** — Opções de resposta
- **QuestionRule** — Regras de navegação condicional
- **ChecklistItem** — Itens de checklist pós-pesquisa
- **ScoreRange** — Faixas de pontuação com recomendações
- **Response** — Sessão de resposta do respondente
- **ResponseAnswer** — Respostas individuais
- **ResponseChecklist** — Checklist preenchido
- **ResponseEvent** — Eventos de interação (analytics)
- **Report** — Relatório gerado (PDF)
- **AiGenerationLog** — Log de gerações de IA
- **AiPromptConfig** — Configuração de prompts de IA
- **SurveyInsight** — Insights gerados por IA para pesquisas
- **ClientInsight** — Insights gerados por IA para clientes
- **InteractionHistory** — Histórico de interações com IA

## Jobs (Background Processing)

| Job | Descrição |
|-----|-----------|
| `ScoreCalculatorJob` | Calcula score por categoria e geral |
| `ReportGeneratorJob` | Gera relatório com recomendações |
| `PdfGenerationJob` | Renderiza PDF via Playwright |
| `EmailDeliveryJob` | Envia relatório por email via SES |
| `WhatsAppDeliveryJob` | Envia relatório por WhatsApp |
| `ConsultantNotifyJob` | Notifica consultor sobre agendamento |
| `ReportingDispatcher` | Orquestra o pipeline de relatório |
| `ReportingWorker` | Worker SQS para processamento assíncrono |

## Testes

```bash
# Todos os testes
npm run test

# Suítes específicas
node ace test --suite=unit
node ace test --suite=functional
node ace test --suite=property
```

Os testes utilizam:
- **Japa** (test runner do AdonisJS)
- **fast-check** para testes baseados em propriedades

## Deploy

```bash
# Build
npm run build

# Rodar em produção
cd build
npm ci --production
node bin/server.js

# Worker (em processo separado)
npx tsx bin/worker.ts
```

O servidor necessita de:
- PostgreSQL acessível
- Variáveis de ambiente configuradas
- Credenciais AWS com permissões para S3, SQS, SES e Bedrock
- (Opcional) Playwright + Chromium para geração de PDF

## Licença

Projeto privado — todos os direitos reservados.
