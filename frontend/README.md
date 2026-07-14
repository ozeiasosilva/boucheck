# BouCheck — Frontend

Interface web da plataforma **BouCheck**, um sistema de pesquisas e diagnósticos empresariais. Inclui o painel administrativo e o fluxo público de resposta para os respondentes.

## Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 15 (App Router) |
| UI | React 19 |
| Estilização | Tailwind CSS 4 |
| Linguagem | TypeScript (strict) |
| Build | PostCSS + SWC |
| Linting | ESLint 9 + Prettier |

## Pré-requisitos

- Node.js ≥ 18
- Backend da API rodando (padrão: `http://localhost:3858`)

## Instalação

```bash
# Clonar o repositório
git clone <url-do-repositorio>
cd boucheck-frontend

# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.local.example .env.local
# Editar .env.local se necessário

# Iniciar em desenvolvimento
npm run dev
```

A aplicação estará disponível em `http://localhost:3000`.

## Variáveis de Ambiente

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `NEXT_PUBLIC_API_URL` | URL base da API backend | `http://localhost:3858` |

## Scripts Disponíveis

```bash
npm run dev          # Servidor de desenvolvimento (Next.js)
npm run build        # Build de produção
npm run start        # Iniciar build de produção
npm run typecheck    # Verificação de tipos TypeScript
npm run lint         # ESLint
npm run format:check # Verificação de formatação (Prettier)
```

## Estrutura do Projeto

```
frontend/
├── app/
│   ├── [slug]/                  # Fluxo público (respondente)
│   │   ├── page.tsx             # Landing page da pesquisa
│   │   ├── layout.tsx           # Layout do fluxo público
│   │   ├── response-provider-wrapper.tsx
│   │   ├── identificacao/       # Formulário de identificação
│   │   ├── perguntas/           # Navegação de perguntas
│   │   ├── checklist/           # Checklist pós-pesquisa
│   │   └── concluido/           # Tela de conclusão + relatório
│   ├── admin/                   # Painel administrativo
│   │   ├── layout.tsx           # Layout do admin (sidebar, header)
│   │   ├── login/               # Página de login
│   │   ├── dashboard/           # Dashboard com métricas
│   │   ├── surveys/             # CRUD de pesquisas
│   │   ├── categories/          # Gestão de categorias
│   │   ├── users/               # Gestão de admins
│   │   ├── responses/           # Tracking de respostas
│   │   ├── ai-config/           # Configuração de prompts de IA
│   │   └── me/                  # Perfil do admin
│   ├── layout.tsx               # Root layout (pt-BR)
│   ├── page.tsx                 # Home page
│   ├── not-found.tsx            # Página 404
│   └── globals.css              # Estilos globais (Tailwind)
├── components/
│   └── admin/                   # Componentes do painel admin
├── lib/
│   ├── api/                     # Client HTTP para a API
│   ├── admin/                   # Utilitários do admin
│   ├── identificacao/           # Lógica de identificação
│   └── navigation/              # Lógica de navegação de perguntas
├── middleware.ts                # Proteção de rotas admin (cookie-based)
├── next.config.ts               # Configuração do Next.js
├── postcss.config.mjs           # PostCSS + Tailwind
├── tsconfig.json
└── package.json
```

## Arquitetura

### Fluxo Público (Respondente)

O respondente acessa a pesquisa via URL com slug (`/minha-pesquisa`). O fluxo é:

1. **Landing** (`/[slug]`) — Apresentação da pesquisa com identidade visual personalizada
2. **Identificação** (`/[slug]/identificacao`) — Formulário com dados do respondente
3. **Perguntas** (`/[slug]/perguntas`) — Navegação por perguntas com auto-save
4. **Checklist** (`/[slug]/checklist`) — Checklist de boas práticas (se configurado)
5. **Conclusão** (`/[slug]/concluido`) — Resultado com relatório e opções de envio

O estado da sessão é gerenciado via token retornado pela API após a identificação.

### Painel Administrativo

Protegido por cookie de sessão (`boucheck_admin_session`). O middleware do Next.js redireciona para `/admin/login` quando não autenticado.

Funcionalidades:
- **Dashboard** — Métricas em tempo real (respostas, completions, scores)
- **Pesquisas** — CRUD completo com preview, duplicação, identidade visual
- **Categorias** — Gestão de categorias de perguntas
- **Respostas** — Tracking, detalhes, reenvio, anonimização, export CSV
- **Usuários** — Gestão de admins
- **IA Config** — Personalização de prompts para geração de perguntas e insights
- **Perfil** — Alteração de senha e preferência de tema

### Autenticação

O fluxo de autenticação utiliza:
1. Login via API → recebe token Bearer
2. Token armazenado em `localStorage` (uso no client-side)
3. Cookie `boucheck_admin_session` setado para o middleware Next.js (SSR/route protection)
4. Logout limpa ambos

### Comunicação com a API

A camada `lib/api/` encapsula todas as chamadas HTTP para o backend, utilizando `NEXT_PUBLIC_API_URL` como base URL.

## Personalização Visual

Cada pesquisa pode ter identidade visual personalizada:
- Logo customizado (upload via admin)
- Cores primárias e secundárias
- Estilos aplicados dinamicamente no fluxo público

## Deploy

```bash
# Build de produção
npm run build

# Iniciar
npm run start
```

### Variáveis de produção

```env
NEXT_PUBLIC_API_URL=https://api.boucheck.beonup.com.br
```

### Opções de hospedagem recomendadas

- **Vercel** — Deploy nativo Next.js (recomendado)
- **AWS Amplify** — Integração com ecossistema AWS
- **Docker** — Container com `next start` para ambientes customizados

## Desenvolvimento

### Convenções

- Path alias `@/*` aponta para a raiz do projeto
- Componentes em `components/` organizados por domínio
- Lógica reutilizável em `lib/` separada por módulo
- Pages seguem a convenção do App Router (Next.js 15)
- Idioma da interface: Português (pt-BR)

### Type Checking

```bash
npm run typecheck
```

### Linting e Formatação

```bash
npm run lint
npm run format:check
```

## Licença

Projeto privado — todos os direitos reservados.
