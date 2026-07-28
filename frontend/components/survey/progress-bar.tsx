/**
 * Calcula o percentual de progresso clamped entre [0, 100].
 * Quando totalEstimated é 0, retorna 0.
 */
export function calculatePercentage(currentIndex: number, totalEstimated: number): number {
  if (totalEstimated === 0) return 0
  const raw = Math.round((currentIndex / totalEstimated) * 100)
  return Math.max(0, Math.min(100, raw))
}

interface ProgressBarProps {
  currentIndex: number // posição 1-indexed da questão atual no estimated path
  totalEstimated: number // Y = comprimento do array de computeEstimatedPath
  darkMode?: boolean
}

export function ProgressBar({ currentIndex, totalEstimated, darkMode }: ProgressBarProps) {
  const displayX = totalEstimated === 0 ? 0 : currentIndex
  const displayY = totalEstimated
  const percentage = calculatePercentage(currentIndex, totalEstimated)

  return (
    <div className="w-full max-w-2xl mx-auto px-6 sm:px-8">
      <p
        className={`text-center text-sm font-medium mb-2 ${
          darkMode ? 'text-gray-200' : 'text-[var(--color-text-muted)]'
        }`}
      >
        Pergunta {displayX} de {displayY}
      </p>
      <div
        className={`w-full h-2 rounded-full overflow-hidden ${
          darkMode ? 'bg-gray-700' : 'bg-gray-200'
        }`}
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progresso do questionário"
      >
        <div
          className="h-full rounded-full bg-[var(--color-brand-orange)] transition-[width] duration-300 ease-in-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
