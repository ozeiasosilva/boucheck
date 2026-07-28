import Link from 'next/link'

const steps = [
  {
    number: 1,
    title: 'Responda',
    description:
      'Responda o diagnóstico online em aproximadamente 12 minutos. São perguntas objetivas sobre a gestão de TI da sua empresa.',
  },
  {
    number: 2,
    title: 'Receba',
    description:
      'Receba imediatamente um relatório visual com seu score de maturidade e um gráfico radar detalhado por pilar.',
  },
  {
    number: 3,
    title: 'Evolua',
    description:
      'Use as recomendações práticas para priorizar investimentos e elevar a maturidade de TI da sua operação.',
  },
]

interface HowItWorksSectionProps {
  surveySlug?: string | null
}

export function HowItWorksSection({ surveySlug }: HowItWorksSectionProps) {
  return (
    <section aria-label="Como funciona" className="bg-[var(--color-bg-alt)] py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <h2
          className="font-[family-name:var(--font-heading)] text-center font-bold text-[var(--color-navy)]"
          style={{ fontSize: 'clamp(1.8rem, 3vw, 2.4rem)' }}
        >
          Como funciona
        </h2>

        <div className="relative mt-12 md:mt-16">
          {/* Linha conectora entre passos (desktop) */}
          <div
            className="absolute top-7 left-[calc(16.67%+28px)] right-[calc(16.67%+28px)] hidden h-[2px] bg-[var(--color-border)] md:block"
            aria-hidden="true"
          />

          <ol className="flex flex-col items-center gap-10 md:flex-row md:items-start md:gap-8">
            {steps.map((step) => (
              <li
                key={step.number}
                className="group relative flex w-full max-w-sm flex-col items-center text-center md:flex-1"
              >
                {/* Círculo numerado */}
                <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-navy)] text-xl font-bold text-white font-[family-name:var(--font-heading)] shadow-md transition-all duration-200 group-hover:ring-[3px] group-hover:ring-[var(--color-orange)]">
                  {step.number}
                </div>

                {/* Seta entre passos (mobile) */}
                {step.number < 3 && (
                  <div
                    className="my-3 flex h-6 items-center text-[var(--color-border)] md:hidden"
                    aria-hidden="true"
                  >
                    <svg
                      width="16"
                      height="24"
                      viewBox="0 0 16 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M8 0v20M2 16l6 6 6-6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}

                <h3 className="font-[family-name:var(--font-heading)] mt-4 text-xl font-semibold text-[var(--color-navy)]">
                  {step.title}
                </h3>
                <p className="mt-2 text-base leading-relaxed text-[var(--color-text-muted)]">
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
        </div>

        {/* CTA repetido ao final da seção */}
        <div className="mt-14 text-center">
          {surveySlug ? (
            <Link
              href={`/${surveySlug}`}
              className="inline-flex items-center justify-center px-8 py-4 min-h-[48px] text-base font-semibold text-white bg-[var(--color-orange)] hover:bg-[var(--color-orange-dark)] rounded-[var(--radius-button)] shadow-lg hover:shadow-xl transition-all duration-200 hover:-translate-y-[1px]"
            >
              Começar agora — é gratuito
            </Link>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">
              O diagnóstico estará disponível em breve.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
