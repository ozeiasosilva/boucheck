import Image from 'next/image'
import Link from 'next/link'

interface LandingHeaderProps {
  surveySlug: string | null
}

export function LandingHeader({ surveySlug }: LandingHeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full bg-[var(--color-bg)] border-b border-[var(--color-border)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
        <Link href="/" className="flex items-center">
          <Image
            src="/logo_completo.png"
            alt="BouCheck — Diagnóstico de Maturidade de TI"
            width={160}
            height={48}
            className="h-9 sm:h-10 w-auto object-contain"
            priority
          />
        </Link>

        {surveySlug && (
          <nav aria-label="Navegação principal">
            <Link
              href={`/${surveySlug}`}
              className="inline-flex items-center justify-center px-5 py-2.5 text-sm font-semibold text-white bg-[var(--color-orange)] hover:bg-[var(--color-orange-dark)] rounded-[var(--radius-button)] transition-all duration-200 hover:-translate-y-[1px]"
            >
              Iniciar diagnóstico
            </Link>
          </nav>
        )}
      </div>
    </header>
  )
}
