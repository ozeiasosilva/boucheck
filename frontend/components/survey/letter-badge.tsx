/**
 * Converte índice 0-based para letra(s) maiúscula(s).
 * 0→A, 1→B, ..., 25→Z, 26→AA, 27→AB, ...
 */
export function indexToLetter(index: number): string {
  let result = ''
  let n = index
  do {
    result = String.fromCharCode(65 + (n % 26)) + result
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return result
}

interface LetterBadgeProps {
  index: number
  selected: boolean
  darkMode?: boolean
}

export function LetterBadge({ index, selected, darkMode }: LetterBadgeProps) {
  const letter = indexToLetter(index)

  const baseClasses =
    'flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold shrink-0 transition-colors duration-300 ease-in-out'

  let stateClasses: string

  if (selected) {
    // Selected: brand-blue background, white text (works for both light and dark)
    stateClasses = 'bg-[var(--color-brand-blue)] text-white'
  } else if (darkMode) {
    // Dark mode default: darker gray background, light text for WCAG AA contrast (4.5:1)
    stateClasses = 'bg-gray-700 text-gray-100'
  } else {
    // Light mode default: light gray background, dark text
    stateClasses = 'bg-gray-100 text-gray-700'
  }

  return (
    <span
      className={`${baseClasses} ${stateClasses}`}
      aria-hidden="true"
    >
      {letter}
    </span>
  )
}
