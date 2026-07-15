# Documento de Requisitos

## Introdução

Este documento especifica os requisitos para correção de vulnerabilidades críticas de autenticação e segurança no painel administrativo BouCheck. As falhas identificadas permitem que usuários não autenticados visualizem a interface administrativa, mantêm sessões fantasma após expiração de token, e o fluxo de logout não invalida credenciais no servidor. A correção abrange backend (AdonisJS) e frontend (Next.js 14 App Router).

## Glossário

- **Admin_Panel**: Painel administrativo Next.js acessível em /admin/*
- **Auth_Service**: Serviço de autenticação no backend AdonisJS responsável por login, logout e gestão de tokens
- **Session_Cookie**: Cookie `boucheck_admin_session` usado pelo middleware Next.js para controle de acesso às rotas /admin/*
- **Access_Token**: Token Bearer armazenado no localStorage do frontend e na tabela `auth_access_tokens` do banco de dados
- **Auth_Guard**: Componente frontend que bloqueia renderização de conteúdo protegido até confirmação de autenticação válida
- **API_Client**: Módulo `frontend/lib/admin/api.ts` responsável por todas as requisições HTTP autenticadas ao backend
- **Ghost_Session**: Estado onde o Session_Cookie existe mas o Access_Token está expirado ou inválido no backend
- **AdminShell**: Componente React que renderiza o layout administrativo (sidebar + conteúdo)

## Requisitos

### Requisito 1: Endpoint de Logout no Backend

**User Story:** Como administrador, quero que minha sessão seja invalidada no servidor ao fazer logout, para que meu token não possa ser reutilizado após sair do sistema.

#### Critérios de Aceitação

1. WHEN um administrador autenticado envia POST para /api/admin/auth/logout, THE Auth_Service SHALL deletar o Access_Token atual da tabela `auth_access_tokens` e retornar HTTP 200
2. WHEN uma requisição sem token válido é enviada para /api/admin/auth/logout, THE Auth_Service SHALL retornar HTTP 401
3. WHEN o Access_Token é invalidado via logout, THE Auth_Service SHALL rejeitar quaisquer requisições subsequentes usando o mesmo token com HTTP 401

### Requisito 2: Fluxo Completo de Logout no Frontend

**User Story:** Como administrador, quero que ao clicar em "Sair" toda minha sessão seja limpa (cookie, localStorage e token no servidor), para que não permaneça nenhum resquício de sessão ativa.

#### Critérios de Aceitação

1. WHEN o administrador aciona a função logout, THE Admin_Panel SHALL chamar o endpoint POST /api/admin/auth/logout no backend antes de limpar dados locais
2. WHEN o administrador aciona a função logout, THE Admin_Panel SHALL remover o Access_Token do localStorage
3. WHEN o administrador aciona a função logout, THE Admin_Panel SHALL remover o Session_Cookie definindo-o com `max-age=0`
4. WHEN o administrador aciona a função logout, THE Admin_Panel SHALL redirecionar para /admin/login após completar a limpeza
5. IF a chamada ao endpoint de logout falhar (rede indisponível, token já expirado), THEN THE Admin_Panel SHALL ainda assim limpar os dados locais (localStorage e cookie) e redirecionar para /admin/login

### Requisito 3: Auth Guard no AdminShell

**User Story:** Como administrador, quero que nenhum conteúdo protegido (sidebar, menu, páginas) seja renderizado até que minha autenticação seja confirmada, para evitar que interfaces administrativas sejam visíveis sem sessão válida.

#### Critérios de Aceitação

1. WHILE o estado de autenticação está sendo verificado (isLoading=true), THE AdminShell SHALL exibir apenas um indicador de carregamento e não renderizar sidebar nem conteúdo protegido
2. WHEN a verificação de autenticação conclui sem token válido, THE Auth_Guard SHALL redirecionar o usuário para /admin/login
3. WHEN a verificação de autenticação conclui com token válido, THE AdminShell SHALL renderizar a interface administrativa completa (sidebar + conteúdo)
4. WHEN o AdminAuthProvider é montado com um token existente no localStorage, THE Auth_Guard SHALL validar o token fazendo uma chamada GET /api/admin/me ao backend
5. IF a chamada de validação GET /api/admin/me retorna 401, THEN THE Auth_Guard SHALL executar o fluxo de logout (limpar localStorage, cookie e redirecionar para login)

### Requisito 4: Interceptor Global para Respostas 401

**User Story:** Como administrador, quero ser redirecionado automaticamente para o login quando minha sessão expira durante o uso, para evitar ficar preso em uma interface não funcional com erros silenciosos.

#### Critérios de Aceitação

1. WHEN qualquer chamada autenticada do API_Client recebe HTTP 401, THE API_Client SHALL remover o Access_Token do localStorage
2. WHEN qualquer chamada autenticada do API_Client recebe HTTP 401, THE API_Client SHALL remover o Session_Cookie
3. WHEN qualquer chamada autenticada do API_Client recebe HTTP 401, THE API_Client SHALL redirecionar o navegador para /admin/login
4. WHEN a requisição que recebe 401 é o próprio endpoint de logout, THE API_Client SHALL executar a limpeza local sem entrar em loop de redirecionamento
5. WHEN a requisição que recebe 401 é o endpoint de validação (GET /me) durante montagem do Auth_Guard, THE API_Client SHALL permitir que o Auth_Guard trate o redirecionamento

### Requisito 5: Eliminação de Ghost Sessions

**User Story:** Como administrador, quero que o sistema detecte e elimine sessões fantasma (cookie válido mas token expirado), para que eu não veja a interface administrativa sem funcionalidade real.

#### Critérios de Aceitação

1. WHEN o AdminAuthProvider monta e não encontra Access_Token no localStorage, THE Auth_Guard SHALL remover o Session_Cookie e redirecionar para /admin/login
2. WHEN o AdminAuthProvider monta e encontra Access_Token no localStorage, THE Auth_Guard SHALL validar o token no backend via GET /api/admin/me
3. IF a validação do token no backend falha (401), THEN THE Auth_Guard SHALL remover o Session_Cookie, remover o Access_Token do localStorage e redirecionar para /admin/login
4. THE Admin_Panel SHALL garantir que o Session_Cookie é definido com o mesmo tempo de expiração do Access_Token (12 horas) para minimizar Ghost_Sessions
