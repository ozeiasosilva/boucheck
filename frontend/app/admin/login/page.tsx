'use client'

import { useState, Suspense, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { authApi, AdminApiError } from '@/lib/admin/api'
import { useAdminAuth } from '@/lib/admin/auth-context'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'

type Mode = 'login' | 'forgot' | 'forgot-sent'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login } = useAdminAuth()
  const [mode, setMode] = useState<Mode>('login')

  // Login state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [retryAfter, setRetryAfter] = useState<number | null>(null)

  // Forgot state
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotError, setForgotError] = useState('')

  // 12 hours — matches backend token TTL
  const SESSION_MAX_AGE = 60 * 60 * 12

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    setLoginError('')
    setRetryAfter(null)
    setLoginLoading(true)

    try {
      const result = await authApi.login(email, password)
      // Set cookie for middleware (not httpOnly — SPA approach)
      document.cookie = `boucheck_admin_session=${result.token.value}; path=/; max-age=${SESSION_MAX_AGE}; samesite=lax`
      login(result.token.value)

      const next = searchParams.get('next') || '/admin/dashboard'
      router.push(next)
    } catch (err) {
      if (err instanceof AdminApiError) {
        if (err.status === 429) {
          const after = (err.body as { retryAfter?: number }).retryAfter
          setRetryAfter(after ?? 15)
          setLoginError(`Muitas tentativas. Tente novamente em ${after ?? 15} minutos.`)
        } else {
          setLoginError('E-mail ou senha inválidos.')
        }
      } else {
        setLoginError('Erro ao conectar. Tente novamente.')
      }
    } finally {
      setLoginLoading(false)
    }
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault()
    setForgotError('')
    setForgotLoading(true)

    try {
      await authApi.forgot(forgotEmail)
      setMode('forgot-sent')
    } catch {
      setForgotError('Erro ao enviar. Tente novamente.')
    } finally {
      setForgotLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-brand-dark flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Image
            src="/logo_completo.png"
            alt="BouCheck"
            width={220}
            height={64}
            className="h-14 w-auto mx-auto object-contain"
            priority
          />
          <p className="text-gray-400 text-sm mt-2">Painel Administrativo</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* ── Login ── */}
          {mode === 'login' && (
            <>
              <h1 className="text-xl font-semibold text-gray-900 mb-6">Entrar</h1>
              <form onSubmit={handleLogin} className="space-y-4" noValidate>
                <Input
                  label="E-mail"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  placeholder="admin@beonup.com.br"
                />
                <Input
                  label="Senha"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••••"
                />

                {loginError && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {loginError}
                  </div>
                )}

                <Button
                  type="submit"
                  loading={loginLoading}
                  disabled={!email || !password || !!retryAfter}
                  className="w-full"
                  size="lg"
                >
                  Entrar
                </Button>
              </form>

              <button
                onClick={() => { setMode('forgot'); setForgotEmail(email) }}
                className="mt-4 w-full text-center text-sm text-brand-blue hover:text-primary-hover hover:underline"
              >
                Esqueci minha senha
              </button>
            </>
          )}

          {/* ── Forgot ── */}
          {mode === 'forgot' && (
            <>
              <button
                onClick={() => setMode('login')}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-5"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Voltar
              </button>
              <h1 className="text-xl font-semibold text-gray-900 mb-2">Redefinir senha</h1>
              <p className="text-sm text-gray-500 mb-6">
                Informe seu e-mail e enviaremos um link de redefinição.
              </p>
              <form onSubmit={handleForgot} className="space-y-4" noValidate>
                <Input
                  label="E-mail"
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  autoComplete="email"
                  required
                  placeholder="admin@beonup.com.br"
                />
                {forgotError && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {forgotError}
                  </div>
                )}
                <Button type="submit" loading={forgotLoading} disabled={!forgotEmail} className="w-full" size="lg">
                  Enviar link
                </Button>
              </form>
            </>
          )}

          {/* ── Forgot sent ── */}
          {mode === 'forgot-sent' && (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-green-100 mb-4">
                <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">E-mail enviado</h2>
              <p className="text-sm text-gray-500 mb-6">
                Se a conta existir, você receberá um e-mail com o link de redefinição em breve.
              </p>
              <button
                onClick={() => setMode('login')}
                className="text-sm text-brand-blue hover:underline"
              >
                Voltar ao login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AdminLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
