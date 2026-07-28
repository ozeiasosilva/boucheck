/**
 * Seção de depoimentos.
 * TODO: Substituir copy placeholder por depoimentos reais após validação.
 * TODO: Adicionar fotos reais (avatar-1.jpg, avatar-2.jpg, avatar-3.jpg) em /public/images/
 */
const testimonials = [
  {
    name: 'Ricardo Almeida',
    role: 'Diretor de TI — LogiTech Soluções',
    quote:
      'O diagnóstico nos deu uma visão clara dos gaps que tínhamos em governança. Em 12 minutos, entendemos onde priorizar investimento para o próximo ano.',
  },
  {
    name: 'Fernanda Costa',
    role: 'CTO — Grupo Nexus',
    quote:
      'Impressionante a qualidade do relatório. O gráfico radar facilitou muito a conversa com a diretoria sobre maturidade e roadmap de evolução.',
  },
  {
    name: 'Carlos Eduardo Santos',
    role: 'Gestor de Infraestrutura — Indústria Bravex',
    quote:
      'Ferramenta objetiva e prática. As recomendações por pilar nos ajudaram a montar um plano de ação realista e com quick-wins imediatos.',
  },
]

export function TestimonialsSection() {
  return (
    <section aria-label="Depoimentos" className="py-20 px-4 bg-[var(--color-bg)]">
      <div className="max-w-6xl mx-auto">
        <h2
          className="font-[family-name:var(--font-heading)] font-bold text-[var(--color-navy)] text-center mb-14"
          style={{ fontSize: 'clamp(1.8rem, 3vw, 2.4rem)' }}
        >
          O que dizem nossos clientes
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="relative p-6 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white"
            >
              {/* Aspas decorativas */}
              <span
                className="absolute top-4 right-5 text-5xl font-serif text-[var(--color-blue-soft)] select-none leading-none"
                aria-hidden="true"
              >
                &ldquo;
              </span>

              <p className="text-[var(--color-text)] text-sm leading-relaxed mb-5 relative z-10">
                {t.quote}
              </p>

              <div className="flex items-center gap-3">
                {/* TODO: substituir por fotos reais dos depoentes */}
                <div className="w-12 h-12 rounded-full bg-[var(--color-blue-soft)] flex items-center justify-center flex-shrink-0">
                  <span className="text-[var(--color-blue)] font-semibold text-sm">
                    {t.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--color-navy)]">
                    {t.name}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {t.role}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
