# Requirements Document

## Introduction

Esta feature adiciona capacidade de análise inteligente via agente de IA (AWS Bedrock) à plataforma BouCheck. O sistema fornece dois tipos de insights:
1. **Insight de Survey (Dashboard)**: Análise agregada de todas as respostas de um survey, com foco técnico (pontos de melhoria no ambiente do cliente) e comercial (identificação de potenciais clientes e melhor abordagem).
2. **Insight de Cliente (Respostas)**: Análise específica de uma resposta individual, com recomendação de abordagem personalizada para aquele cliente, incluindo histórico de interações comerciais.

Adicionalmente, um menu de **Configurações** permite ao administrador customizar os prompts dos agentes de IA.

## Glossary

- **Sistema_Insight**: Módulo backend responsável por orquestrar a geração de insights via AWS Bedrock.
- **Painel_Dashboard**: Tela de dashboard administrativo onde o usuário seleciona um survey e visualiza métricas.
- **Tela_Respostas**: Tela administrativa de visualização de respostas individuais de clientes.
- **Agente_Survey**: Prompt especializado no tipo de survey selecionado, usado para gerar análises agregadas.
- **Agente_Cliente**: Prompt especializado em análise individual de cliente, usado para gerar insights de abordagem.
- **Insight_Survey**: Resultado persistido da análise de IA para um survey completo.
- **Insight_Cliente**: Resultado persistido da análise de IA para uma resposta/cliente específico.
- **Historico_Interacao**: Registro de acompanhamento comercial associado a uma resposta/cliente.
- **Tela_Configuracoes**: Nova tela administrativa para configuração dos prompts dos agentes de IA.
- **AdminUser**: Usuário administrador autenticado no sistema.

## Requirements

### Requisito 1: Geração de Insight Agregado no Dashboard

**User Story:** Como administrador, quero gerar um insight de IA ao visualizar um survey no dashboard, para obter uma análise técnica e comercial baseada em todas as respostas.

#### Critérios de Aceitação

1. WHEN o AdminUser clica no botão "Insight com Agente" no Painel_Dashboard com um survey selecionado, THE Sistema_Insight SHALL enviar ao AWS Bedrock um prompt contendo todas as respostas do survey (incluindo respostas de campos abertos) e exibir a análise gerada em no máximo 60 segundos.
2. THE Sistema_Insight SHALL construir o prompt do Agente_Survey incluindo o contexto do tipo de survey, todas as respostas quantitativas (opções selecionadas com seus textos e pontuações) e todas as respostas qualitativas (texto livre), considerando apenas respostas com status "completed".
3. THE Sistema_Insight SHALL estruturar a resposta do Agente_Survey em duas seções nomeadas: "Análise Técnica" (pontos de melhoria no ambiente do cliente) e "Análise Comercial" (clientes em potencial e melhor abordagem).
4. WHEN a análise é gerada com sucesso, THE Sistema_Insight SHALL persistir o Insight_Survey associado ao survey e ao AdminUser que o gerou, com timestamp de criação.
5. WHEN o AdminUser acessa o Painel_Dashboard com um survey que já possui um Insight_Survey salvo, THE Painel_Dashboard SHALL exibir o último insight salvo abaixo do botão "Insight com Agente".
6. WHEN o AdminUser clica em "Insight com Agente" para um survey que já possui insight salvo, THE Sistema_Insight SHALL gerar um novo insight e substituir o anterior como insight ativo exibido, descartando o registro do insight anterior.
7. IF o survey selecionado não possui nenhuma resposta com status "completed", THEN THE Painel_Dashboard SHALL manter o botão "Insight com Agente" desabilitado e exibir mensagem indicando que não há respostas suficientes para gerar o insight.
8. IF a chamada ao AWS Bedrock falhar por timeout (exceder 60 segundos) ou erro de invocação, THEN THE Sistema_Insight SHALL exibir mensagem de erro indicando falha na geração e permitir que o AdminUser tente novamente, sem alterar o insight previamente salvo.
9. WHILE a geração do insight está em andamento, THE Painel_Dashboard SHALL exibir um indicador de carregamento no lugar do botão "Insight com Agente" e desabilitar nova requisição até a conclusão ou falha.

### Requisito 2: Geração de Insight Individual por Cliente

**User Story:** Como administrador, quero gerar um insight de IA ao visualizar a resposta de um cliente específico, para obter uma análise personalizada com a melhor abordagem comercial.

#### Critérios de Aceitação

1. WHEN o AdminUser clica no botão "Insight com Agente" na Tela_Respostas ao visualizar uma resposta específica, THE Sistema_Insight SHALL enviar ao AWS Bedrock um prompt contendo as respostas daquele cliente, exibir um indicador de carregamento durante o processamento e retornar a análise em até 60 segundos.
2. THE Sistema_Insight SHALL construir o prompt do Agente_Cliente incluindo: todas as respostas do cliente (texto da pergunta, opção selecionada e texto livre quando preenchido), dados de identificação (nome, empresa, cargo, cidade) e os registros de Historico_Interacao existentes para aquele cliente.
3. THE Sistema_Insight SHALL estruturar a resposta do Agente_Cliente contendo no mínimo as seguintes seções: resumo do perfil do cliente, pontos de atenção identificados nas respostas, e recomendação de abordagem comercial personalizada com base no cenário do cliente.
4. WHEN a análise individual é gerada com sucesso, THE Sistema_Insight SHALL persistir o Insight_Cliente associado à resposta (response_id) e ao AdminUser que o gerou.
5. WHEN o AdminUser acessa a Tela_Respostas de um cliente que já possui um Insight_Cliente salvo, THE Tela_Respostas SHALL exibir o último insight salvo.
6. WHEN o AdminUser clica em "Insight com Agente" para uma resposta que já possui insight salvo, THE Sistema_Insight SHALL gerar um novo insight e substituir o anterior como insight ativo exibido.
7. IF a chamada ao AWS Bedrock falhar por timeout ou erro de invocação, THEN THE Sistema_Insight SHALL exibir uma mensagem de erro indicando falha na geração do insight, manter o insight anterior inalterado (caso exista) e permitir que o AdminUser tente novamente.

### Requisito 3: Histórico de Interações com o Cliente

**User Story:** Como administrador, quero registrar o histórico de interações comerciais com cada cliente, para ter contexto ao gerar insights e acompanhar o funil de vendas.

#### Critérios de Aceitação

1. THE Tela_Respostas SHALL exibir uma seção "Acompanhamento Comercial" na visualização de cada resposta individual.
2. WHEN o AdminUser adiciona uma entrada ao Acompanhamento Comercial, THE Sistema_Insight SHALL persistir o Historico_Interacao associado à resposta (response_id) e ao AdminUser autenticado, contendo o tipo de interação, uma observação opcional de no máximo 500 caracteres e o timestamp de criação.
3. THE Sistema_Insight SHALL oferecer os seguintes tipos pré-definidos de interação: "Enviou orçamento", "Fechou negócio", "Não respondeu contato", "Agendou reunião", "Em negociação", "Perdeu para concorrente", "Cliente não qualificado" e "Retornar futuramente".
4. WHEN o AdminUser visualiza a seção Acompanhamento Comercial, THE Tela_Respostas SHALL exibir todas as entradas de histórico ordenadas por data de criação decrescente, paginadas em grupos de 20 entradas.
5. WHEN o Sistema_Insight gera um Insight_Cliente, THE Sistema_Insight SHALL incluir os registros de Historico_Interacao da resposta no prompt do Agente_Cliente.
6. IF a persistência de uma entrada de Historico_Interacao falhar, THEN THE Tela_Respostas SHALL exibir uma mensagem de erro indicando que o registro não foi salvo e permitir que o AdminUser tente novamente.
7. THE Sistema_Insight SHALL tratar os registros de Historico_Interacao como imutáveis após criação, não permitindo edição ou exclusão de entradas existentes.

### Requisito 4: Configuração de Prompts dos Agentes

**User Story:** Como administrador, quero configurar os prompts dos agentes de IA, para personalizar a análise conforme as necessidades do meu negócio.

#### Critérios de Aceitação

1. THE Tela_Configuracoes SHALL exibir dois campos editáveis de texto: um para o prompt do Agente_Survey e outro para o prompt do Agente_Cliente, cada um com limite máximo de 10.000 caracteres.
2. THE Tela_Configuracoes SHALL exibir o prompt padrão pré-definido como placeholder em cada campo quando nenhum prompt customizado estiver salvo.
3. WHEN o AdminUser salva os prompts na Tela_Configuracoes, THE Sistema_Insight SHALL persistir os prompts configurados e exibir uma confirmação de sucesso ao AdminUser.
4. IF o AdminUser tenta salvar um prompt que excede 10.000 caracteres, THEN THE Tela_Configuracoes SHALL impedir o salvamento e exibir uma mensagem de erro indicando o limite excedido.
5. IF a persistência dos prompts falha por indisponibilidade do servidor, THEN THE Tela_Configuracoes SHALL exibir uma mensagem de erro indicando a falha e preservar o conteúdo editado nos campos sem perda de dados.
6. WHEN o Sistema_Insight gera um insight, THE Sistema_Insight SHALL utilizar o prompt customizado configurado na Tela_Configuracoes como system prompt na chamada ao AWS Bedrock para o agente correspondente (Agente_Survey ou Agente_Cliente).
7. IF nenhum prompt customizado estiver configurado para um agente, THEN THE Sistema_Insight SHALL utilizar o prompt padrão pré-definido correspondente como system prompt na chamada ao AWS Bedrock.
8. THE Tela_Configuracoes SHALL ser acessível via um item de menu "Configurações" no painel administrativo existente.

### Requisito 5: Posicionamento e Interface do Botão de Insight no Dashboard

**User Story:** Como administrador, quero que o botão de insight esteja posicionado de forma intuitiva no dashboard, para acessá-lo facilmente ao analisar um survey.

#### Critérios de Aceitação

1. IF um survey específico estiver selecionado no filtro (valor diferente de "Todos os surveys"), THEN THE Painel_Dashboard SHALL exibir o botão "Insight com Agente" posicionado imediatamente abaixo da barra de filtros do dashboard.
2. WHILE o Sistema_Insight está processando a requisição ao Bedrock, THE Painel_Dashboard SHALL exibir um spinner de carregamento dentro do botão "Insight com Agente", substituir o texto do botão por "Gerando Insight...", e desabilitar o botão impedindo cliques adicionais.
3. WHEN o Sistema_Insight retornar a resposta com sucesso, THE Painel_Dashboard SHALL exibir o texto do insight em um card dedicado posicionado imediatamente abaixo do botão "Insight com Agente" e reabilitar o botão para permitir nova consulta.
4. IF o AWS Bedrock retornar um erro ou não responder dentro de 30 segundos, THEN THE Painel_Dashboard SHALL exibir uma mensagem de erro indicando que a geração de insight falhou, reabilitar o botão "Insight com Agente", e preservar os dados do dashboard exibidos anteriormente.
5. WHEN o AdminUser altera a seleção do filtro de survey, THE Painel_Dashboard SHALL remover o resultado de insight previamente exibido e ocultar o botão "Insight com Agente" caso a seleção retorne para "Todos os surveys".

### Requisito 6: Posicionamento e Interface do Insight na Tela de Respostas

**User Story:** Como administrador, quero que o botão de insight e o acompanhamento comercial estejam integrados à visualização da resposta do cliente, para ter uma visão completa ao analisar cada caso.

#### Critérios de Aceitação

1. THE Tela_Respostas SHALL exibir o botão "Insight com Agente" na visualização detalhada de uma resposta individual, posicionado após a seção de respostas do cliente e antes da seção "Acompanhamento Comercial".
2. IF a resposta estiver anonimizada, THEN THE Tela_Respostas SHALL ocultar o botão "Insight com Agente" e a área de resultado do Insight_Cliente.
3. WHILE o Sistema_Insight está processando a requisição ao Bedrock, THE Tela_Respostas SHALL exibir um indicador de carregamento visível dentro do botão e desabilitar o botão para prevenir cliques adicionais.
4. WHEN o Insight_Cliente é gerado com sucesso ou já existe um Insight_Cliente salvo para a resposta, THE Tela_Respostas SHALL exibir o conteúdo do insight mais recente em uma área dedicada abaixo do botão, incluindo o texto da análise e a data de geração.
5. THE Tela_Respostas SHALL exibir a seção "Acompanhamento Comercial" após a área de insight do cliente.
6. IF o AWS Bedrock retornar um erro ou timeout, THEN THE Tela_Respostas SHALL exibir uma mensagem de erro indicando o tipo de falha (erro de comunicação ou tempo limite excedido), reabilitar o botão para permitir nova tentativa, e preservar qualquer Insight_Cliente anteriormente exibido.

### Requisito 7: Persistência e Modelo de Dados dos Insights

**User Story:** Como administrador, quero que os insights gerados sejam salvos, para poder consultá-los posteriormente sem gerar novamente.

#### Critérios de Aceitação

1. THE Sistema_Insight SHALL armazenar cada Insight_Survey com os campos: id (bigIncrements, primary key), survey_id (bigInteger, foreign key para surveys, NOT NULL), admin_user_id (bigInteger, foreign key para admin_users, NOT NULL), conteudo (text, NOT NULL, máximo 50.000 caracteres), tokens_input (integer, nullable), tokens_output (integer, nullable) e created_at (timestamp with timezone, NOT NULL, default now).
2. THE Sistema_Insight SHALL armazenar cada Insight_Cliente com os campos: id (bigIncrements, primary key), response_id (uuid/string, foreign key para responses, NOT NULL), admin_user_id (bigInteger, foreign key para admin_users, NOT NULL), conteudo (text, NOT NULL, máximo 50.000 caracteres), tokens_input (integer, nullable), tokens_output (integer, nullable) e created_at (timestamp with timezone, NOT NULL, default now).
3. THE Sistema_Insight SHALL armazenar cada Historico_Interacao com os campos: id (bigIncrements, primary key), response_id (uuid/string, foreign key para responses, NOT NULL), admin_user_id (bigInteger, foreign key para admin_users, NOT NULL), tipo (varchar, NOT NULL, restrito aos valores do enum de tipos pré-definidos), observacao (text, nullable, máximo 5.000 caracteres) e created_at (timestamp with timezone, NOT NULL, default now).
4. THE Sistema_Insight SHALL armazenar os prompts configuráveis com os campos: id (bigIncrements, primary key), tipo (varchar, NOT NULL, restrito a 'survey_agent' ou 'client_agent'), conteudo (text, NOT NULL, máximo 10.000 caracteres), admin_user_id (bigInteger, foreign key para admin_users, NOT NULL) e updated_at (timestamp with timezone, NOT NULL, auto-update).
5. WHEN um novo insight é gerado para um survey que já possui ao menos um registro em Insight_Survey com o mesmo survey_id, THE Sistema_Insight SHALL criar um novo registro sem alterar ou remover os registros anteriores, e ao consultar SHALL retornar o registro com o created_at mais recente.
6. WHEN um novo insight é gerado para uma resposta que já possui ao menos um registro em Insight_Cliente com o mesmo response_id, THE Sistema_Insight SHALL criar um novo registro sem alterar ou remover os registros anteriores, e ao consultar SHALL retornar o registro com o created_at mais recente.
7. IF uma operação de persistência de insight falhar devido a violação de foreign key (survey_id, response_id ou admin_user_id inexistente), THEN THE Sistema_Insight SHALL rejeitar a operação e retornar uma mensagem de erro indicando que o recurso referenciado não foi encontrado, sem criar nenhum registro parcial.

### Requisito 8: Segurança e Autorização

**User Story:** Como administrador, quero que apenas usuários autenticados possam gerar insights e gerenciar configurações, para proteger os dados da plataforma.

#### Critérios de Aceitação

1. THE Sistema_Insight SHALL exigir um token JWT válido no header Authorization (formato "Bearer <token>") para todas as operações de geração de insight, registro de histórico e configuração de prompts.
2. IF uma requisição for recebida sem token ou com token inválido/expirado, THEN THE Sistema_Insight SHALL retornar status HTTP 401 com corpo JSON contendo um campo "error" indicando falha de autenticação.
3. IF o AdminUser autenticado estiver com status inativo (ativo=false), THEN THE Sistema_Insight SHALL retornar status HTTP 401, mesmo que o token seja tecnicamente válido.
4. WHEN um insight for gerado ou uma entrada de histórico for criada, THE Sistema_Insight SHALL registrar o admin_user_id do AdminUser autenticado no registro persistido.
5. THE Sistema_Insight SHALL aplicar o middleware de autenticação e verificação de admin ativo na mesma cadeia utilizada pelos demais endpoints protegidos do /api/admin (auth + ensureAdminActive).
