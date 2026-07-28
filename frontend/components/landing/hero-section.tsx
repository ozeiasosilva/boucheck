import Link from 'next/link'
import Image from 'next/image'
import { Check, Clock, FileText } from 'lucide-react'
import { RadarPattern } from './radar-pattern'

interface HeroSectionProps {
  surveySlug: string | null
}

export function HeroSection({ surveySlug }: HeroSectionProps) {
  return (
    <section aria-label="Hero" className="relative w-full bg-[var(--color-bg)] overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-28">
        <div className="flex flex-col lg:flex-row lg:items-center lg:gap-16">
          {/* Coluna esquerda — texto */}
          <div className="flex-1 text-center lg:text-left">
            {/* Eyebrow */}
            <p className="text-[0.78rem] font-semibold tracking-[0.08em] text-[var(--color-blue)] uppercase mb-4">
              Raio-X de Maturidade de TI
            </p>

            <h1
              className="font-[family-name:var(--font-heading)] font-bold text-[var(--color-navy)] leading-tight"
              style={{
                fontSize: 'clamp(2.4rem, 5vw, 3.5rem)',
                letterSpacing: '-0.02em',
              }}
            >
              Descubra a{' '}
              <span className="text-[var(--color-blue)]">maturidade de TI</span>{' '}
              da sua empresa
            </h1>

            <p className="mt-6 text-lg text-[var(--color-text-muted)] max-w-2xl mx-auto lg:mx-0 leading-[1.7]">
              Avalie gratuitamente o nível de maturidade tecnológica da sua organização e receba um relatório completo com recomendações práticas para evolução.
            </p>

            {/* Badges */}
            <div className="mt-8 flex flex-wrap items-center justify-center lg:justify-start gap-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--color-blue-soft)] text-[var(--color-blue)] text-sm font-medium">
                <Check className="w-4 h-4" aria-hidden="true" />
                Gratuito
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--color-blue-soft)] text-[var(--color-blue)] text-sm font-medium">
                <Clock className="w-4 h-4" aria-hidden="true" />
                ~12 minutos
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--color-blue-soft)] text-[var(--color-blue)] text-sm font-medium">
                <FileText className="w-4 h-4" aria-hidden="true" />
                Relatório imediato
              </span>
            </div>

            {/* CTA block */}
            {surveySlug && (
              <div className="mt-10 flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start" id="hero-cta">
                <Link
                  href={`/${surveySlug}`}
                  className="inline-flex items-center justify-center px-8 py-4 min-h-[48px] text-base font-semibold text-white bg-[var(--color-orange)] hover:bg-[var(--color-orange-dark)] rounded-[var(--radius-button)] shadow-lg hover:shadow-xl transition-all duration-200 hover:-translate-y-[1px]"
                >
                  Iniciar diagnóstico gratuito
                </Link>
              </div>
            )}

            {/* Microcopy */}
            <p className="mt-3 text-[0.85rem] text-[var(--color-text-muted)] text-center lg:text-left">
              Sem cartão de crédito · Relatório na hora
            </p>
          </div>

          {/* Coluna direita — mockup + radar */}
          <div className="hidden lg:flex flex-1 items-center justify-center relative">
            {/* RadarPattern grande atrás do mockup */}
            <RadarPattern
              className="absolute w-[520px] h-[520px] -right-16 -top-8"
              opacity={0.07}
            />

            {/* Card com mockup do relatório */}
            <div className="relative z-10 -rotate-[1.5deg] rounded-[20px] border border-[var(--color-border)] shadow-[var(--shadow-card)] bg-[var(--color-bg)] overflow-hidden">
              <Image
                src="/images/hero-report.png"
                alt="Exemplo de relatório do Raio-X de Maturidade de TI com gráfico radar e score"
                width={420}
                height={300}
                className="w-full h-auto"
                priority
              />

              {/* Chip flutuante */}
              <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg px-3 py-2 flex items-center gap-2 border border-[var(--color-border)]">
                <div className="w-6 h-6 rounded-full bg-[var(--color-blue-soft)] flex items-center justify-center">
                  <Check className="w-3.5 h-3.5 text-[var(--color-blue)]" aria-hidden="true" />
                </div>
                <span className="text-xs font-medium text-[var(--color-navy)]">
                  Score: 3.4 / 5 · Nível Gerenciado
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
