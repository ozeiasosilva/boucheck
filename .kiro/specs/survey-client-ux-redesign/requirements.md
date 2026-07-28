# Requirements Document

## Introduction

Redesign da interface da tela de survey respondida pelo cliente (rota `/{slug}/perguntas`), focando em melhorar a experiência visual das alternativas (com indicadores de letra em badge), feedback de seleção mais claro, barra de progresso informativa e centralizada, e reformulação da apresentação dos insights gerados pela IA para torná-los mais legíveis e estruturados para o usuário final (admin).

## Glossary

- **Survey_Client_UI**: Interface frontend da tela de perguntas exibida ao respondente do survey (rota `/{slug}/perguntas`)
- **Option_Card**: Componente visual que representa uma alternativa de resposta, contendo um badge de letra e o texto da opção
- **Letter_Badge**: Indicador circular contendo a letra da alternativa (A, B, C, D, E...) exibido à esquerda do texto da opção
- **Progress_Bar**: Componente de barra de progresso horizontal exibida no topo da tela de perguntas, com indicação numérica de questão atual e total estimado
- **Navigation_Engine**: Módulo responsável por calcular o caminho dinâmico do survey baseado nas regras de navegação (skip logic)
- **Insight_Card**: Componente frontend que exibe a análise gerada pela IA no painel administrativo
- **Prompt_Resolver**: Serviço backend que resolve o prompt do sistema para invocação dos modelos de IA (survey_agent e client_agent)
- **Design_Tokens**: Variáveis CSS do projeto definidas em `globals.css` (cores, raios, sombras) que constituem a paleta oficial

## Requirements

### Requirement 1: Alternativas com indicadores de letra

**User Story:** Como respondente do survey, quero ver as alternativas identificadas por letras (A, B, C...) em formato de card, para que eu consiga localizar e distinguir rapidamente cada opção.

#### Acceptance Criteria

1. WHEN uma pergunta do tipo escolha_unica é exibida, THE Survey_Client_UI SHALL renderizar cada alternativa como um Option_Card contendo um Letter_Badge com a letra correspondente à posição da opção após ordenação pelo campo `ordem` (A para a primeira, B para a segunda, até Z para a vigésima sexta)
2. WHEN uma pergunta do tipo multipla_escolha é exibida, THE Survey_Client_UI SHALL renderizar cada alternativa como um Option_Card contendo um Letter_Badge com a letra correspondente à posição da opção após ordenação pelo campo `ordem` (A para a primeira, B para a segunda, até Z para a vigésima sexta)
3. THE Letter_Badge SHALL ser exibido como um elemento circular com largura e altura de 32px, fundo cinza claro (Design_Token de cinza existente), posicionado à esquerda do texto da opção dentro do Option_Card, com a letra centralizada em caixa alta
4. THE Survey_Client_UI SHALL ocultar visualmente os elementos HTML nativos de radio button e checkbox (via CSS), substituindo-os pelos Option_Cards com Letter_Badge, mantendo o elemento input no DOM para acessibilidade
5. THE Option_Card SHALL manter a funcionalidade de seleção equivalente ao radio button (escolha_unica) ou checkbox (multipla_escolha) quando clicado em qualquer área do card, incluindo o Letter_Badge e o texto da opção
6. IF uma pergunta possui mais de 26 alternativas, THEN THE Survey_Client_UI SHALL continuar a sequência com letras duplas (AA, AB, AC...)

### Requirement 2: Destaque visual da alternativa selecionada

**User Story:** Como respondente do survey, quero que a alternativa selecionada tenha um destaque visual claro e distinto, para que eu tenha certeza de qual opção escolhi.

#### Acceptance Criteria

1. WHEN uma opção é selecionada em uma pergunta escolha_unica, THE Survey_Client_UI SHALL exibir o Option_Card com fundo utilizando o token `primary-light`, borda utilizando o token `brand-blue`, e o Letter_Badge SHALL ter fundo com cor `brand-blue` e texto branco
2. WHEN uma opção é selecionada em uma pergunta multipla_escolha, THE Survey_Client_UI SHALL exibir o Option_Card com fundo utilizando o token `primary-light`, borda utilizando o token `brand-blue`, e o Letter_Badge SHALL ter fundo com cor `brand-blue` e texto branco
3. WHILE nenhuma opção está selecionada, THE Survey_Client_UI SHALL exibir cada Option_Card com borda utilizando o token `border` (cinza) e fundo transparente, e o Letter_Badge SHALL ter fundo cinza claro com texto escuro
4. WHEN o respondente deseleciona uma opção previamente selecionada em pergunta multipla_escolha, THE Survey_Client_UI SHALL reverter o Option_Card ao estilo não-selecionado definido no critério 3 em no máximo 300ms
5. WHILE o tema escuro (surveyTheme === 'escuro') está ativo, THE Survey_Client_UI SHALL adaptar as cores de destaque de modo que a combinação de cores de primeiro plano e fundo atinja razão de contraste mínima de 4.5:1 conforme WCAG 2.1 AA, utilizando variantes escuras dos tokens existentes
6. WHEN uma opção selecionada recebe foco via teclado, THE Survey_Client_UI SHALL exibir um anel de foco (outline) visível com offset de 2px além do destaque de seleção, garantindo que ambos os estados visuais (foco e seleção) sejam distinguíveis simultaneamente

### Requirement 3: Barra de progresso com contador dinâmico

**User Story:** Como respondente do survey, quero ver quantas perguntas já respondi e quantas faltam, atualizado dinamicamente conforme minhas respostas, para que eu saiba quanto falta para concluir.

#### Acceptance Criteria

1. THE Progress_Bar SHALL exibir um texto indicando "Pergunta X de Y" onde X é a posição (1-indexed) da questão atual dentro do array retornado por `computeEstimatedPath` e Y é o comprimento total desse array
2. WHEN o respondente seleciona uma alternativa que altera o fluxo de navegação (skip logic), THE Progress_Bar SHALL recalcular o valor de Y invocando `computeEstimatedPath` com o novo conjunto de respostas e atualizar o texto e a largura da barra em até 100ms após a mudança de estado
3. THE Progress_Bar SHALL exibir uma barra horizontal preenchida proporcionalmente ao progresso (X/Y convertido em percentual arredondado ao inteiro mais próximo, limitado ao intervalo 0–100), utilizando a cor `brand-orange` já existente no projeto
4. IF o total estimado Y mudar após uma resposta (por causa de skip logic), THEN THE Progress_Bar SHALL atualizar o texto e a largura da barra com CSS transition de duração 300ms e easing ease-in-out
5. THE Progress_Bar SHALL incluir os atributos de acessibilidade `role="progressbar"`, `aria-valuenow` com o percentual atual, `aria-valuemin="0"` e `aria-valuemax="100"`, e o texto "Pergunta X de Y" SHALL ser visível e acessível a leitores de tela
6. IF o survey possuir 0 questões no caminho estimado (Y = 0), THEN THE Progress_Bar SHALL exibir progresso 0% e o texto "Pergunta 0 de 0"

### Requirement 4: Posicionamento centralizado da barra de progresso

**User Story:** Como respondente do survey, quero que a barra de progresso esteja centralizada e proeminente no topo da área de conteúdo, para que eu a identifique facilmente.

#### Acceptance Criteria

1. THE Progress_Bar SHALL ser posicionada dentro do container centralizado de conteúdo (max-w-2xl), verticalmente entre o header com logo e o card da pergunta, compartilhando o mesmo alinhamento horizontal do card
2. THE Progress_Bar SHALL exibir o texto "Pergunta X de Y" centralizado horizontalmente acima da barra horizontal, onde X representa o índice sequencial (iniciando em 1) da pergunta atual no caminho respondido e Y representa o total estimado de perguntas no caminho de navegação atual
3. THE Progress_Bar SHALL ocupar 100% da largura do container de conteúdo (max-w-2xl), com padding horizontal de 24px (p-6) em mobile e 32px (p-8) em telas ≥ 640px, consistente com o padding do card de pergunta
4. THE Progress_Bar SHALL ter a barra horizontal com altura de 8px e o texto indicador posicionado 8px acima da barra

### Requirement 5: Manutenção dos Design Tokens existentes

**User Story:** Como proprietário do produto, quero que o redesign utilize exclusivamente as cores e tokens já definidos no projeto, para manter a consistência visual da marca.

#### Acceptance Criteria

1. THE Survey_Client_UI SHALL utilizar exclusivamente as cores definidas na seção `@theme` do arquivo `globals.css` do projeto: tokens de cor nomeados (navy, blue, blue-soft, orange, orange-dark, bg, bg-alt, text, text-muted, border) e aliases legados (brand-blue, brand-orange, brand-dark, primary, primary-hover, primary-light, accent, accent-hover, dark, dark-light), sem introduzir valores hexadecimais ou RGB fora deste conjunto
2. WHEN o tema escuro (surveyTheme === 'escuro') está ativo, THE Survey_Client_UI SHALL aplicar a classe CSS `.dark` no container raiz e todos os componentes com variantes de cor SHALL renderizar utilizando as variantes escuras dos Design_Tokens existentes, mantendo ratio de contraste mínimo de 4.5:1 entre texto e fundo conforme WCAG AA
3. WHILE o tema claro (surveyTheme === 'claro') está ativo, THE Survey_Client_UI SHALL renderizar os componentes utilizando os valores padrão dos Design_Tokens sem aplicar a classe `.dark`
4. THE Option_Card SHALL utilizar `border-radius` de `--radius-card` (16px) e sombra `--shadow-card` (0 4px 24px rgba(10, 30, 60, 0.07)) conforme definidos nos Design_Tokens existentes
5. THE Survey_Client_UI SHALL utilizar exclusivamente as escalas de cinza padrão do Tailwind (gray-50 a gray-900) para tons neutros, sem definir valores de cinza customizados fora dos tokens nomeados

### Requirement 6: Reestruturação visual do Insight Card

**User Story:** Como administrador do painel, quero que a análise gerada pela IA seja exibida de forma estruturada e legível, para que eu consiga absorver os insights rapidamente sem parecer um log técnico.

#### Acceptance Criteria

1. THE Insight_Card SHALL renderizar o conteúdo da análise interpretando as seguintes marcações Markdown: headings (## e ###), negrito (**texto**), listas não-ordenadas (- item), listas ordenadas (1. item) e parágrafos, ao invés de exibir como texto plano com `whitespace-pre-wrap`
2. WHEN o conteúdo contém seções identificadas por headings Markdown (## ou ###), THE Insight_Card SHALL renderizar cada seção com espaçamento vertical mínimo de 16px entre seções e uma borda inferior ou divisor visual de 1px entre seções consecutivas
3. THE Insight_Card SHALL aplicar tipografia hierárquica onde headings (##) utilizam tamanho de fonte pelo menos 1.25x maior que o corpo do texto, e headings (###) utilizam tamanho pelo menos 1.125x maior que o corpo do texto
4. IF o conteúdo da análise estiver vazio ou contiver apenas espaços em branco, THEN THE Insight_Card SHALL não ser renderizado na interface
5. THE Insight_Card SHALL sanitizar o conteúdo Markdown renderizado removendo tags HTML não permitidas (script, iframe, object, embed) antes da exibição para prevenir injeção de conteúdo malicioso

### Requirement 7: Melhoria do prompt padrão dos agentes de IA

**User Story:** Como administrador do painel, quero que os prompts padrão instruam a IA a produzir respostas com formatação Markdown estruturada, para que o resultado exibido no Insight_Card seja bem organizado.

#### Acceptance Criteria

1. THE Prompt_Resolver SHALL incluir nos prompts padrão (survey_agent e client_agent) instruções explícitas para que a IA formate a resposta usando Markdown, contendo no mínimo: cabeçalhos de seção com ## para separar blocos temáticos, **bold** para destacar termos-chave, e listas com - para enumerar itens com 3 ou mais elementos
2. THE Prompt_Resolver SHALL incluir nos prompts padrão instrução para que a IA estruture a resposta em seções com títulos (##), parágrafos de no máximo 4 frases cada e listas com marcadores (-), evitando blocos de texto contínuo com mais de 5 linhas sem separação visual
3. THE Prompt_Resolver SHALL incluir nos prompts padrão instrução para que a IA utilize linguagem direcionada a gestores e decisores de negócio, definindo termos técnicos entre parênteses quando inevitáveis e limitando siglas não explicadas a zero ocorrências
4. WHEN o prompt customizado está salvo no banco (via AiPromptConfig com campo conteudo preenchido para o tipo de agente correspondente), THE Prompt_Resolver SHALL retornar o prompt customizado e ignorar o prompt padrão modificado

### Requirement 8: Acessibilidade dos novos componentes

**User Story:** Como respondente do survey, quero que a nova interface mantenha acessibilidade via teclado e leitores de tela, para que todos os usuários consigam responder independente de suas capacidades.

#### Acceptance Criteria

1. THE Option_Card SHALL possuir role="radio" para perguntas escolha_unica (dentro de container com role="radiogroup") e role="checkbox" para perguntas multipla_escolha (dentro de container com role="group"), e SHALL ser ativável via tecla Enter ou Space para alternar a seleção
2. WHILE o foco do teclado está em um Option_Card dentro de uma pergunta escolha_unica, THE Survey_Client_UI SHALL permitir navegação entre opções via teclas Arrow Up e Arrow Down, movendo o foco para a opção anterior ou seguinte respectivamente, com ciclo da última para a primeira
3. WHEN uma opção é selecionada, THE Option_Card SHALL atualizar o atributo aria-checked para "true"; WHEN uma opção é desselecionada (em multipla_escolha) ou outra opção é escolhida (em escolha_unica), THE Option_Card SHALL atualizar aria-checked para "false"
4. THE Option_Card SHALL exibir um indicador de foco visível (outline com contraste mínimo de 3:1 em relação ao fundo) quando receber foco via teclado
5. THE Progress_Bar SHALL possuir role="progressbar" com aria-valuenow atualizado para o percentual atual, aria-valuemin="0", aria-valuemax="100", e aria-label descrevendo o progresso (ex: "Progresso do questionário")
6. THE Letter_Badge SHALL possuir aria-hidden="true" para não duplicar a informação já disponível no texto da opção
