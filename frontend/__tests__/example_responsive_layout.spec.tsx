// Feature: public-response-flow
// Example test: Mobile-first responsiveness of the question flow page
// Validates: Requirements 4.11

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * This test verifies the question flow component uses mobile-first responsive
 * Tailwind CSS patterns. Since rendering React components in node:test without
 * jsdom isn't practical, we verify the structural patterns by reading the
 * component source and asserting that responsive class patterns are present.
 */

const componentPath = resolve(
  import.meta.dirname ?? __dirname,
  '..',
  'app',
  '[slug]',
  'perguntas',
  'page.tsx'
)
const source = readFileSync(componentPath, 'utf-8')

describe('Mobile-first responsive layout (Req 4.11)', () => {
  it('uses flex-col as default (mobile) with sm:flex-row for larger breakpoints', () => {
    // Mobile-first: column layout by default, row on sm+
    assert.ok(
      source.includes('flex-col') && source.includes('sm:flex-row'),
      'Component should use flex-col (mobile default) and sm:flex-row (larger breakpoints)'
    )
  })

  it('uses w-full as default (mobile) with sm:w-auto for larger breakpoints', () => {
    // Buttons take full width on mobile, auto width on sm+
    assert.ok(
      source.includes('w-full') && source.includes('sm:w-auto'),
      'Component should use w-full (mobile) and sm:w-auto (larger breakpoints) for buttons'
    )
  })

  it('constrains content width with max-w-2xl', () => {
    assert.ok(
      source.includes('max-w-2xl'),
      'Component should constrain main content width with max-w-2xl'
    )
  })

  it('uses responsive padding (p-4 default, sm:p-8 for larger screens)', () => {
    assert.ok(
      source.includes('p-4') && source.includes('sm:p-8'),
      'Component should use p-4 (mobile) and sm:p-8 (larger breakpoints) for padding'
    )
  })

  it('uses min-h-screen for full viewport height on all devices', () => {
    assert.ok(
      source.includes('min-h-screen'),
      'Component should use min-h-screen for full viewport height'
    )
  })

  it('action buttons stack vertically on mobile (flex-col in button container)', () => {
    // The action buttons area should use flex-col for mobile stacking
    // and sm:flex-row for horizontal alignment on larger screens
    const hasButtonStack =
      source.includes('flex flex-col sm:flex-row') ||
      source.includes('flex-col sm:flex-row')
    assert.ok(
      hasButtonStack,
      'Action buttons should stack vertically on mobile (flex-col) and horizontally on sm+ (sm:flex-row)'
    )
  })

  it('uses responsive text sizing (text-lg sm:text-xl for headings)', () => {
    assert.ok(
      source.includes('text-lg') && source.includes('sm:text-xl'),
      'Component should use responsive text sizing (text-lg for mobile, sm:text-xl for larger)'
    )
  })
})
