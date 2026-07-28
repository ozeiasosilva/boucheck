import Link from 'next/link'
import { RadarPattern } from './radar-pattern'

interface CtaFinalSectionProps {
  surveySlug: string | null
}

export function CtaFinalSection({ surveySlug }: CtaFinalSectionProps) {
  return (
    <section
      aria-label="Comece agora"
      className="relative bg-[var(--color-navy)] py-20 md:py-28 px-4 overflow-hidden"
    >
      {/* RadarPattern sutil no fundo */}
      <RadarPattern
        className="absolute inset-0 w-full h-full"
        strokeColor="#ffffff"
        opacity={0.04}
      />

      <div className="relative z-10 max-w-3xl mx-auto text-center">
        <h2
          className="font-[family-name:var(--font-heading)] font-bold text-white leading-tight"
          style={{ fontSize: 'clamp(1.8rem, 3vw, 2.4rem)' }}
        >
          Descubra hoje o nível de maturidade de TI da sua empresa
        </h2>

        <p className="mt-4 text-[#B9CDF5] text-lg max-w-xl mx-auto">
          Um diagnóstico rápido, visual e gratuito para apoiar suas decisões de investimento em tecnologia.
        </p>

        <div className="mt-10">
          {surveySlug ? (
            <Link
              href={`/${surveySlug}`}
              className="inline-flex items-center justify-center px-10 py-4 min-h-[52px] text-lg font-semibold text-white bg-[var(--color-orange)] hover:bg-[var(--color-orange-dark)] rounded-[var(--radius-button)] shadow-xl hover:shadow-2xl transition-all duration-200 hover:-translate-y-[1px]"
            >
              Iniciar diagnóstico gratuito
            </Link>
          ) : (
            <p className="text-white/70 text-sm">
              O diagnóstico estará disponível em breve.
            </p>
          )}
        </div>

        <p className="mt-4 text-white/70 text-[0.85rem]">
          Gratuito · ~12 minutos · Relatório imediato
        </p>
      </div>
    </section>
  )
}
