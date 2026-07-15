# Implementation Plan: Completion Buttons Behavior Fixes

## Overview

Implementação das correções de comportamento dos botões de conclusão: construção correta de `logo_url`, novo campo `telefone_whatsapp` no Survey, redirecionamento do botão de consultor para WhatsApp, padronização visual, flag `solicitou_whatsapp` no Response, e envio de e-mail ao consultor com PDF. As tarefas seguem a arquitetura existente em camadas (Backend AdonisJS + Frontend Next.js + SQS).

## Tasks

- [x] 1. Criar função utilitária buildLogoUrl e migrations de banco
  - [x] 1.1 Criar a função utilitária `buildLogoUrl` em `backend/app/support/build_logo_url.ts`
    - Criar o arquivo `backend/app/support/build_logo_url.ts`
    - Implementar a lógica: null/vazio → null, `__default__` → `/logo_completo.png`, qualquer outro → `CDN_BASE_URL + "/" + logoS3Key`
    - Importar `env` de `#start/env` para ler `CDN_BASE_URL`
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_

  - [ ]* 1.2 Escrever property test para `buildLogoUrl`
    - **Property 1: Construção de logo URL segue regras determinísticas**
    - Gerar strings aleatórias e validar que: null/vazio → null, `__default__` → `/logo_completo.png`, qualquer outro → `CDN_BASE_URL/{valor}`
    - **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3**

  - [x] 1.3 Criar migration para adicionar `telefone_whatsapp` ao Survey
    - Criar arquivo de migration `XXXX_add_telefone_whatsapp_to_surveys.ts`
    - Adicionar coluna `telefone_whatsapp` varchar(20), nullable, default null
    - _Requirements: 3.1, 3.3_

  - [x] 1.4 Criar migration para adicionar `solicitou_whatsapp` ao Response
    - Criar arquivo de migration `XXXX_add_solicitou_whatsapp_to_responses.ts`
    - Adicionar coluna `solicitou_whatsapp` boolean, not null, default false
    - _Requirements: 6.1_

- [x] 2. Atualizar models Survey e Response
  - [x] 2.1 Adicionar campo `telefoneWhatsapp` ao model Survey
    - Adicionar `@column({ columnName: 'telefone_whatsapp' })` ao modelo `backend/app/models/survey.ts`
    - Tipo: `string | null`
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 2.2 Adicionar campo `solicitouWhatsapp` ao model Response
    - Adicionar `@column({ columnName: 'solicitou_whatsapp' })` ao modelo `backend/app/models/response.ts`
    - Tipo: `boolean`
    - _Requirements: 6.1_

- [x] 3. Checkpoint - Verificar migrations e models
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Atualizar CompletionController e report_html_template
  - [x] 4.1 Atualizar CompletionController para retornar `logo_url` e `telefone_whatsapp`
    - Importar `buildLogoUrl` de `#support/build_logo_url`
    - No response do `POST /api/public/responses/:token/complete`, incluir: `logo_url`, `telefone_whatsapp`, e flags de botões
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 4.1_

  - [x] 4.2 Corrigir renderização do logo no `report_html_template.ts`
    - Importar `buildLogoUrl` de `#support/build_logo_url`
    - Substituir a lógica existente de construção de URL do logo pela chamada a `buildLogoUrl`
    - Garantir que logo nulo omite o `<img>` e `__default__` usa `/logo_completo.png`
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 4.3 Atualizar `renderFooter` para condicionalidade do botão de agendamento
    - Renderizar o CTA "Agendar apresentação com um consultor" somente quando `linkAgendamento` está definido
    - Omitir o elemento quando `linkAgendamento` é nulo/vazio
    - _Requirements: 8.1, 8.2_

- [x] 5. Implementar ReportActionController e novo job de notificação
  - [x] 5.1 Atualizar endpoint WhatsApp no ReportActionController
    - Após enqueue existente, setar `session.solicitouWhatsapp = true` e salvar
    - Verificar se `survey.emailNotificacao` existe; se sim, enfileirar `consultant_whatsapp_notify`
    - _Requirements: 6.2, 7.1, 7.5_

  - [x] 5.2 Criar o job `consultant_whatsapp_notify_job.ts`
    - Criar arquivo `backend/app/jobs/consultant_whatsapp_notify_job.ts`
    - Buscar Response e Report associado
    - Se PDF não disponível, lançar erro para retry via SQS
    - Enviar e-mail para `to_email` com nome, empresa, telefone e email do respondente + PDF anexado
    - _Requirements: 7.2, 7.3, 7.4_

  - [ ]* 5.3 Escrever property test para dados do e-mail de notificação
    - **Property 4: E-mail de notificação ao consultor contém dados obrigatórios do respondente**
    - Gerar dados aleatórios de respondente e validar que todos os quatro campos (nome, empresa, telefone, email) estão presentes no corpo do e-mail
    - **Validates: Requirements 7.2**

- [x] 6. Checkpoint - Verificar backend completo
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Atualizar Frontend - Página de conclusão
  - [x] 7.1 Atualizar tipagem do API client para incluir novos campos
    - Atualizar o tipo de retorno de `triggerCompletion` em `frontend/lib/api/client.ts` (ou equivalente)
    - Adicionar campos: `logo_url`, `telefone_whatsapp`, `mostrar_btn_relatorio`, `mostrar_btn_email`, `mostrar_btn_whatsapp`, `mostrar_btn_consultor`
    - _Requirements: 1.4, 4.1_

  - [x] 7.2 Implementar logo dinâmico na página de conclusão
    - Adicionar estado `logoUrl` ao componente da página `/[slug]/concluido`
    - Extrair `logo_url` da resposta de completion e setar no estado
    - Renderizar `<img src={logoUrl || '/logo_completo.png'} />`
    - _Requirements: 1.4, 1.5_

  - [x] 7.3 Implementar botão consultor com redirecionamento para WhatsApp
    - Adicionar estado `telefoneWhatsapp`
    - Criar função `buildWhatsappUrl(telefone)` que retorna `https://wa.me/{telefone}`
    - Criar handler `handleConsultantRequest` que registra evento e abre WhatsApp em nova aba
    - Ocultar o botão quando `telefoneWhatsapp` é null/vazio, independente de `mostrar_btn_consultor`
    - _Requirements: 4.2, 4.3, 4.4_

  - [ ]* 7.4 Escrever property test para construção de URL wa.me
    - **Property 2: URL de WhatsApp do consultor é construída corretamente**
    - Gerar strings numéricas aleatórias e validar que a URL resultante é `https://wa.me/{telefone}`
    - **Validates: Requirements 4.2**

  - [x] 7.5 Padronizar visual do botão "Falar com um consultor"
    - Aplicar as mesmas classes CSS (Tailwind) usadas no botão "Receber relatório por WhatsApp"
    - Adicionar ícone SVG do WhatsApp no botão
    - Garantir estilo verde (bg-green-600, hover:bg-green-700) e layout flex com gap
    - _Requirements: 5.1, 5.2_

  - [ ]* 7.6 Escrever property test para visibilidade condicional do botão consultor
    - **Property 3: Botão de consultor é oculto quando telefone_whatsapp é ausente**
    - Gerar combinações de `mostrar_btn_consultor` (true/false) e `telefone_whatsapp` (null/vazio/preenchido), validar que botão só é visível quando ambas condições são atendidas
    - **Validates: Requirements 4.3**

- [x] 8. Final checkpoint - Verificar integração completa
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- As migrations precisam ser executadas em sequência antes dos testes de integração
- O job `consultant_whatsapp_notify` depende do mecanismo de retry já existente na fila SQS

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3", "1.4"] },
    { "id": 1, "tasks": ["1.2", "2.1", "2.2"] },
    { "id": 2, "tasks": ["4.1", "4.2", "4.3"] },
    { "id": 3, "tasks": ["5.1", "5.2", "7.1"] },
    { "id": 4, "tasks": ["5.3", "7.2", "7.3"] },
    { "id": 5, "tasks": ["7.4", "7.5"] },
    { "id": 6, "tasks": ["7.6"] }
  ]
}
```
