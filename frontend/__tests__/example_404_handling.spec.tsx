import { describe, it, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert'
import React from 'react'

/**
 * Example tests for 404 handling
 *
 * Verifies HTTP 404 and branded not-found rendering for:
 * - Unknown slug
 * - Each non-active survey status (rascunho, inativo, arquivado)
 *
 * **Validates: Requirements 1.2, 1.3**
 */

// ---------------------------------------------------------------------------
// Make React available globally for JSX transform in server components
// ---------------------------------------------------------------------------

;(globalThis as any).React = React

// ---------------------------------------------------------------------------
// Register module mocks for Next.js modules before importing the page
// ---------------------------------------------------------------------------

// Mock next/navigation — notFound throws a recognizable error
mock.module('next/navigation', {
  namedExports: {
    notFound: () => {
      const err = new Error('NEXT_NOT_FOUND')
      ;(err as any).digest = 'NEXT_HTTP_ERROR_FALLBACK;404'
      throw err
    },
  },
})

// Mock next/link — render as a plain anchor-like element
mock.module('next/link', {
  defaultExport: ({ href, children, ...props }: any) =>
    React.createElement('a', { href, ...props }, children),
})

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch

function mockFetch404() {
  ;(globalThis as any).fetch = async (_url: string | URL | Request, _opts?: RequestInit) => ({
    ok: false,
    status: 404,
    json: async () => ({ error: 'survey_not_found' }),
  })
}

// ---------------------------------------------------------------------------
// Test suite: generateMetadata returns not-found title
// ---------------------------------------------------------------------------

describe('404 handling — generateMetadata returns not-found title on 404', () => {
  beforeEach(() => {
    mockFetch404()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('returns "Pesquisa não encontrada — BouCheck" title for an unknown slug', async () => {
    const { generateMetadata } = await import('../app/[slug]/page.js')

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'slug-inexistente-xyz' }),
    })

    assert.strictEqual(
      metadata.title,
      'Pesquisa não encontrada — BouCheck',
      'Metadata title should indicate survey not found'
    )
  })

  it('returns not-found title for a survey with status "rascunho" (API returns 404)', async () => {
    const { generateMetadata } = await import('../app/[slug]/page.js')

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'pesquisa-rascunho' }),
    })

    assert.strictEqual(
      metadata.title,
      'Pesquisa não encontrada — BouCheck',
      'rascunho surveys should produce the not-found metadata title'
    )
  })

  it('returns not-found title for a survey with status "inativo" (API returns 404)', async () => {
    const { generateMetadata } = await import('../app/[slug]/page.js')

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'pesquisa-inativa' }),
    })

    assert.strictEqual(
      metadata.title,
      'Pesquisa não encontrada — BouCheck',
      'inativo surveys should produce the not-found metadata title'
    )
  })

  it('returns not-found title for a survey with status "arquivado" (API returns 404)', async () => {
    const { generateMetadata } = await import('../app/[slug]/page.js')

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'pesquisa-arquivada' }),
    })

    assert.strictEqual(
      metadata.title,
      'Pesquisa não encontrada — BouCheck',
      'arquivado surveys should produce the not-found metadata title'
    )
  })
})

// ---------------------------------------------------------------------------
// Test suite: page component calls notFound() when API returns 404
// ---------------------------------------------------------------------------

describe('404 handling — page component calls notFound() when API returns 404', () => {
  beforeEach(() => {
    mockFetch404()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('throws the Next.js notFound error for an unknown slug', async () => {
    const { default: SurveyLandingPage } = await import('../app/[slug]/page.js')

    try {
      await SurveyLandingPage({
        params: Promise.resolve({ slug: 'nao-existe' }),
      })
      assert.fail('Expected notFound() to be called (should throw)')
    } catch (err: unknown) {
      // Next.js 15 notFound() throws with digest NEXT_HTTP_ERROR_FALLBACK;404
      const error = err as { digest?: string }
      assert.strictEqual(
        error.digest,
        'NEXT_HTTP_ERROR_FALLBACK;404',
        'Expected the Next.js notFound digest error'
      )
    }
  })

  it('throws the Next.js notFound error for a rascunho survey', async () => {
    const { default: SurveyLandingPage } = await import('../app/[slug]/page.js')

    try {
      await SurveyLandingPage({
        params: Promise.resolve({ slug: 'pesquisa-rascunho' }),
      })
      assert.fail('Expected notFound() to be called')
    } catch (err: unknown) {
      const error = err as { digest?: string }
      assert.strictEqual(error.digest, 'NEXT_HTTP_ERROR_FALLBACK;404')
    }
  })

  it('throws the Next.js notFound error for an inativo survey', async () => {
    const { default: SurveyLandingPage } = await import('../app/[slug]/page.js')

    try {
      await SurveyLandingPage({
        params: Promise.resolve({ slug: 'pesquisa-inativa' }),
      })
      assert.fail('Expected notFound() to be called')
    } catch (err: unknown) {
      const error = err as { digest?: string }
      assert.strictEqual(error.digest, 'NEXT_HTTP_ERROR_FALLBACK;404')
    }
  })

  it('throws the Next.js notFound error for an arquivado survey', async () => {
    const { default: SurveyLandingPage } = await import('../app/[slug]/page.js')

    try {
      await SurveyLandingPage({
        params: Promise.resolve({ slug: 'pesquisa-arquivada' }),
      })
      assert.fail('Expected notFound() to be called')
    } catch (err: unknown) {
      const error = err as { digest?: string }
      assert.strictEqual(error.digest, 'NEXT_HTTP_ERROR_FALLBACK;404')
    }
  })
})

// ---------------------------------------------------------------------------
// Test suite: NotFound component renders branded content
// ---------------------------------------------------------------------------

describe('404 handling — NotFound component renders branded content', () => {
  it('exports a default function component that renders without errors', async () => {
    const notFoundModule = await import('../app/not-found.js')
    const NotFound = notFoundModule.default

    assert.strictEqual(typeof NotFound, 'function', 'NotFound should be a function component')

    // Call the component function to verify it renders without throwing
    const element = NotFound()

    assert.ok(element, 'NotFound component should return a valid React element')
    assert.strictEqual(element.type, 'div', 'Root element should be a div')
  })

  it('renders the "BouCheck" brand text', async () => {
    const notFoundModule = await import('../app/not-found.js')
    const NotFound = notFoundModule.default
    const element = NotFound()

    // Traverse the React element tree to find "BouCheck" text
    const json = JSON.stringify(element)
    assert.ok(
      json.includes('BouCheck'),
      'NotFound page should contain the BouCheck brand name'
    )
  })

  it('renders "Pesquisa não encontrada" message', async () => {
    const notFoundModule = await import('../app/not-found.js')
    const NotFound = notFoundModule.default
    const element = NotFound()

    const json = JSON.stringify(element)
    assert.ok(
      json.includes('Pesquisa não encontrada'),
      'NotFound page should contain "Pesquisa não encontrada" heading'
    )
  })

  it('renders the 404 indicator', async () => {
    const notFoundModule = await import('../app/not-found.js')
    const NotFound = notFoundModule.default
    const element = NotFound()

    const json = JSON.stringify(element)
    assert.ok(
      json.includes('404'),
      'NotFound page should contain "404" text indicator'
    )
  })

  it('renders an explanation message about the survey not being available', async () => {
    const notFoundModule = await import('../app/not-found.js')
    const NotFound = notFoundModule.default
    const element = NotFound()

    const json = JSON.stringify(element)
    assert.ok(
      json.includes('não está disponível'),
      'NotFound page should explain the survey is not available'
    )
  })
})
