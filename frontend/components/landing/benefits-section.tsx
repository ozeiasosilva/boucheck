import { BarChart3, Radar, ListChecks, Award } from 'lucide-react'

const benefits = [
  {
    icon: BarChart3,
    title: 'Relatório visual com score',
    description:
      'Visualize o nível de maturidade de TI da sua empresa com um score objetivo e comparativo.',
  },
  {
    icon: Radar,
    title: 'Gráfico radar',
    description:
      'Identifique pontos fortes e oportunidades em cada pilar de governança de TI.',
  },
  {
    icon: ListChecks,
    title: 'Recomendações práticas',
    description:
      'Receba ações concretas e priorizadas para elevar a maturidade da sua operação.',
  },
  {
    icon: Award,
    title: 'Metodologia CMMI',
    description:
      'Baseado em frameworks internacionais de maturidade, adaptado à realidade do mercado brasileiro.',
  },
]

export function BenefitsSection() {
  return (
    <section aria-label="Benefícios" className="py-20 px-4 bg-[var(--color-bg)]">
      <div className="max-w-6xl mx-auto">
        <h2
          className="font-[family-name:var(--font-heading)] font-bold text-[var(--color-navy)] text-center mb-14"
          style={{ fontSize: 'clamp(1.8rem, 3vw, 2.4rem)' }}
        >
          O que você recebe com o diagnóstico
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {benefits.map((benefit) => {
            const Icon = benefit.icon
            return (
              <div
                key={benefit.title}
                className="flex flex-col items-center text-center p-6 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white transition-all duration-200 hover:shadow-[var(--shadow-card)] hover:-translate-y-[3px]"
              >
                {/* Ícone dentro de círculo */}
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-blue-soft)]">
                  <Icon
                    className="w-7 h-7 text-[var(--color-blue)]"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                </div>

                <h3 className="font-[family-name:var(--font-heading)] text-[1.15rem] font-semibold text-[var(--color-navy)] mb-2">
                  {benefit.title}
                </h3>
                <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                  {benefit.description}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
