'use client'

import { useState, useEffect, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useParams } from 'next/navigation'
import { surveysApi, type Survey } from '@/lib/admin/api'
import { SurveyStatusBadge } from '@/components/admin/ui/badge'

const tabs = [
  { href: '', label: 'Geral' },
  { href: '/questions', label: 'Perguntas' },
  { href: '/visual', label: 'Visual' },
  { href: '/checklist', label: 'Checklist' },
  { href: '/score-ranges', label: 'Faixas' },
  { href: '/flow', label: 'Fluxo' },
]

export default function SurveyDetailLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>()
  const pathname = usePathname()
  const [survey, setSurvey] = useState<Survey | null>(null)

  useEffect(() => {
    if (params.id) {
      surveysApi.get(Number(params.id)).then(setSurvey).catch(() => {})
    }
  }, [params.id])

  const basePath = `/admin/surveys/${params.id}`

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-8 py-4 max-w-6xl mx-auto">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link href="/admin/surveys" className="hover:text-gray-700">Surveys</Link>
            <span>/</span>
            <span className="text-gray-900 font-medium truncate">{survey?.nome ?? '...'}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-gray-900">{survey?.nome ?? '...'}</h1>
              {survey && <SurveyStatusBadge status={survey.status} />}
            </div>
            {survey && (
              <span className="text-xs text-gray-400 font-mono">/{survey.slug}</span>
            )}
          </div>

          {/* Tabs */}
          <nav className="flex gap-0 mt-4 -mb-px" aria-label="Seções do survey">
            {tabs.map((tab) => {
              const href = `${basePath}${tab.href}`
              const active = tab.href === ''
                ? pathname === basePath
                : pathname.startsWith(href)
              return (
                <Link
                  key={tab.href}
                  href={href}
                  className={[
                    'px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                    active
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
                  ].join(' ')}
                >
                  {tab.label}
                </Link>
              )
            })}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="px-8 py-6 max-w-6xl mx-auto">
        {children}
      </div>
    </div>
  )
}
