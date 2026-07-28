/**
 * Faixa de prova social — métricas de destaque.
 * Quando logos de clientes estiverem disponíveis, substituir as métricas
 * por uma linha de logos em grayscale.
 */
export function SocialProofSection() {
  const metrics = [
    { value: '+120', label: 'diagnósticos realizados' },
    { value: '12 min', label: 'tempo médio' },
    { value: '5', label: 'pilares avaliados' },
  ]

  return (
    <section
      aria-label="Prova social"
      className="bg-[var(--color-bg-alt)] py-10"
    >
      <div className="max-w-5xl mx-auto px-4 text-center">
        <p className="text-sm text-[var(--color-text-muted)] mb-6">
          Empresas que já mapearam sua maturidade de TI com o BouCheck
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-16">
          {metrics.map((m) => (
            <div key={m.label} className="flex flex-col items-center">
              <span className="font-[family-name:var(--font-heading)] text-3xl font-bold text-[var(--color-navy)]">
                {m.value}
              </span>
              <span className="text-sm text-[var(--color-text-muted)] mt-1">
                {m.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
