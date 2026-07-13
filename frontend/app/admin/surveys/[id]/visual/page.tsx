'use client'

import { useState, useEffect, useRef, type FormEvent } from 'react'
import { useParams } from 'next/navigation'
import { surveysApi, type Survey, AdminApiError } from '@/lib/admin/api'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { useToast } from '@/components/admin/ui/toast'

type SurveyTema = 'claro' | 'escuro'
type LogoMode = 'none' | 'default' | 'custom'

function getLogoMode(survey: Survey | null): LogoMode {
  if (!survey) return 'none'
  const key = survey.config_visual?.logo_s3_key
  if (key === '__default__') return 'default'
  if (key) return 'custom'
  return 'none'
}

function getLogoPreviewUrl(survey: Survey | null): string | null {
  if (!survey) return null
  const key = survey.config_visual?.logo_s3_key
  if (key === '__default__') return '/logo_completo.png'
  if (survey.logo_url) return survey.logo_url
  if (key) return `${process.env.NEXT_PUBLIC_CDN_BASE_URL || ''}/${key}`
  return null
}

export default function VisualPage() {
  const { id } = useParams<{ id: string }>()
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [survey, setSurvey] = useState<Survey | null>(null)
  const [colors, setColors] = useState({ cor_primaria: '#4F46E5', cor_secundaria: '#818CF8', cor_fundo: '#F9FAFB' })
  const [tema, setTema] = useState<SurveyTema>('claro')
  const [logoMode, setLogoMode] = useState<LogoMode>('none')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    surveysApi.get(Number(id)).then((s) => {
      setSurvey(s)
      setColors({
        cor_primaria: s.config_visual.cor_primaria,
        cor_secundaria: s.config_visual.cor_secundaria,
        cor_fundo: s.config_visual.cor_fundo,
      })
      setTema((s.config_visual as Record<string, unknown>).tema === 'escuro' ? 'escuro' : 'claro')
      setLogoMode(getLogoMode(s))
    }).catch(() => toast('Erro ao carregar survey.', 'error'))
  }, [id, toast])

  async function saveVisual(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const updated = await surveysApi.setVisual(Number(id), { ...colors, tema })
      setSurvey(updated)
      toast('Identidade visual salva!', 'success')
    } catch (err) {
      toast(err instanceof AdminApiError ? err.message : 'Erro ao salvar.', 'error')
    } finally { setSaving(false) }
  }

  async function handleLogoUpload(file: File) {
    setUploading(true)
    try {
      const updated = await surveysApi.uploadLogo(Number(id), file)
      setSurvey(updated)
      setLogoMode('custom')
      toast('Logo enviado!', 'success')
    } catch (err) {
      toast(err instanceof AdminApiError ? err.message : 'Erro ao enviar logo.', 'error')
    } finally { setUploading(false) }
  }

  async function handleSetDefaultLogo() {
    setUploading(true)
    try {
      const updated = await surveysApi.setDefaultLogo(Number(id))
      setSurvey(updated)
      setLogoMode('default')
      toast('Logo padrão aplicado!', 'success')
    } catch (err) {
      toast(err instanceof AdminApiError ? err.message : 'Erro ao aplicar logo padrão.', 'error')
    } finally { setUploading(false) }
  }

  async function handleRemoveLogo() {
    setUploading(true)
    try {
      const updated = await surveysApi.removeLogo(Number(id))
      setSurvey(updated)
      setLogoMode('none')
      toast('Logo removido!', 'success')
    } catch (err) {
      toast(err instanceof AdminApiError ? err.message : 'Erro ao remover logo.', 'error')
    } finally { setUploading(false) }
  }

  // Preview background for dark mode
  const previewBg = tema === 'escuro' ? '#1a1a2e' : colors.cor_fundo
  const previewText = tema === 'escuro' ? '#e2e8f0' : '#374151'
  const logoPreviewUrl = getLogoPreviewUrl(survey)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Colors + Theme form */}
      <form onSubmit={saveVisual} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-5">
        <h2 className="font-semibold text-gray-900 dark:text-white">Cores</h2>
        <div className="space-y-4">
          {[
            { key: 'cor_primaria', label: 'Cor primária' },
            { key: 'cor_secundaria', label: 'Cor secundária' },
            { key: 'cor_fundo', label: 'Cor de fundo' },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center gap-4">
              <input
                type="color"
                value={colors[key as keyof typeof colors]}
                onChange={(e) => setColors((c) => ({ ...c, [key]: e.target.value }))}
                className="h-10 w-10 cursor-pointer rounded border border-gray-300 dark:border-gray-600 p-0.5"
                aria-label={label}
              />
              <Input
                label={label}
                value={colors[key as keyof typeof colors]}
                onChange={(e) => setColors((c) => ({ ...c, [key]: e.target.value }))}
                placeholder="#000000"
                className="font-mono"
              />
            </div>
          ))}
        </div>

        {/* Theme selector */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-3">Tema do Survey</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            Define se o respondente verá o questionário em modo claro ou escuro.
          </p>
          {tema === 'escuro' && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mb-3 flex items-center gap-1.5">
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              No tema escuro, a &quot;Cor de fundo&quot; é usada apenas na landing page. As demais páginas usam fundo escuro padrão.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTema('claro')}
              className={[
                'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all',
                tema === 'claro'
                  ? 'border-brand-blue bg-primary-light dark:bg-brand-blue/20'
                  : 'border-gray-200 dark:border-gray-600 hover:border-gray-300',
              ].join(' ')}
            >
              <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center">
                <svg className="h-5 w-5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zM4.222 4.222a1 1 0 011.414 0l.707.707a1 1 0 01-1.414 1.414l-.707-.707a1 1 0 010-1.414zM15.657 4.222a1 1 0 010 1.414l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 0zM10 7a3 3 0 100 6 3 3 0 000-6zm-8 3a1 1 0 011-1h1a1 1 0 110 2H3a1 1 0 01-1-1zm14 0a1 1 0 011-1h1a1 1 0 110 2h-1a1 1 0 01-1-1zM4.222 15.657a1 1 0 011.414-1.414l.707.707a1 1 0 01-1.414 1.414l-.707-.707zM14.95 14.95a1 1 0 011.414 0l.707.707a1 1 0 01-1.414 1.414l-.707-.707a1 1 0 010-1.414zM10 15a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Claro</span>
            </button>

            <button
              type="button"
              onClick={() => setTema('escuro')}
              className={[
                'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all',
                tema === 'escuro'
                  ? 'border-brand-blue bg-primary-light dark:bg-brand-blue/20'
                  : 'border-gray-200 dark:border-gray-600 hover:border-gray-300',
              ].join(' ')}
            >
              <div className="w-10 h-10 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center">
                <svg className="h-5 w-5 text-blue-300" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                </svg>
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Escuro</span>
            </button>
          </div>
        </div>

        <Button type="submit" loading={saving}>Salvar identidade visual</Button>
      </form>

      <div className="space-y-6">
        {/* Preview */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Preview</h2>
          <div
            className="rounded-xl p-6 flex flex-col items-center gap-4 transition-colors"
            style={{ backgroundColor: previewBg }}
          >
            {logoPreviewUrl && (
              <img src={logoPreviewUrl} alt="Logo" className="max-h-12 object-contain" />
            )}
            <h3 className="text-lg font-bold text-center" style={{ color: colors.cor_primaria }}>
              {survey?.nome ?? 'Nome do Survey'}
            </h3>
            <p className="text-sm text-center" style={{ color: previewText }}>
              Mensagem de objetivo do survey
            </p>
            <button
              className="px-6 py-2.5 rounded-lg text-white text-sm font-semibold"
              style={{ backgroundColor: colors.cor_primaria }}
            >
              Iniciar
            </button>
          </div>
        </div>

        {/* Logo selection */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Logo</h2>

          {/* Logo mode selector */}
          <div className="space-y-3 mb-4">
            {/* Option: No logo */}
            <label className={[
              'flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all',
              logoMode === 'none'
                ? 'border-brand-blue bg-primary-light dark:bg-brand-blue/10'
                : 'border-gray-200 dark:border-gray-600 hover:border-gray-300',
            ].join(' ')}>
              <input
                type="radio"
                name="logo-mode"
                checked={logoMode === 'none'}
                onChange={() => handleRemoveLogo()}
                className="accent-brand-blue"
              />
              <div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Sem logo</span>
                <p className="text-xs text-gray-500 dark:text-gray-400">O survey será exibido sem logotipo.</p>
              </div>
            </label>

            {/* Option: Default logo */}
            <label className={[
              'flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all',
              logoMode === 'default'
                ? 'border-brand-blue bg-primary-light dark:bg-brand-blue/10'
                : 'border-gray-200 dark:border-gray-600 hover:border-gray-300',
            ].join(' ')}>
              <input
                type="radio"
                name="logo-mode"
                checked={logoMode === 'default'}
                onChange={() => handleSetDefaultLogo()}
                className="accent-brand-blue"
              />
              <div className="flex items-center gap-3">
                <div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Logo padrão</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Usar o logotipo padrão da plataforma.</p>
                </div>
                <img src="/logo_completo.png" alt="Logo padrão" className="h-8 object-contain ml-auto" />
              </div>
            </label>

            {/* Option: Custom logo */}
            <label className={[
              'flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all',
              logoMode === 'custom'
                ? 'border-brand-blue bg-primary-light dark:bg-brand-blue/10'
                : 'border-gray-200 dark:border-gray-600 hover:border-gray-300',
            ].join(' ')}>
              <input
                type="radio"
                name="logo-mode"
                checked={logoMode === 'custom'}
                onChange={() => fileRef.current?.click()}
                className="accent-brand-blue"
              />
              <div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Logo personalizado</span>
                <p className="text-xs text-gray-500 dark:text-gray-400">Fazer upload de um logotipo próprio (PNG, SVG ou JPG, máx. 2 MB).</p>
              </div>
            </label>
          </div>

          {/* Custom logo preview + upload button */}
          {logoMode === 'custom' && logoPreviewUrl && (
            <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg flex items-center justify-center">
              <img src={logoPreviewUrl} alt="Logo atual" className="max-h-16 max-w-full object-contain" />
            </div>
          )}

          {logoMode === 'custom' && (
            <Button variant="secondary" loading={uploading} onClick={() => fileRef.current?.click()}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {logoPreviewUrl ? 'Trocar logo' : 'Enviar logo'}
            </Button>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/svg+xml,image/jpeg,image/jpg"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleLogoUpload(file)
            }}
          />
        </div>
      </div>
    </div>
  )
}
