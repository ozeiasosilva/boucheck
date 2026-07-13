import { describe, it, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert'
import React from 'react'

/**
 * Example test for SSR rendering of the landing page.
 *
 * Tests the `generateMetadata` function and the page component output
 * by mocking `global.fetch` to return controlled survey data.
 *
 * **Validates: Requirements 1.1, 1.5, 2.1**
 */

// ---------------------------------------------------------------------------
// Make React available globally for JSX transform in the server component
// ---------------------------------------------------------------------------

;(globalThis as any).React = React

// ---------------------------------------------------------------------------
// Register module mocks for Next.js modules before importing the page
// ---------------------------------------------------------------------------

// Mock next/navigation — notFound throws to signal 404
mock.module('next/navigation', {
  namedExports: {
    notFound: () => {
      throw new Error('NEXT_NOT_FOUND')
    },
  },
})

// Mock next/link — render as a plain anchor-like element
mock.module('next/link', {
  defaultExport: ({ href, children, ...props }: any) =>
    React.createElement('a', { href, ...props }, children),
})

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const ACTIVE_SURVEY = {
  id: 1,
  slug: 'maturidadeti',
  nome: 'Maturidade de TI',
  mensagem_objetivo: '<p>Avalie o nível de <strong>maturidade</strong> tecnológica da sua empresa.</p>',
  tempo_estimado_min: 15,
  config_visual: {
    cor_primaria: '#1E40AF',
    cor_secundaria: '#3B82F6',
    cor_fundo: '#F8FAFC',
    logo_s3_key: 'logos/survey-1/logo.png',
  },
  logo_url: 'https://cdn.boucheck.beonup.com.br/logos/survey-1/logo.png',
}

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

let originalFetch: typeof globalThis.fetch

function mockFetchSuccess(data: unknown) {
  ;(globalThis as any).fetch = async (_url: string | URL | Request, _opts?: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => data,
  })
}

function mockFetch404() {
  ;(globalThis as any).fetch = async (_url: string | URL | Request, _opts?: RequestInit) => ({
    ok: false,
    status: 404,
    json: async () => ({ error: 'survey_not_found' }),
  })
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('SSR Landing Page — generateMetadata', () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('returns metadata with survey name in the title for an active survey', async () => {
    mockFetchSuccess(ACTIVE_SURVEY)

    const { generateMetadata } = await import('../app/[slug]/page.js')
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'maturidadeti' }) })

    assert.ok(
      typeof metadata.title === 'string' && metadata.title.includes('Maturidade de TI'),
      `Expected title to include survey name, got: ${metadata.title}`
    )
  })

  it('returns metadata with a description derived from mensagem_objetivo (HTML stripped)', async () => {
    mockFetchSuccess(ACTIVE_SURVEY)

    const { generateMetadata } = await import('../app/[slug]/page.js')
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'maturidadeti' }) })

    assert.ok(
      typeof metadata.description === 'string',
      'Expected description to be a string'
    )
    // HTML tags should be stripped
    assert.ok(
      !metadata.description!.includes('<p>') && !metadata.description!.includes('<strong>'),
      `Expected HTML tags to be stripped from description, got: ${metadata.description}`
    )
    // Should contain the plain text content
    assert.ok(
      metadata.description!.includes('Avalie o nível de'),
      `Expected description to contain plain text from mensagem_objetivo`
    )
  })

  it('includes Open Graph metadata with survey title and description', async () => {
    mockFetchSuccess(ACTIVE_SURVEY)

    const { generateMetadata } = await import('../app/[slug]/page.js')
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'maturidadeti' }) })

    assert.ok(metadata.openGraph, 'Expected openGraph metadata to be present')
    assert.strictEqual(metadata.openGraph!.title, 'Maturidade de TI')
    assert.ok(
      typeof metadata.openGraph!.description === 'string' &&
        metadata.openGraph!.description.length > 0,
      'Expected openGraph description to be non-empty'
    )
  })

  it('returns not-found metadata when the survey does not exist (404)', async () => {
    mockFetch404()

    const { generateMetadata } = await import('../app/[slug]/page.js')
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'nonexistent' }) })

    assert.ok(
      typeof metadata.title === 'string' && metadata.title.includes('não encontrada'),
      `Expected not-found title, got: ${metadata.title}`
    )
  })
})

describe('SSR Landing Page — page component output', () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('renders the survey name, objective message, and estimated time', async () => {
    mockFetchSuccess(ACTIVE_SURVEY)

    const pageModule = await import('../app/[slug]/page.js')
    const Page = pageModule.default

    // Call the server component as a function — it returns React elements (JSX)
    const result = await Page({ params: Promise.resolve({ slug: 'maturidadeti' }) })

    // Serialize the React tree to a string to verify content
    const rendered = JSON.stringify(result)

    // Survey name should be present
    assert.ok(
      rendered.includes('Maturidade de TI'),
      'Expected rendered output to include survey name'
    )

    // Objective message content should be present (raw HTML in dangerouslySetInnerHTML)
    assert.ok(
      rendered.includes('Avalie o nível de'),
      'Expected rendered output to include objective message content'
    )

    // Estimated time should be present
    assert.ok(
      rendered.includes('15'),
      'Expected rendered output to include estimated time (15 min)'
    )
    assert.ok(
      rendered.includes('Tempo estimado'),
      'Expected rendered output to include "Tempo estimado" label'
    )
  })

  it('applies visual identity colors from config_visual', async () => {
    mockFetchSuccess(ACTIVE_SURVEY)

    const pageModule = await import('../app/[slug]/page.js')
    const Page = pageModule.default
    const result = await Page({ params: Promise.resolve({ slug: 'maturidadeti' }) })

    const rendered = JSON.stringify(result)

    assert.ok(
      rendered.includes('#1E40AF'),
      'Expected rendered output to include cor_primaria'
    )
    assert.ok(
      rendered.includes('#F8FAFC'),
      'Expected rendered output to include cor_fundo'
    )
  })

  it('includes the "Iniciar" action link', async () => {
    mockFetchSuccess(ACTIVE_SURVEY)

    const pageModule = await import('../app/[slug]/page.js')
    const Page = pageModule.default
    const result = await Page({ params: Promise.resolve({ slug: 'maturidadeti' }) })

    const rendered = JSON.stringify(result)

    assert.ok(
      rendered.includes('Iniciar'),
      'Expected rendered output to include "Iniciar" action text'
    )
    assert.ok(
      rendered.includes('/maturidadeti/identificacao'),
      'Expected "Iniciar" link to point to identification page'
    )
  })

  it('renders the logo when logo_url is provided', async () => {
    mockFetchSuccess(ACTIVE_SURVEY)

    const pageModule = await import('../app/[slug]/page.js')
    const Page = pageModule.default
    const result = await Page({ params: Promise.resolve({ slug: 'maturidadeti' }) })

    const rendered = JSON.stringify(result)

    assert.ok(
      rendered.includes('https://cdn.boucheck.beonup.com.br/logos/survey-1/logo.png'),
      'Expected rendered output to include logo URL'
    )
  })
})
