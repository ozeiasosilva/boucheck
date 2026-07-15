# Design Document

## Overview

Este documento descreve a arquitetura e o design para as correções de comportamento dos botões de conclusão e melhorias no relatório HTML do BouCheck. As mudanças abrangem: construção correta de logo_url, novo campo `telefone_whatsapp` no Survey, redirecionamento do botão de consultor para WhatsApp, padronização visual, flag `solicitou_whatsapp` no Response, e envio de e-mail ao consultor com PDF.

## Architecture

### Visão Geral

As alterações seguem a arquitetura existente em camadas:

```
Frontend (Next.js)          Backend (AdonisJS)           Infra (SQS)
┌─────────────────┐        ┌──────────────────────┐     ┌────────────────────────┐
│ /[slug]/concluido│───────▶│ CompletionController │     │ reportingQueue         │
│ page.tsx         │◀───────│ (logo_url, tel_whats)│     │                        │
│                  │        │                      │     │ consultant_whatsapp_   │
│ Botão Consultor  │───────▶│ ReportActionController│───▶│ notify_job             │
│ (wa.me link)    │        │ (whatsapp delivery)  │     │                        │
└─────────────────┘        ├──────────────────────┤     └────────────────────────┘
                           │ report_html_template │
                           │ (logo CDN fix)       │
                           └──────────────────────┘
```

### Componentes Afetados

1. **Survey Model** — novo campo `telefone_whatsapp`
2. **Response Model** — novo campo `solicitou_whatsapp`
3. **CompletionController** — retorna `logo_url` e `telefone_whatsapp`
4. **ReportActionController** — seta `solicitou_whatsapp`, enfileira `consultant_whatsapp_notify`
5. **report_html_template.ts** — corrige renderização do logo com CDN_BASE_URL
6. **Frontend page.tsx** — usa logo_url, redireciona consultor para wa.me, padroniza visual
7. **Novo job: consultant_whatsapp_notify_job.ts** — envia e-mail ao consultor com PDF

## Components and Interfaces

### 1. Função utilitária `buildLogoUrl`

Extraída para reutilização no CompletionController e no report_html_template:

```typescript
// backend/app/support/build_logo_url.ts
import env from '#start/env'

const CDN_BASE_URL = env.get('CDN_BASE_URL', 'https://cdn.boucheck.beonup.com.br')

/**
 * Constrói a URL do logo a partir da chave S3.
 * - null/vazio → null
 * - "__default__" → "/logo_completo.png"
 * - qualquer outro → CDN_BASE_URL + "/" + logoS3Key
 */
export function buildLogoUrl(logoS3Key: string | null | undefined): string | null {
  if (!logoS3Key) return null
  if (logoS3Key === '__default__') return '/logo_completo.png'
  return `${CDN_BASE_URL}/${logoS3Key}`
}
```

### 2. Migration: adicionar `telefone_whatsapp` ao Survey

```typescript
// backend/database/migrations/XXXX_add_telefone_whatsapp_to_surveys.ts
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'surveys'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('telefone_whatsapp', 20).nullable().defaultTo(null)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('telefone_whatsapp')
    })
  }
}
```

### 3. Migration: adicionar `solicitou_whatsapp` ao Response

```typescript
// backend/database/migrations/XXXX_add_solicitou_whatsapp_to_responses.ts
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'responses'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('solicitou_whatsapp').notNullable().defaultTo(false)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('solicitou_whatsapp')
    })
  }
}
```

### 4. Survey Model — novo campo

```typescript
// Adição em backend/app/models/survey.ts
@column({ columnName: 'telefone_whatsapp' })
declare telefoneWhatsapp: string | null
```

### 5. Response Model — novo campo

```typescript
// Adição em backend/app/models/response.ts
@column({ columnName: 'solicitou_whatsapp' })
declare solicitouWhatsapp: boolean
```

### 6. CompletionController — alterações

O endpoint `POST /api/public/responses/:token/complete` passa a retornar:

```typescript
import { buildLogoUrl } from '#support/build_logo_url'

// No final do handle():
return response.ok({
  completed: true,
  completed_at: now.toISO(),
  logo_url: buildLogoUrl(survey.configVisual?.logo_s3_key ?? null),
  telefone_whatsapp: survey.telefoneWhatsapp ?? null,
  mostrar_btn_relatorio: survey.mostrarBtnRelatorio ?? true,
  mostrar_btn_email: survey.mostrarBtnEmail ?? true,
  mostrar_btn_whatsapp: survey.mostrarBtnWhatsapp ?? true,
  mostrar_btn_consultor: survey.mostrarBtnConsultor ?? true,
})
```

### 7. ReportActionController — alterações no endpoint WhatsApp

```typescript
// No método whatsapp():
// Após o enqueue existente de whatsapp_deliver:

// Setar flag solicitou_whatsapp
session.solicitouWhatsapp = true
await session.save()

// Enfileirar notificação ao consultor se email_notificacao disponível
const survey = await Survey.find(session.surveyId)
if (survey?.emailNotificacao) {
  await reportingQueue.enqueue({
    kind: 'consultant_whatsapp_notify',
    response_id: session.id,
    to_email: survey.emailNotificacao,
  })
}
```

### 8. report_html_template.ts — correção do logo

A função `renderHeader` passa a usar `buildLogoUrl`:

```typescript
import { buildLogoUrl } from '#support/build_logo_url'

function renderHeader(ctx: ReportContext): string {
  const logoUrl = buildLogoUrl(ctx.visualIdentity.logoS3Key ?? null)
  const logoHtml = logoUrl
    ? `<img class="logo" src="${esc(logoUrl)}" alt="Logo" />`
    : ''
  // ... resto igual
}
```

### 9. renderFooter — condicionalidade do botão de agendamento

```typescript
function renderFooter(footer: ReportContext['footer']): string {
  const ctaHtml = footer.linkAgendamento
    ? `<a class="cta-link" href="${esc(footer.linkAgendamento)}">Agendar apresentação com um consultor</a>`
    : ''

  return `<div class="footer">
    <div class="contact">${esc(footer.contact)}</div>
    ${ctaHtml}
  </div>`
}
```

### 10. Novo Job: consultant_whatsapp_notify_job.ts

```typescript
// backend/app/jobs/consultant_whatsapp_notify_job.ts
import Response from '#models/response'
import Report from '#models/report'
import mail from '@adonisjs/mail/services/main'

interface ConsultantWhatsappNotifyPayload {
  response_id: string
  to_email: string
}

export async function handleConsultantWhatsappNotify(payload: ConsultantWhatsappNotifyPayload) {
  const session = await Response.findOrFail(payload.response_id)
  const report = await Report.query().where('response_id', session.id).first()

  // Se o PDF não está disponível ainda, lançar erro para retry pela fila
  if (!report?.pdfS3Key) {
    throw new Error(`PDF not ready for response_id=${session.id}`)
  }

  // Buscar PDF do S3 (ou usar URL pública)
  const pdfUrl = report.pdfS3Key // Implementação depende do serviço de storage

  await mail.send((message) => {
    message
      .to(payload.to_email)
      .subject(`Novo respondente solicitou relatório via WhatsApp`)
      .htmlView('emails/consultant_whatsapp_notify', {
        nome: session.nome,
        empresa: session.empresa,
        telefone: session.telefone,
        email: session.email,
      })
    // Anexar PDF quando disponível
    if (pdfUrl) {
      message.attach(pdfUrl, { filename: 'relatorio.pdf' })
    }
  })
}
```

### 11. Frontend — Alterações na página de conclusão

#### 11.1 Logo dinâmico

```typescript
// Estado adicional no componente:
const [logoUrl, setLogoUrl] = useState<string | null>(null)
const [telefoneWhatsapp, setTelefoneWhatsapp] = useState<string | null>(null)

// No doCompletion(), extrair os novos campos:
setLogoUrl(data.logo_url ?? null)
setTelefoneWhatsapp(data.telefone_whatsapp ?? null)

// No JSX, substituir logo fixo:
<img
  src={logoUrl || '/logo_completo.png'}
  alt="Logo"
  className="h-10 w-auto object-contain"
/>
```

#### 11.2 Botão consultor → WhatsApp

```typescript
// Função buildWhatsappUrl
function buildWhatsappUrl(telefone: string): string {
  return `https://wa.me/${telefone}`
}

// Handler do botão consultor:
async function handleConsultantRequest() {
  if (!token || !telefoneWhatsapp) return
  // Registrar evento antes de abrir WhatsApp
  await logEvent(token, 'consultor_solicitado', { via: 'whatsapp' })
  // Abrir WhatsApp em nova aba
  window.open(buildWhatsappUrl(telefoneWhatsapp), '_blank', 'noopener,noreferrer')
}

// Visibilidade: ocultar se telefone_whatsapp ausente
{buttonConfig.mostrar_btn_consultor && telefoneWhatsapp && (
  // ... botão
)}
```

#### 11.3 Padronização visual do botão consultor

O botão "Falar com um consultor" adota as mesmas classes do botão "Receber relatório por WhatsApp":

```tsx
<button
  onClick={handleConsultantRequest}
  className="w-full px-4 py-3 bg-green-600 text-white font-medium rounded-lg
    hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500
    focus:ring-offset-2 transition-colors text-sm"
>
  <span className="flex items-center justify-center gap-2">
    {/* Ícone WhatsApp SVG */}
    Falar com um consultor
  </span>
</button>
```

### 12. API Client — novos campos na tipagem

```typescript
// Em frontend/lib/api/client.ts, atualizar tipo de retorno do triggerCompletion:
export async function triggerCompletion(token: string): Promise<{
  completed: boolean
  completed_at: string
  logo_url: string | null
  telefone_whatsapp: string | null
  mostrar_btn_relatorio: boolean
  mostrar_btn_email: boolean
  mostrar_btn_whatsapp: boolean
  mostrar_btn_consultor: boolean
}> { /* ... */ }
```

### Interfaces

### CompletionController Response (atualizado)

```typescript
interface CompletionResponse {
  completed: boolean
  completed_at: string
  logo_url: string | null
  telefone_whatsapp: string | null
  mostrar_btn_relatorio: boolean
  mostrar_btn_email: boolean
  mostrar_btn_whatsapp: boolean
  mostrar_btn_consultor: boolean
}
```

### Consultant WhatsApp Notify Job Payload

```typescript
interface ConsultantWhatsappNotifyPayload {
  kind: 'consultant_whatsapp_notify'
  response_id: string
  to_email: string
}
```

## Data Models

### Survey (alterações)

| Campo              | Tipo          | Nullable | Default | Descrição                              |
| ------------------ | ------------- | -------- | ------- | -------------------------------------- |
| telefone_whatsapp  | varchar(20)   | Sim      | null    | Número WhatsApp do consultor (formato internacional) |

### Response (alterações)

| Campo              | Tipo    | Nullable | Default | Descrição                                    |
| ------------------ | ------- | -------- | ------- | -------------------------------------------- |
| solicitou_whatsapp | boolean | Não      | false   | Flag indicando solicitação de relatório via WA |

## Error Handling

| Cenário                                 | Comportamento                                                  |
| --------------------------------------- | -------------------------------------------------------------- |
| logo_s3_key nulo/vazio                  | Retorna logo_url como null; frontend usa fallback              |
| telefone_whatsapp nulo no Survey        | Oculta botão "Falar com um consultor" na UI                    |
| PDF não disponível no job de notify     | Job lança erro → retry automático pela fila SQS                |
| email_notificacao ausente no Survey     | Omite enfileiramento do job de notificação (sem erro)          |
| Falha no envio de e-mail do job         | Erro propagado para retry pela fila                            |

## Testing Strategy

### Testes Unitários (Exemplos)
- Verificar que `buildLogoUrl("__default__")` retorna `"/logo_completo.png"`
- Verificar que CompletionController retorna `telefone_whatsapp` do survey
- Verificar que o frontend oculta o botão consultor quando `telefone_whatsapp` é null
- Verificar que `renderFooter` omite o CTA quando `linkAgendamento` é vazio

### Testes de Propriedade (PBT)
- Property 1: Construção de logo URL — gerar strings aleatórias e validar regras
- Property 2: Construção de URL wa.me — gerar números e validar formato
- Property 3: Visibilidade condicional do botão — gerar combinações e validar ocultação
- Property 4: Conteúdo do e-mail — gerar dados de respondente e validar presença

### Testes de Integração
- Endpoint WhatsApp seta `solicitou_whatsapp = true` e enfileira job
- Job de notificação ao consultor envia e-mail com PDF anexo
- Retry do job quando PDF não está disponível

## Correctness Properties

*Uma propriedade é uma característica ou comportamento que deve ser verdadeiro em todas as execuções válidas de um sistema — essencialmente, uma declaração formal sobre o que o sistema deve fazer.*

### Property 1: Construção de logo URL segue regras determinísticas

*Para qualquer* valor de `logo_s3_key` que seja uma string não-vazia e diferente de `"__default__"`, a função `buildLogoUrl` SHALL retornar a concatenação de `CDN_BASE_URL + "/" + logo_s3_key`. Para qualquer valor nulo ou string vazia, SHALL retornar `null`. Para o valor `"__default__"`, SHALL retornar `"/logo_completo.png"`.

**Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3**

### Property 2: URL de WhatsApp do consultor é construída corretamente

*Para qualquer* string `telefone_whatsapp` não-vazia representando um número de telefone, a URL construída para o botão de consultor SHALL ser exatamente `"https://wa.me/" + telefone_whatsapp`.

**Validates: Requirements 4.2**

### Property 3: Botão de consultor é oculto quando telefone_whatsapp é ausente

*Para qualquer* combinação de `mostrar_btn_consultor` (true/false) e `telefone_whatsapp` sendo `null` ou string vazia, o botão "Falar com um consultor" SHALL não ser visível na interface de conclusão.

**Validates: Requirements 4.3**

### Property 4: E-mail de notificação ao consultor contém dados obrigatórios do respondente

*Para quaisquer* dados de respondente (nome, empresa, telefone, email) não-nulos, quando o `Consultant_WhatsApp_Notify_Job` é processado, o corpo do e-mail gerado SHALL conter todos os quatro campos do respondente.

**Validates: Requirements 7.2**
