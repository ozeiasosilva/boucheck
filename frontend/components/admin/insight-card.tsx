'use client'

interface InsightCardProps {
  conteudo: string
  createdAt: string
}

export function InsightCard({ conteudo, createdAt }: InsightCardProps) {
  const formattedDate = new Date(createdAt).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">Insight do Agente</h3>
        <span className="text-xs text-gray-400">Gerado em {formattedDate}</span>
      </div>
      <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
        {conteudo}
      </div>
    </div>
  )
}
