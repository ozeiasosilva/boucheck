# Plano de Implementação: Correção de Autenticação e Segurança do Admin

## Visão Geral

Implementação incremental das correções de segurança no painel admin BouCheck. O plano segue a ordem: backend primeiro (endpoint de logout), depois frontend (interceptor → auth guard → logout completo → AdminShell), garantindo que cada etapa é testável isoladamente.

## Tasks

- [x] 1. Implementar endpoint de logout no backend
  - [x] 1.1 Adicionar método `logout` ao AuthController
    - Adicionar método `async logout({ auth, response }: HttpContext)` em `backend/app/controllers/auth_controller.ts`
    - O método deve obter o usuário autenticado via `auth.user!`
    - Deletar o token atual usando `AdminUser.accessTokens.delete(user, user.currentAccessToken.identifier)`
    - Retornar `response.ok({ message: 'Logged out' })`
    - _Requisitos: 1.1, 1.2, 1.3_

  - [x] 1.2 Registrar rota POST /auth/logout no grupo protegido
    - Adicionar `router.post('/auth/logout', [AuthController, 'logout'])` dentro do grupo protegido em `backend/start/routes.ts`
    - A rota já herda os middlewares `auth()` e `ensureAdminActive()` do grupo
    - _Requisitos: 1.1, 1.2_

  - [ ]* 1.3 Escrever teste property-based para invalidação de token no logout
    - **Property 1: Invalidação de Token no Logout**
    - **Valida: Requisitos 1.1, 1.3**
    - Usar fast-check para gerar credenciais de teste
    - Para cada iteração: criar token → chamar logout → verificar que requisição com mesmo token retorna 401
    - Mínimo 100 iterações

  - [ ]* 1.4 Escrever testes unitários para o endpoint de logout
    - Teste: POST /auth/logout com token válido → 200 + token deletado
    - Teste: POST /auth/logout sem token → 401
    - Teste: Após logout, GET /me com mesmo token → 401
    - _Requisitos: 1.1, 1.2, 1.3_

- [x] 2. Checkpoint — Verificar que endpoint backend funciona
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implementar interceptor global 401 e helpers no API client
  - [x] 3.1 Adicionar função `clearSessionCookie` ao módulo API
    - Adicionar em `frontend/lib/admin/api.ts` a função exportada `clearSessionCookie()` que define `document.cookie = 'boucheck_admin_session=; path=/; max-age=0; samesite=lax'`
    - _Requisitos: 2.3, 4.2, 5.1_

  - [x] 3.2 Adicionar função `logout` ao `authApi`
    - Adicionar ao objeto `authApi` em `frontend/lib/admin/api.ts`: `logout: () => apiFetch<{ message: string }>('/auth/logout', { method: 'POST' })`
    - _Requisitos: 2.1_

  - [x] 3.3 Implementar interceptor 401 na função `apiFetch`
    - Modificar `apiFetch` em `frontend/lib/admin/api.ts`
    - Quando `res.status === 401` AND `authenticated === true` AND `path !== '/auth/logout'`:
      - Chamar `clearToken()`
      - Chamar `clearSessionCookie()`
      - Se `typeof window !== 'undefined'` e path atual não é `/admin/login`, redirecionar para `/admin/login`
    - Continuar lançando `AdminApiError` normalmente após a limpeza
    - _Requisitos: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 3.4 Escrever teste property-based para o interceptor 401
    - **Property 2: Interceptor 401 Limpa Sessão Completa**
    - **Valida: Requisitos 4.1, 4.2, 4.3**
    - Usar fast-check para gerar paths de API aleatórios e métodos HTTP
    - Mockar fetch para retornar 401
    - Verificar que para cada combinação (exceto /auth/logout), localStorage e cookie são limpos
    - Mínimo 100 iterações

  - [ ]* 3.5 Escrever testes unitários para interceptor e helpers
    - Teste: clearSessionCookie define cookie com max-age=0
    - Teste: 401 em path qualquer → limpa localStorage + cookie + redireciona
    - Teste: 401 em /auth/logout → NÃO redireciona
    - Teste: 401 quando já em /admin/login → NÃO redireciona
    - Teste: 200/403/500 → NÃO aciona interceptor
    - _Requisitos: 4.1, 4.2, 4.3, 4.4_

- [x] 4. Implementar Auth Guard no AdminAuthProvider
  - [x] 4.1 Refatorar useEffect de mount no AdminAuthProvider
    - Modificar `frontend/lib/admin/auth-context.tsx`
    - Se não há token no localStorage: chamar `clearSessionCookie()`, definir `isLoading: false` com `token: null`
    - Se há token: chamar `meApi.getProfile()` para validar
    - Em caso de sucesso: definir `token` e `user` no state, `isLoading: false`
    - Em caso de falha (qualquer erro): chamar `clearToken()`, `clearSessionCookie()`, definir estado sem auth
    - _Requisitos: 3.4, 3.5, 5.1, 5.2, 5.3_

  - [x] 4.2 Refatorar função logout no AdminAuthProvider
    - A função `logout` deve: chamar `authApi.logout()` (try/catch ignorando erro)
    - No finally: `clearToken()`, `clearSessionCookie()`, atualizar state, `window.location.href = '/admin/login'`
    - _Requisitos: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 4.3 Escrever testes unitários para AdminAuthProvider
    - Teste: mount com token + GET /me sucesso → estado authenticated
    - Teste: mount com token + GET /me 401 → limpeza completa
    - Teste: mount sem token → limpa cookie, estado unauthenticated
    - Teste: logout sucesso → chama API, limpa tudo, redireciona
    - Teste: logout com falha de rede → ainda limpa tudo e redireciona
    - _Requisitos: 2.1–2.5, 3.4, 3.5, 5.1–5.3_

- [x] 5. Implementar gate de renderização no AdminShell
  - [x] 5.1 Modificar AdminShell para consumir estado de autenticação
    - Modificar `frontend/components/admin/admin-shell.tsx`
    - Importar `useAdminAuth` do auth-context
    - Se `isLoginPage` → renderizar apenas children (comportamento atual)
    - Se `isLoading` → renderizar componente de loading (spinner centralizado)
    - Se `!token` (após loading) → renderizar `null` (redirect acontece no provider)
    - Se `token` presente → renderizar layout completo (sidebar + main)
    - _Requisitos: 3.1, 3.2, 3.3_

  - [ ]* 5.2 Escrever testes unitários para AdminShell
    - Teste: isLoading=true → renderiza loading, não renderiza sidebar
    - Teste: token=null após loading → não renderiza nada
    - Teste: token presente → renderiza sidebar + conteúdo
    - Teste: isLoginPage=true → renderiza apenas children independente do auth state
    - _Requisitos: 3.1, 3.2, 3.3_

- [x] 6. Corrigir TTL do cookie de sessão no login
  - [x] 6.1 Ajustar max-age do cookie na página de login
    - Modificar `frontend/app/admin/login/page.tsx`
    - Alterar `max-age=${60 * 60 * 12}` para usar uma constante compartilhada (12h = 43200 segundos)
    - Garantir que o valor é consistente com o TTL do token no backend
    - _Requisitos: 5.4_

- [x] 7. Checkpoint final — Garantir integração completa
  - Ensure all tests pass, ask the user if questions arise.
  - Verificar fluxo end-to-end: login → navegar → logout → tentar acessar admin → redirecionado para login
  - Verificar cenário de ghost session: expirar token manualmente → acessar admin → redirecionado para login

## Notas

- Tasks marcadas com `*` são opcionais e podem ser puladas para um MVP mais rápido
- Cada task referencia requisitos específicos para rastreabilidade
- Checkpoints garantem validação incremental
- Property tests validam propriedades universais de corretude
- Testes unitários validam exemplos específicos e edge cases
- O backend usa AdonisJS com Japa test runner; o frontend usa Vitest + Testing Library
