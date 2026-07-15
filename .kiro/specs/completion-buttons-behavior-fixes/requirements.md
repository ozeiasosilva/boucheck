# Requirements Document

## Introduction

Este documento especifica os requisitos para correção de quatro comportamentos na tela de conclusão e no relatório HTML da plataforma BouCheck: (1) exibição do logo do survey no relatório, (2) padronização visual do botão de consultor, (3) redirecionamento do botão "Falar com um consultor" para WhatsApp, e (4) adição de flag + envio de e-mail ao consultor com PDF quando o respondente solicita relatório por WhatsApp.

## Glossary

- **Sistema_Conclusao**: Página de conclusão (`/[slug]/concluido`) exibida ao respondente após finalizar a pesquisa.
- **Sistema_Relatorio**: Template HTML do relatório de diagnóstico gerado pelo backend e servido via `/r/{token}`.
- **Sistema_Completar**: Endpoint backend `POST /api/public/responses/:token/complete` que transiciona a resposta para status completo e retorna configurações.
- **Sistema_WhatsApp_Action**: Endpoint backend `POST /api/public/responses/:token/deliveries/whatsapp` que processa a solicitação de relatório por WhatsApp.
- **Survey**: Modelo de dados que define uma pesquisa, incluindo configurações visuais e de contato.
- **Response**: Modelo de dados que armazena a sessão de resposta de um respondente.
- **CDN_BASE_URL**: URL base para servir assets armazenados no S3 via CloudFront.
- **telefone_whatsapp**: Campo de texto no Survey contendo o número do consultor no formato internacional (e.g. 5511999999999).
- **solicitou_whatsapp**: Campo booleano no Response indicando que o respondente solicitou receber o relatório via WhatsApp.
- **logo_url**: URL completa do logo do survey construída a partir de `CDN_BASE_URL` + `config_visual.logo_s3_key`.
- **Consultant_WhatsApp_Notify_Job**: Job assíncrono que envia e-mail ao consultor com dados do cliente e PDF do relatório anexado.

## Requirements

### Requirement 1: Logo do survey na tela de conclusão

**User Story:** Como respondente, quero ver o logo do survey na tela de conclusão, para manter a identidade visual da empresa que aplicou a pesquisa.

#### Acceptance Criteria

1. WHEN a resposta é completada com sucesso, THE Sistema_Completar SHALL incluir o campo `logo_url` na resposta JSON, construído a partir de CDN_BASE_URL concatenado com `config_visual.logo_s3_key` do Survey associado.
2. WHEN `config_visual.logo_s3_key` do Survey é nulo ou vazio, THE Sistema_Completar SHALL retornar `logo_url` como `null`.
3. WHEN `config_visual.logo_s3_key` do Survey é igual a `__default__`, THE Sistema_Completar SHALL retornar `logo_url` com valor `/logo_completo.png`.
4. WHEN `logo_url` está presente na resposta de conclusão, THE Sistema_Conclusao SHALL renderizar a imagem usando o valor de `logo_url` como atributo `src`.
5. WHEN `logo_url` é `null`, THE Sistema_Conclusao SHALL renderizar o fallback `/logo_completo.png`.

### Requirement 2: Logo do survey no relatório HTML

**User Story:** Como respondente, quero ver o logo correto do survey no relatório, para que o relatório reflita a identidade visual da empresa.

#### Acceptance Criteria

1. WHEN o relatório HTML é renderizado com `logoS3Key` definido, THE Sistema_Relatorio SHALL construir a URL completa da imagem concatenando CDN_BASE_URL com `logoS3Key`.
2. WHEN `logoS3Key` é nulo ou vazio, THE Sistema_Relatorio SHALL omitir o elemento de imagem do logo no header.
3. WHEN `logoS3Key` é igual a `__default__`, THE Sistema_Relatorio SHALL usar `/logo_completo.png` como URL da imagem.

### Requirement 3: Novo campo telefone_whatsapp no Survey

**User Story:** Como administrador, quero cadastrar o número de WhatsApp do consultor no survey, para que respondentes possam entrar em contato diretamente.

#### Acceptance Criteria

1. THE Survey SHALL possuir o campo `telefone_whatsapp` do tipo texto, nullable, armazenando o número no formato internacional sem caracteres especiais.
2. WHEN o campo `telefone_whatsapp` é fornecido na criação ou edição de um survey via API admin, THE Survey SHALL persistir o valor informado.
3. WHEN o campo `telefone_whatsapp` não é fornecido, THE Survey SHALL manter o valor como `null`.

### Requirement 4: Botão "Falar com um consultor" redireciona para WhatsApp

**User Story:** Como respondente, quero que o botão "Falar com um consultor" na tela de conclusão abra uma conversa no WhatsApp com o consultor, para facilitar o contato direto.

#### Acceptance Criteria

1. WHEN a resposta é completada com sucesso, THE Sistema_Completar SHALL incluir o campo `telefone_whatsapp` na resposta JSON, com o valor do campo `telefone_whatsapp` do Survey associado.
2. WHEN o respondente clica no botão "Falar com um consultor" na tela de conclusão, THE Sistema_Conclusao SHALL abrir a URL `https://wa.me/{telefone_whatsapp}` em uma nova aba do navegador.
3. WHEN `telefone_whatsapp` é nulo ou vazio, THE Sistema_Conclusao SHALL ocultar o botão "Falar com um consultor" independentemente do valor de `mostrar_btn_consultor`.
4. WHEN o respondente clica no botão "Falar com um consultor", THE Sistema_Conclusao SHALL registrar o evento `consultor_solicitado` via API antes de abrir o WhatsApp.

### Requirement 5: Padronização visual do botão de consultor

**User Story:** Como respondente, quero que os botões de ação na tela de conclusão tenham aparência consistente, para melhor experiência visual.

#### Acceptance Criteria

1. THE Sistema_Conclusao SHALL renderizar o botão "Falar com um consultor" com o mesmo padrão visual (estilo, cores e espaçamento) utilizado no botão "Receber relatório por WhatsApp" na tela de conclusão.
2. THE Sistema_Conclusao SHALL exibir o ícone do WhatsApp no botão "Falar com um consultor" para indicar que a ação abrirá o aplicativo WhatsApp.

### Requirement 6: Novo campo solicitou_whatsapp no Response

**User Story:** Como administrador, quero saber quais respondentes solicitaram o relatório por WhatsApp, para acompanhar a demanda de forma estruturada.

#### Acceptance Criteria

1. THE Response SHALL possuir o campo `solicitou_whatsapp` do tipo booleano com valor padrão `false`.
2. WHEN o respondente solicita relatório por WhatsApp via endpoint de delivery, THE Sistema_WhatsApp_Action SHALL atualizar o campo `solicitou_whatsapp` do Response correspondente para `true`.
3. THE Response SHALL expor o campo `solicitou_whatsapp` como coluna visível na listagem administrativa de respostas.

### Requirement 7: Envio de e-mail ao consultor com PDF do relatório

**User Story:** Como consultor, quero receber um e-mail com o PDF do relatório quando um respondente solicita o relatório por WhatsApp, para ter os dados do cliente em mãos.

#### Acceptance Criteria

1. WHEN o respondente solicita relatório por WhatsApp e o Survey possui `email_notificacao` configurado, THE Sistema_WhatsApp_Action SHALL enfileirar um job Consultant_WhatsApp_Notify_Job.
2. WHEN o Consultant_WhatsApp_Notify_Job é processado, THE Consultant_WhatsApp_Notify_Job SHALL enviar um e-mail para `email_notificacao` do Survey contendo nome, empresa, telefone e e-mail do respondente no corpo da mensagem.
3. WHEN o Consultant_WhatsApp_Notify_Job é processado e o PDF do relatório está disponível, THE Consultant_WhatsApp_Notify_Job SHALL anexar o PDF do relatório ao e-mail enviado.
4. IF o PDF do relatório ainda não está disponível quando o Consultant_WhatsApp_Notify_Job é processado, THEN THE Consultant_WhatsApp_Notify_Job SHALL aguardar com retries até que o PDF esteja disponível, respeitando o mecanismo de retry da fila.
5. WHEN `email_notificacao` do Survey é nulo ou vazio, THE Sistema_WhatsApp_Action SHALL omitir o enfileiramento do Consultant_WhatsApp_Notify_Job.

### Requirement 8: Botão "Agendar apresentação" permanece no relatório HTML

**User Story:** Como respondente visualizando o relatório, quero poder agendar uma apresentação com um consultor via link de agendamento, para aprofundar meu entendimento dos resultados.

#### Acceptance Criteria

1. WHEN o relatório HTML é renderizado e `link_agendamento` está configurado no Survey, THE Sistema_Relatorio SHALL exibir o botão "Agendar apresentação com um consultor" no rodapé com href apontando para `link_agendamento`.
2. WHEN `link_agendamento` é nulo ou vazio, THE Sistema_Relatorio SHALL omitir o botão de agendamento no rodapé do relatório.
