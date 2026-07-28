/**
 * RadarPattern — malha pentagonal concêntrica (identidade visual do produto).
 * Uso: fundo decorativo no hero (grande) e na seção CTA final (pequena).
 */
interface RadarPatternProps {
  className?: string
  strokeColor?: string
  opacity?: number
}

export function RadarPattern({
  className = '',
  strokeColor = 'var(--color-blue)',
  opacity = 0.08,
}: RadarPatternProps) {
  // Gera pontos de um pentágono regular em dado raio
  const pentagonPoints = (cx: number, cy: number, r: number) => {
    const pts: string[] = []
    for (let i = 0; i < 5; i++) {
      const angle = (Math.PI / 2) + (2 * Math.PI * i) / 5
      pts.push(`${cx + r * Math.cos(angle)},${cy - r * Math.sin(angle)}`)
    }
    return pts.join(' ')
  }

  const cx = 200
  const cy = 200
  const radii = [40, 75, 110, 145, 180]

  return (
    <svg
      viewBox="0 0 400 400"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      style={{ opacity }}
    >
      {/* Anéis concêntricos */}
      {radii.map((r) => (
        <polygon
          key={r}
          points={pentagonPoints(cx, cy, r)}
          stroke={strokeColor}
          strokeWidth="1"
          fill="none"
        />
      ))}
      {/* Linhas radiais (do centro para cada vértice externo) */}
      {Array.from({ length: 5 }).map((_, i) => {
        const angle = (Math.PI / 2) + (2 * Math.PI * i) / 5
        const x2 = cx + 180 * Math.cos(angle)
        const y2 = cy - 180 * Math.sin(angle)
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={x2}
            y2={y2}
            stroke={strokeColor}
            strokeWidth="1"
          />
        )
      })}
    </svg>
  )
}
