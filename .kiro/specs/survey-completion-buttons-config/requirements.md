# Requirements Document

## Introduction

Esta funcionalidade adiciona configurações individuais (liga/desliga) no painel administrativo da pesquisa (aba "Geral") para controlar a visibilidade dos 4 botões de ação exibidos ao respondente na tela de conclusão da pesquisa. Os botões configuráveis são: "Visualizar relatório", "Receber relatório por e-mail", "Receber relatório por WhatsApp" e "Falar com um consultor". Quando um botão está desabilitado nas configurações, o mesmo não é exibido ao respondente na tela de conclusão.

## Glossary

- **Sistema_Admin**: Interface administrativa (painel admin) do BouCheck utilizada para gerenciar pesquisas
- **Sistema_Publico**: Interface pública do BouCheck exibida aos respondentes durante e após a realização da pesquisa
- **Pesquisa**: Entidade Survey no banco de dados, representando um questionário configurável
- **Tela_Conclusao**: Página exibida ao respondente após completar todas as perguntas da pesquisa (rota `/{slug}/concluido`)
- **Botao_Visualizar_Relatorio**: Botão "Visualizar relatório" na tela de conclusão que abre o relatório gerado
- **Botao_Email**: Botão "Receber relatório por e-mail" na tela de conclusão que envia o relatório por email
- **Botao_WhatsApp**: Botão "Receber relatório por WhatsApp" na tela de conclusão que envia o relatório por WhatsApp
- **Botao_Consultor**: Botão "Falar com um consultor" na tela de conclusão que direciona ao agendamento com consultor
- **Config_Botoes_Conclusao**: Conjunto de campos booleanos na Pesquisa que determina quais botões são visíveis na Tela_Conclusao

## Requirements

### Requisito 1: Armazenamento das configurações de botões

**User Story:** Como administrador, quero que as configurações de visibilidade dos botões de conclusão sejam armazenadas na Pesquisa, para que cada pesquisa tenha controle independente sobre quais ações são oferecidas ao respondente.

#### Critérios de Aceitação

1. THE Pesquisa SHALL armazenar quatro campos booleanos independentes e não-nulos: `mostrar_btn_relatorio`, `mostrar_btn_email`, `mostrar_btn_whatsapp` e `mostrar_btn_consultor`, cada um aceitando exclusivamente os valores `true` ou `false`
2. WHEN uma nova Pesquisa é criada por qualquer meio (interface admin, API ou duplicação sem valores explícitos), THE Sistema_Admin SHALL definir o valor padrão de todos os quatro campos booleanos como `true` (habilitado)
3. THE Pesquisa SHALL persistir cada campo booleano de forma independente, permitindo qualquer combinação dos 16 estados possíveis entre os quatro campos
4. WHEN a migração de banco de dados é executada em ambiente com Pesquisas existentes, THE Sistema_Admin SHALL definir o valor `true` para os quatro campos de Config_Botoes_Conclusao em todas as Pesquisas que não possuam esses campos previamente

### Requisito 2: Interface administrativa para configuração dos botões

**User Story:** Como administrador, quero visualizar e alterar os toggles de cada botão na aba "Geral" da pesquisa, para que eu possa controlar facilmente quais ações o respondente verá ao concluir a pesquisa.

#### Critérios de Aceitação

1. THE Sistema_Admin SHALL exibir quatro toggles (liga/desliga) na aba "Geral" da Pesquisa, um para cada botão configurável, com estado visual claramente distinguível entre ligado e desligado
2. THE Sistema_Admin SHALL rotular cada toggle com o nome correspondente do botão: "Visualizar relatório", "Receber relatório por e-mail", "Receber relatório por WhatsApp" e "Falar com um consultor"
3. WHEN o administrador altera o estado de um toggle e a persistência é concluída com sucesso, THE Sistema_Admin SHALL exibir confirmação visual de que a alteração foi salva com sucesso em até 3 segundos após a ação do usuário
4. WHEN a aba "Geral" é carregada, THE Sistema_Admin SHALL exibir o estado atual de cada toggle refletindo os valores persistidos na Pesquisa em até 5 segundos
5. IF a persistência de uma alteração de toggle falhar, THEN THE Sistema_Admin SHALL exibir mensagem de erro indicando que a alteração não foi salva e SHALL reverter o toggle ao estado anterior à tentativa de alteração
6. IF o carregamento dos estados dos toggles falhar ao abrir a aba "Geral", THEN THE Sistema_Admin SHALL exibir mensagem de erro indicando a falha no carregamento das configurações de botões

### Requisito 3: Endpoint da API para atualização dos botões

**User Story:** Como sistema frontend admin, quero um endpoint para atualizar as configurações de botões da pesquisa, para que as alterações feitas nos toggles sejam persistidas no backend.

#### Critérios de Aceitação

1. WHEN uma requisição PUT/PATCH de atualização da Pesquisa é recebida com os campos `mostrar_btn_relatorio`, `mostrar_btn_email`, `mostrar_btn_whatsapp` ou `mostrar_btn_consultor`, THE Sistema_Admin SHALL validar que cada campo fornecido é do tipo booleano
2. IF um campo de Config_Botoes_Conclusao contém valor não-booleano, THEN THE Sistema_Admin SHALL retornar status HTTP 422 com corpo JSON contendo o nome do campo inválido e a mensagem "O campo {nome} deve ser verdadeiro ou falso"
3. WHEN uma requisição de atualização é recebida com apenas um subconjunto dos campos de Config_Botoes_Conclusao, THE Sistema_Admin SHALL atualizar somente os campos fornecidos, mantendo os demais inalterados
4. WHEN a atualização é persistida com sucesso, THE Sistema_Admin SHALL retornar status HTTP 200 com o objeto Pesquisa atualizado incluindo todos os quatro campos de Config_Botoes_Conclusao

### Requisito 4: Exposição das configurações na API pública

**User Story:** Como sistema frontend público, quero receber as configurações de botões da pesquisa junto com os dados da sessão de conclusão, para que a Tela_Conclusao saiba quais botões exibir.

#### Critérios de Aceitação

1. WHEN o Sistema_Publico conclui a sessão com sucesso (POST /api/public/responses/:token/complete retorna status 200), THE Sistema_Publico SHALL incluir na resposta os campos booleanos `mostrar_btn_relatorio`, `mostrar_btn_email`, `mostrar_btn_whatsapp` e `mostrar_btn_consultor` com seus valores persistidos na Pesquisa associada à sessão
2. THE Sistema_Publico SHALL retornar cada campo booleano de Config_Botoes_Conclusao com o valor idêntico ao armazenado no banco de dados, sem aplicar inversão, derivação ou valor computado
3. IF a Pesquisa associada à sessão não possuir valores explícitos para os campos de Config_Botoes_Conclusao, THEN THE Sistema_Publico SHALL retornar o valor padrão `true` para cada campo ausente

### Requisito 5: Renderização condicional dos botões na tela de conclusão

**User Story:** Como respondente, quero ver apenas os botões de ação que foram habilitados pelo administrador da pesquisa, para que eu não tenha opções indisponíveis na tela de conclusão.

#### Critérios de Aceitação

1. WHEN o campo `mostrar_btn_relatorio` é `true` e a Tela_Conclusao é carregada, THE Sistema_Publico SHALL renderizar o Botao_Visualizar_Relatorio na Tela_Conclusao; WHEN o campo `mostrar_btn_relatorio` é `false`, THE Sistema_Publico SHALL não renderizar o Botao_Visualizar_Relatorio no DOM da Tela_Conclusao
2. WHEN o campo `mostrar_btn_email` é `true` e a Tela_Conclusao é carregada, THE Sistema_Publico SHALL renderizar o Botao_Email na Tela_Conclusao; WHEN o campo `mostrar_btn_email` é `false`, THE Sistema_Publico SHALL não renderizar o Botao_Email no DOM da Tela_Conclusao
3. WHEN o campo `mostrar_btn_whatsapp` é `true` e a Tela_Conclusao é carregada, THE Sistema_Publico SHALL renderizar o Botao_WhatsApp na Tela_Conclusao; WHEN o campo `mostrar_btn_whatsapp` é `false`, THE Sistema_Publico SHALL não renderizar o Botao_WhatsApp no DOM da Tela_Conclusao
4. WHEN o campo `mostrar_btn_consultor` é `true` e a Tela_Conclusao é carregada, THE Sistema_Publico SHALL renderizar o Botao_Consultor na Tela_Conclusao; WHEN o campo `mostrar_btn_consultor` é `false`, THE Sistema_Publico SHALL não renderizar o Botao_Consultor no DOM da Tela_Conclusao
5. WHEN pelo menos um dos quatro campos de Config_Botoes_Conclusao é `true`, THE Sistema_Publico SHALL exibir a seção de ações (incluindo o cabeçalho da seção e os botões habilitados) na Tela_Conclusao
6. WHEN todos os quatro campos de Config_Botoes_Conclusao são `false`, THE Sistema_Publico SHALL não renderizar a seção de ações (cabeçalho e área de botões) no DOM da Tela_Conclusao, exibindo apenas a mensagem de conclusão da pesquisa

### Requisito 6: Preservação das configurações em operações de ciclo de vida

**User Story:** Como administrador, quero que as configurações de botões sejam preservadas quando a pesquisa é duplicada ou arquivada, para que eu não perca essas configurações em operações comuns de gerenciamento.

#### Critérios de Aceitação

1. WHEN uma Pesquisa é duplicada, THE Sistema_Admin SHALL copiar os valores exatos dos campos `mostrar_btn_relatorio`, `mostrar_btn_email`, `mostrar_btn_whatsapp` e `mostrar_btn_consultor` da pesquisa original para a nova pesquisa, sem aplicar valores padrão
2. WHEN uma Pesquisa é arquivada, THE Sistema_Admin SHALL manter os valores dos campos `mostrar_btn_relatorio`, `mostrar_btn_email`, `mostrar_btn_whatsapp` e `mostrar_btn_consultor` idênticos aos valores anteriores à operação de arquivamento
3. IF a pesquisa original possui qualquer combinação de valores `true`/`false` nos campos de Config_Botoes_Conclusao, THEN THE Sistema_Admin SHALL reproduzir essa mesma combinação na pesquisa duplicada
