# Implementation Plan: Survey Client UX Redesign

## Overview

Reestruturação visual da interface de perguntas do survey (client-facing) e do InsightCard (admin panel). Implementação de componentes LetterBadge, OptionCard, ProgressBar redesenhada, MarkdownRenderer e InsightCard com Markdown, além de modificações no PromptResolver do backend. Todos os componentes seguem WCAG 2.1 AA e utilizam exclusivamente Design Tokens existentes.

## Tasks

- [x] 1. Criar componentes base de survey (LetterBadge e OptionCard)
  - [x] 1.1 Implementar componente LetterBadge com função `indexToLetter`
    - Criar `frontend/components/survey/letter-badge.tsx`
    - Implementar função `indexToLetter(index: number): string` que converte índice 0-based para letras (0→A, 25→Z, 26→AA, 27→AB...)
    - Renderizar badge circular 32×32px com letra centralizada
    - Aplicar estilos condicionais para estado `selected` (brand-blue fundo, texto branco) e default (cinza claro, texto escuro)
    - Suporte a `darkMode` com contraste WCAG AA (4.5:1)
    - Adicionar `aria-hidden="true"` ao badge
    - _Requirements: 1.1, 1.2, 1.3, 1.6, 5.1, 5.2, 8.6_

  - [x] 1.2 Implementar componente OptionCard com acessibilidade completa
    - Criar `frontend/components/survey/option-card.tsx`
    - Renderizar card com LetterBadge + texto da opção
    - Ocultar visualmente input nativo (radio/checkbox) mantendo no DOM
    - Aplicar `role="radio"` ou `role="checkbox"` conforme `questionType`
    - Implementar `aria-checked` sincronizado com estado de seleção
    - Ativação via Enter/Space
    - Estilos de seleção: fundo `primary-light`, borda `brand-blue`
    - Estilos default: borda `border` (cinza), fundo transparente
    - Transição CSS 300ms ease-in-out para mudanças de estado
    - Indicador de foco visível (outline offset 2px, contraste ≥3:1)
    - Utilizar `border-radius: --radius-card` (16px) e `--shadow-card`
    - Suporte a `darkMode` com variantes escuras dos tokens
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 5.1, 5.4, 8.1, 8.3, 8.4_

  - [ ]* 1.3 Escrever property test para indexToLetter (Property 1)
    - **Property 1: Index-to-letter mapping correctness**
    - Criar `frontend/__tests__/property_letter_badge.spec.ts`
    - Gerar inteiros 0..1000 com fast-check
    - Verificar unicidade: para quaisquer i ≠ j, indexToLetter(i) ≠ indexToLetter(j)
    - Verificar que resultado é uppercase alphabético
    - Tag: `Feature: survey-client-ux-redesign, Property 1: Index-to-letter mapping correctness`
    - **Validates: Requirements 1.1, 1.2, 1.6**

  - [ ]* 1.4 Escrever property test para aria-checked sync (Property 6)
    - **Property 6: aria-checked reflects selection state**
    - Criar `frontend/__tests__/property_option_aria.spec.ts`
    - Gerar sequências aleatórias de select/deselect em listas de opções com fast-check
    - Verificar que aria-checked === "true" quando opção está selecionada e "false" caso contrário
    - Tag: `Feature: survey-client-ux-redesign, Property 6: aria-checked reflects selection state`
    - **Validates: Requirements 8.3**

  - [ ]* 1.5 Escrever unit tests para LetterBadge e OptionCard
    - Criar `frontend/__tests__/letter-badge.spec.tsx` e `frontend/__tests__/option-card.spec.tsx`
    - LetterBadge: renderiza A (index=0), Z (index=25), AA (index=26); aplica estilos selected/default
    - OptionCard: estilo selecionado/não-selecionado; tema claro/escuro; clique alterna seleção; role correto por questionType
    - _Requirements: 1.1, 1.2, 1.3, 1.6, 2.1, 2.3, 8.1, 8.3_

- [x] 2. Redesenhar componente ProgressBar
  - [x] 2.1 Implementar ProgressBar redesenhada com texto dinâmico
    - Criar/refatorar `frontend/components/survey/progress-bar.tsx`
    - Exibir texto "Pergunta X de Y" centralizado acima da barra
    - Calcular percentual: `Math.round((currentIndex / totalEstimated) * 100)` clamped [0, 100]
    - Renderizar barra horizontal 8px com cor `brand-orange`
    - CSS transition 300ms ease-in-out para mudanças de largura
    - Atributos ARIA: `role="progressbar"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-label="Progresso do questionário"`
    - Caso Y=0: exibir "Pergunta 0 de 0" com 0%
    - Posicionamento: dentro de container max-w-2xl, entre header e card de pergunta
    - Padding: 24px (p-6) em mobile, 32px (p-8) em telas ≥640px
    - Texto 8px acima da barra horizontal
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 5.1, 8.5_

  - [ ]* 2.2 Escrever property test para cálculo de progresso (Property 2)
    - **Property 2: Progress percentage computation**
    - Criar `frontend/__tests__/property_progress_bar.spec.ts`
    - Gerar pares (currentIndex, totalEstimated) com totalEstimated 0..200 usando fast-check
    - Verificar: quando totalEstimated=0, percentual=0
    - Verificar: percentual sempre entre [0, 100]
    - Verificar: percentual = Math.round((currentIndex / totalEstimated) * 100) clamped
    - Tag: `Feature: survey-client-ux-redesign, Property 2: Progress percentage computation`
    - **Validates: Requirements 3.1, 3.3, 3.6**

  - [ ]* 2.3 Escrever unit tests para ProgressBar
    - Criar `frontend/__tests__/progress-bar.spec.tsx`
    - Renderiza "Pergunta 3 de 10" corretamente
    - Atributos ARIA presentes e corretos
    - Transition CSS aplicada à barra
    - Caso edge: Y=0 renderiza "Pergunta 0 de 0"
    - _Requirements: 3.1, 3.5, 3.6, 4.2, 8.5_

- [x] 3. Checkpoint - Validar componentes de survey
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implementar componentes admin (MarkdownRenderer e InsightCard)
  - [x] 4.1 Implementar MarkdownRenderer utilitário
    - Criar `frontend/components/admin/markdown-renderer.tsx`
    - Instalar dependências: `react-markdown`, `remark-gfm`, `rehype-sanitize`
    - Configurar sanitização: remover tags `<script>`, `<iframe>`, `<object>`, `<embed>`
    - Estilização via classes Tailwind para cada elemento Markdown (headings, bold, listas, parágrafos)
    - Props: `content: string`, `className?: string`
    - _Requirements: 6.1, 6.3, 6.5_

  - [x] 4.2 Refatorar InsightCard para usar MarkdownRenderer
    - Refatorar `frontend/components/admin/insight-card.tsx`
    - Substituir `whitespace-pre-wrap` por renderização Markdown via MarkdownRenderer
    - Espaçamento vertical 16px entre seções + divisor visual 1px entre seções
    - Tipografia hierárquica: ## = 1.25x corpo, ### = 1.125x corpo
    - Retornar null quando `conteudo` está vazio ou só whitespace
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 4.3 Escrever property test para sanitização Markdown (Property 3)
    - **Property 3: Markdown sanitization removes dangerous tags**
    - Criar `frontend/__tests__/property_insight_sanitize.spec.ts`
    - Gerar strings com tags perigosas (`<script>`, `<iframe>`, `<object>`, `<embed>`) injetadas em posições aleatórias
    - Verificar que output renderizado não contém nenhuma dessas tags
    - Tag: `Feature: survey-client-ux-redesign, Property 3: Markdown sanitization removes dangerous tags`
    - **Validates: Requirements 6.5**

  - [ ]* 4.4 Escrever property test para conteúdo vazio (Property 4)
    - **Property 4: Empty/whitespace content produces no render**
    - Criar `frontend/__tests__/property_insight_empty.spec.ts`
    - Gerar strings compostas de whitespace (espaços, tabs, newlines, string vazia)
    - Verificar que InsightCard retorna null (não renderiza)
    - Tag: `Feature: survey-client-ux-redesign, Property 4: Empty/whitespace content produces no render`
    - **Validates: Requirements 6.4**

  - [ ]* 4.5 Escrever unit tests para InsightCard e MarkdownRenderer
    - Criar `frontend/__tests__/insight-card.spec.tsx` e `frontend/__tests__/markdown-renderer.spec.tsx`
    - InsightCard: renderiza headings, bold, listas; não renderiza quando vazio; sanitiza script tags
    - MarkdownRenderer: renderiza Markdown corretamente; sanitiza HTML perigoso
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 5. Checkpoint - Validar componentes admin
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Modificar PromptResolver no backend
  - [x] 6.1 Atualizar prompts padrão do PromptResolver com instruções Markdown
    - Modificar `backend/app/services/prompt_resolver.ts`
    - Atualizar `DEFAULTS` para `survey_agent` e `client_agent` com instruções:
      - Uso de `##` para seções temáticas
      - `**bold**` para termos-chave
      - Listas `-` para 3+ itens
      - Parágrafos de no máximo 4 frases
      - Linguagem direcionada a gestores (sem siglas não explicadas)
    - Garantir que lógica de prioridade (custom > default) permanece intacta
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ]* 6.2 Escrever property test para resolução de prompts (Property 5)
    - **Property 5: Prompt resolution prioritizes custom over default**
    - Criar `backend/tests/functional/property_prompt_resolver.spec.ts`
    - Gerar combinações de AgentType + strings de prompt customizado com fast-check
    - Verificar que quando existe prompt customizado no DB, resolve retorna o customizado
    - Verificar que quando não existe, retorna o default
    - Tag: `Feature: survey-client-ux-redesign, Property 5: Prompt resolution prioritizes custom over default`
    - **Validates: Requirements 7.4**

  - [ ]* 6.3 Escrever unit tests para PromptResolver
    - Criar/expandir `backend/tests/functional/prompt_resolver.spec.ts`
    - Retorna default quando DB vazio para o tipo
    - Retorna customizado quando existe no DB
    - Prompts padrão contêm instruções de Markdown (##, **, -, limite de frases)
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 7. Integrar componentes na PerguntasPage
  - [x] 7.1 Integrar OptionCard e LetterBadge na página de perguntas
    - Modificar `frontend/app/[slug]/perguntas/page.tsx` (ou componente de questão relevante)
    - Substituir inputs nativos por OptionCards com LetterBadge
    - Adicionar container com `role="radiogroup"` para escolha_unica e `role="group"` para multipla_escolha
    - Implementar navegação por Arrow Up/Down com roving tabindex (ciclo da última para primeira)
    - Ordenar opções pelo campo `ordem` antes de renderizar
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 8.1, 8.2_

  - [x] 7.2 Integrar ProgressBar redesenhada na página de perguntas
    - Substituir ProgressBar existente pela nova versão
    - Conectar com `computeEstimatedPath` para obter X e Y dinâmicos
    - Recalcular ao selecionar alternativa que altera fluxo (skip logic)
    - Atualizar dentro de 100ms após mudança de estado
    - Posicionar entre header com logo e card de pergunta dentro do container max-w-2xl
    - _Requirements: 3.1, 3.2, 3.4, 4.1, 4.2, 4.3_

  - [ ]* 7.3 Escrever integration tests para PerguntasPage
    - OptionCards renderizados com badges corretos
    - Seleção atualiza ProgressBar
    - Navegação por teclado (Arrow Up/Down) funcional
    - Tema escuro aplica variantes corretas
    - _Requirements: 1.1, 2.1, 3.2, 5.2, 8.2_

- [x] 8. Checkpoint final - Validação completa
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marcadas com `*` são opcionais e podem ser puladas para um MVP mais rápido
- Cada task referencia requirements específicos para rastreabilidade
- Checkpoints garantem validação incremental
- Property tests validam propriedades de correção universais definidas no design
- Unit tests validam exemplos específicos e edge cases
- O projeto já utiliza `fast-check` para property-based testing (ver `property_progress.spec.ts` existente)
- Frontend usa Vitest, backend usa Japa como test runners
- Todos os componentes devem usar exclusivamente Design Tokens de `globals.css`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "4.1"] },
    { "id": 1, "tasks": ["1.2", "4.2", "6.1"] },
    { "id": 2, "tasks": ["1.3", "1.4", "1.5", "2.2", "2.3", "4.3", "4.4", "4.5", "6.2", "6.3"] },
    { "id": 3, "tasks": ["7.1", "7.2"] },
    { "id": 4, "tasks": ["7.3"] }
  ]
}
```
