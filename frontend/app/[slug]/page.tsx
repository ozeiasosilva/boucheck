import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333'

interface SurveyLanding {
  id: number
  slug: string
  nome: string
  mensagem_objetivo: string
  tempo_estimado_min: number
  config_visual: {
    cor_primaria: string
    cor_secundaria: string
    cor_fundo: string
    logo_s3_key: string | null
    tema?: 'claro' | 'escuro'
  } | null
  logo_url: string | null
}

async function fetchSurvey(slug: string): Promise<SurveyLanding | null> {
  const res = await fetch(`${API_URL}/api/public/surveys/${slug}`, {
    next: { revalidate: 60 },
  })

  if (res.status === 404) {
    return null
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch survey: ${res.status}`)
  }

  return res.json()
}

function stripHtml(html: string | null | undefined): string {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, '').trim()
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const survey = await fetchSurvey(slug)

  if (!survey) {
    return { title: 'Pesquisa não encontrada — BouCheck' }
  }

  const description = stripHtml(survey.mensagem_objetivo).slice(0, 160)

  return {
    title: `${survey.nome} — BouCheck`,
    description,
    openGraph: {
      title: survey.nome,
      description,
      ...(survey.logo_url ? { images: [{ url: survey.logo_url }] } : {}),
    },
  }
}

export default async function SurveyLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const survey = await fetchSurvey(slug)

  if (!survey) {
    notFound()
  }

  const config_visual = survey.config_visual ?? {
    cor_primaria: '#4F46E5',
    cor_secundaria: '#6366F1',
    cor_fundo: '#f9fafb',
    logo_s3_key: null,
    tema: 'claro' as const,
  }
  const isDark = config_visual.tema === 'escuro'
  const bgColor = isDark ? '#1a1a2e' : (config_visual.cor_fundo || '#f9fafb')
  const cardBg = isDark ? '#2d2d44' : '#ffffff'
  const textColor = isDark ? '#e2e8f0' : '#374151'
  const mutedColor = isDark ? '#94a3b8' : '#6B7280'

  return (
    <main
      style={{
        '--cor-primaria': config_visual.cor_primaria,
        '--cor-secundaria': config_visual.cor_secundaria,
        '--cor-fundo': bgColor,
        backgroundColor: bgColor,
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      } as React.CSSProperties}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '640px',
          backgroundColor: cardBg,
          borderRadius: '1rem',
          boxShadow: isDark ? '0 4px 24px rgba(0, 0, 0, 0.3)' : '0 4px 24px rgba(0, 0, 0, 0.08)',
          padding: '2rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.5rem',
        }}
      >
        {survey.logo_url && (
          <img
            src={survey.logo_url}
            alt={`Logo ${survey.nome}`}
            style={{
              maxWidth: '180px',
              maxHeight: '80px',
              objectFit: 'contain',
            }}
          />
        )}

        <h1
          style={{
            fontSize: '1.75rem',
            fontWeight: 700,
            color: config_visual.cor_primaria,
            textAlign: 'center',
            margin: 0,
            lineHeight: 1.3,
          }}
        >
          {survey.nome}
        </h1>

        <div
          style={{
            fontSize: '1rem',
            lineHeight: 1.6,
            color: textColor,
            textAlign: 'center',
            width: '100%',
          }}
          dangerouslySetInnerHTML={{ __html: survey.mensagem_objetivo }}
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: mutedColor,
            fontSize: '0.875rem',
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>Tempo estimado: {survey.tempo_estimado_min} min</span>
        </div>

        <Link
          href={`/${slug}/identificacao`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: config_visual.cor_primaria,
            color: '#ffffff',
            fontSize: '1.125rem',
            fontWeight: 600,
            padding: '0.875rem 2.5rem',
            borderRadius: '0.5rem',
            textDecoration: 'none',
            transition: 'opacity 0.2s',
            width: '100%',
            maxWidth: '320px',
          }}
        >
          Iniciar
        </Link>
      </div>
    </main>
  )
}
