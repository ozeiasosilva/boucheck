# Implementation Plan: survey-completion-buttons-config

## Overview

Este plano implementa 4 campos booleanos (`mostrar_btn_relatorio`, `mostrar_btn_email`, `mostrar_btn_whatsapp`, `mostrar_btn_consultor`) no modelo `Survey` para controlar a visibilidade dos botões na tela de conclusão. A implementação segue a ordem: migração → model → validator → service → controller público → frontend admin → frontend público.

Todos os campos têm `NOT NULL DEFAULT true` para retrocompatibilidade. O endpoint admin existente (PUT /api/admin/surveys/:id) é reutilizado para atualização parcial, e a resposta de conclusão pública (POST /api/public/responses/:token/complete) é estendida para incluir os campos.

Property-based tests usam `fast-check` com mínimo 100 iterações, cada um taggeado com `Feature: survey-completion-buttons-config, Property {N}: {text}`.

## Tasks

- [x] 1. Migração e modelo
  - [x] 1.1 Criar migração para adicionar colunas de botões à tabela `surveys`
    - Criar arquivo `database/migrations/XXXXXX_add_completion_buttons_to_surveys.ts`
    - Adicionar 4 colunas `boolean NOT NULL DEFAULT true`: `mostrar_btn_relatorio`, `mostrar_btn_email`, `mostrar_btn_whatsapp`, `mostrar_btn_consultor`
    - Método `down` deve remover as 4 colunas
    - PostgreSQL aplica default em leitura para rows existentes sem table rewrite
    - _Requirements: 1.1, 1.2, 1.4_

  - [x] 1.2 Adicionar propriedades ao modelo Survey (`app/models/survey.ts`)
    - Adicionar 4 `@column()` declarations com `columnName` explícito: `mostrarBtnRelatorio`, `mostrarBtnEmail`, `mostrarBtnWhatsapp`, `mostrarBtnConsultor`
    - Tipo `boolean` para cada campo
    - _Requirements: 1.1, 1.3_

- [x] 2. Validator e Service (backend admin)
  - [x] 2.1 Adicionar campos opcionais ao validator de atualização de survey
    - No `updateSurveyValidator` em `app/validators/survey_validators.ts`, adicionar `mostrar_btn_relatorio`, `mostrar_btn_email`, `mostrar_btn_whatsapp`, `mostrar_btn_consultor` como `vine.boolean().optional()`
    - Validação VineJS retorna 422 automaticamente para valores não-booleanos com mensagem adequada
    - _Requirements: 3.1, 3.2_

  - [x] 2.2 Atualizar `SurveyService` para persistir os campos de botões
    - Na interface `UpdateSurveyInput`, adicionar os 4 campos opcionais
    - No método `update`, atribuir cada campo apenas se `!== undefined` (partial update)
    - Na interface `SurveyView` e função `toView`, incluir os 4 campos booleanos
    - _Requirements: 3.3, 3.4_

  - [x] 2.3 Atualizar `SurveyService.duplicate` para copiar campos de botões
    - No insert da pesquisa duplicada, copiar `mostrarBtnRelatorio`, `mostrarBtnEmail`, `mostrarBtnWhatsapp`, `mostrarBtnConsultor` da pesquisa original
    - _Requirements: 6.1, 6.3_

  - [x]* 2.4 Write property test for persistence round-trip
    - **Property 2: Persistence round-trip**
    - Gerar combinações aleatórias de 4 booleans via fast-check, persistir via service.update, ler via service.read, verificar igualdade
    - **Validates: Requirements 1.3**

  - [x]* 2.5 Write property test for partial update independence
    - **Property 4: Partial update independence**
    - Gerar estado inicial aleatório + subconjunto aleatório não-vazio de campos a atualizar, verificar campos omitidos inalterados
    - **Validates: Requirements 3.3**

  - [x]* 2.6 Write property test for duplication preserves button config
    - **Property 8: Duplication preserves button config**
    - Gerar combinação aleatória de 4 booleans, atribuir à survey, duplicar, verificar igualdade
    - **Validates: Requirements 6.1, 6.3**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. API pública e controller de conclusão
  - [x] 4.1 Atualizar o controller de conclusão para incluir campos de botões na resposta
    - No handler de `POST /api/public/responses/:token/complete`, após marcar a sessão como completa, carregar a survey associada e incluir `mostrar_btn_relatorio`, `mostrar_btn_email`, `mostrar_btn_whatsapp`, `mostrar_btn_consultor` no response body
    - Retornar valor idêntico ao armazenado no banco, sem inversão ou derivação
    - Se campos não existirem (cenário fallback), retornar `true` como padrão
    - _Requirements: 4.1, 4.2, 4.3_

  - [x]* 4.2 Write property test for public API faithful exposure
    - **Property 5: Public API faithful exposure**
    - Gerar combinação aleatória de 4 booleans, atribuir à survey, completar sessão via API, verificar que response contém os mesmos valores
    - **Validates: Requirements 4.1, 4.2**

- [x] 5. Frontend admin — toggles de configuração
  - [x] 5.1 Implementar seção de toggles na aba "Geral" da pesquisa
    - Criar componente com 4 toggles individuais (liga/desliga) com labels: "Visualizar relatório", "Receber relatório por e-mail", "Receber relatório por WhatsApp", "Falar com um consultor"
    - Ao carregar aba, buscar estado atual dos toggles da API e renderizar corretamente
    - Estado visual claramente distinguível entre ligado e desligado
    - _Requirements: 2.1, 2.2, 2.4_

  - [x] 5.2 Implementar lógica de persistência otimista e tratamento de erros nos toggles
    - Ao alterar toggle: armazenar estado anterior, atualizar visualmente (otimista), disparar PUT /api/admin/surveys/:id com campo alterado
    - Sucesso: exibir confirmação visual (toast/check) em até 3 segundos
    - Falha: reverter toggle ao estado anterior + exibir mensagem de erro
    - Falha no carregamento: exibir mensagem "Falha ao carregar configurações de botões"
    - _Requirements: 2.3, 2.5, 2.6_

  - [x]* 5.3 Write unit tests for admin toggles
    - Testar renderização dos 4 toggles com estados corretos e labels corretos
    - Testar reversão do toggle em caso de falha na API
    - Testar exibição de mensagem de erro no carregamento
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6_

- [x] 6. Frontend público — renderização condicional
  - [x] 6.1 Implementar renderização condicional dos botões na tela de conclusão
    - Consumir os campos `mostrar_btn_relatorio`, `mostrar_btn_email`, `mostrar_btn_whatsapp`, `mostrar_btn_consultor` da resposta de conclusão
    - Renderizar cada botão somente se o respectivo campo for `true`; não renderizar no DOM se `false`
    - Se pelo menos um botão ativo: exibir seção de ações (cabeçalho + botões habilitados)
    - Se todos os 4 campos forem `false`: não renderizar a seção de ações (cabeçalho + área de botões), exibindo apenas a mensagem de conclusão
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x]* 6.2 Write unit tests for conditional button rendering
    - Testar que cada botão aparece/desaparece conforme seu campo booleano
    - Testar que seção de ações não renderiza quando todos os campos são `false`
    - Testar que seção de ações renderiza quando pelo menos um campo é `true`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x]* 6.3 Write property test for conditional button rendering
    - **Property 6: Conditional button rendering**
    - Gerar combinação aleatória de 4 booleans, verificar que cada botão está presente no DOM iff valor é `true`
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

  - [x]* 6.4 Write property test for actions section visibility
    - **Property 7: Actions section visibility**
    - Gerar combinação aleatória de 4 booleans, verificar que seção de ações está presente iff pelo menos um é `true`
    - **Validates: Requirements 5.5, 5.6**

- [x] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP.
- Each task references specific requirement clauses for traceability.
- O design reutiliza o endpoint PUT existente — nenhuma rota nova é necessária no backend admin.
- A migração com `DEFAULT true` garante retrocompatibilidade: surveys existentes terão todos os botões visíveis.
- Property-based tests usam `fast-check` com mínimo 100 iterações, taggeados com `Feature: survey-completion-buttons-config, Property {N}: {text}`.
- Checkpoints garantem validação incremental entre camadas (backend → frontend).
- A operação de `archive` não requer alteração pois os campos permanecem inalterados (apenas `status` muda).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "2.2"] },
    { "id": 3, "tasks": ["2.3", "2.4", "2.5"] },
    { "id": 4, "tasks": ["2.6", "4.1"] },
    { "id": 5, "tasks": ["4.2", "5.1"] },
    { "id": 6, "tasks": ["5.2", "5.3"] },
    { "id": 7, "tasks": ["6.1"] },
    { "id": 8, "tasks": ["6.2", "6.3", "6.4"] }
  ]
}
```
