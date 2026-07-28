'use client'

import { LetterBadge } from './letter-badge'
import type { Option } from '@/lib/navigation/types'

export interface OptionCardProps {
  option: Option
  index: number // posição 0-indexed para letter badge
  selected: boolean
  questionType: 'escolha_unica' | 'multipla_escolha'
  onSelect: (optionId: number) => void
  darkMode?: boolean
  tabIndex?: number
}

export function OptionCard({
  option,
  index,
  selected,
  questionType,
  onSelect,
  darkMode,
  tabIndex,
}: OptionCardProps) {
  const role = questionType === 'escolha_unica' ? 'radio' : 'checkbox'
  const inputType = questionType === 'escolha_unica' ? 'radio' : 'checkbox'

  function handleClick() {
    onSelect(option.id)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(option.id)
    }
  }

  // Build style classes based on selected state and darkMode
  let cardClasses: string

  if (selected) {
    cardClasses = darkMode
      ? 'border-[var(--color-brand-blue)] bg-[var(--color-dark-light)]'
      : 'border-[var(--color-brand-blue)] bg-[var(--color-primary-light)]'
  } else {
    cardClasses = darkMode
      ? 'border-gray-600 bg-transparent'
      : 'border-[var(--color-border)] bg-transparent'
  }

  return (
    <div
      role={role}
      aria-checked={selected}
      tabIndex={tabIndex ?? 0}
      className={`
        relative flex items-center gap-3 px-4 py-3 cursor-pointer
        border-2 rounded-[var(--radius-card)] shadow-[var(--shadow-card)]
        transition-all duration-300 ease-in-out
        focus-visible:outline-2 focus-visible:outline-[var(--color-brand-blue)] focus-visible:outline-offset-2
        ${cardClasses}
      `}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {/* Hidden native input for accessibility fallback / form submission */}
      <input
        type={inputType}
        checked={selected}
        onChange={() => onSelect(option.id)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      <LetterBadge index={index} selected={selected} darkMode={darkMode} />

      <span
        className={`text-sm font-medium select-none ${
          darkMode ? 'text-gray-100' : 'text-[var(--color-text)]'
        }`}
      >
        {option.texto}
      </span>
    </div>
  )
}
