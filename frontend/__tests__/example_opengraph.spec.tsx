import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'

/**
 * Example test for Open Graph metadata generation
 *
 * Verifies that the `generateMetadata` function from the SSR landing page
 * returns correct Open Graph metadata (og:title, og:description, og:image)
 * based on the fetched survey data.
 *
 * **Validates: Requirements 1.6**
 */

// We need to mock fetch before importing the module
let originalFetch: typeof globalThis.fetch

function createMockSurvey(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 1,
    slug: 'test-survey',
    nome: 'Pesquisa de Maturidade',
    mensagem_objetivo: '<p>Avalie o <strong>nível</strong> de maturidade da sua empresa em TI.</p>',
    tempo_estimado_min: 15,
    config_visual: {
      cor_primaria: '#1E40AF',
      cor_secundaria: '#3B82F6',
      cor_fundo: '#F8FAFC',
      logo_s3_key: 'logos/survey-1/logo.png',
    },
    logo_url: 'https://cdn.boucheck.beonup.com.br/logos/survey-1/logo.png',
    ...overrides,
  }
}

describe('Open Graph metadata generation (Req 1.6)', () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('includes og:title set to survey name', async () => {
    const mockSurvey = createMockSurvey()

    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => mockSurvey,
    })) as unknown as typeof fetch

    const { generateMetadata } = await import('../app/[slug]/page.js')

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'test-survey' }),
    })

    assert.ok(metadata.openGraph, 'Expected openGraph to be present in metadata')
    assert.strictEqual(
      (metadata.openGraph as { title?: string }).title,
      'Pesquisa de Maturidade',
      'og:title should equal the survey name'
    )
  })

  it('includes og:description as HTML-stripped mensagem_objetivo', async () => {
    const mockSurvey = createMockSurvey()

    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => mockSurvey,
    })) as unknown as typeof fetch

    const { generateMetadata } = await import('../app/[slug]/page.js')

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'test-survey' }),
    })

    assert.ok(metadata.openGraph, 'Expected openGraph to be present in metadata')
    const ogDescription = (metadata.openGraph as { description?: string }).description
    assert.ok(ogDescription, 'Expected og:description to be present')

    // Should NOT contain HTML tags
    assert.ok(
      !ogDescription.includes('<'),
      `og:description should not contain HTML tags, got: "${ogDescription}"`
    )

    // Should contain the text content stripped of tags
    assert.ok(
      ogDescription.includes('Avalie o'),
      `og:description should contain stripped text content`
    )
    assert.ok(
      ogDescription.includes('nível'),
      `og:description should contain text that was inside bold tags`
    )
  })

  it('includes og:images array with logo_url when survey has a logo', async () => {
    const mockSurvey = createMockSurvey({
      logo_url: 'https://cdn.boucheck.beonup.com.br/logos/survey-1/logo.png',
    })

    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => mockSurvey,
    })) as unknown as typeof fetch

    const { generateMetadata } = await import('../app/[slug]/page.js')

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'test-survey' }),
    })

    assert.ok(metadata.openGraph, 'Expected openGraph to be present')
    const images = (metadata.openGraph as { images?: Array<{ url: string }> }).images
    assert.ok(Array.isArray(images), 'Expected og:images to be an array')
    assert.ok(images.length > 0, 'Expected at least one image in og:images')
    assert.strictEqual(
      images[0].url,
      'https://cdn.boucheck.beonup.com.br/logos/survey-1/logo.png',
      'og:image url should match survey logo_url'
    )
  })

  it('omits og:images when survey has no logo_url', async () => {
    const mockSurvey = createMockSurvey({ logo_url: null })

    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => mockSurvey,
    })) as unknown as typeof fetch

    const { generateMetadata } = await import('../app/[slug]/page.js')

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'test-survey' }),
    })

    assert.ok(metadata.openGraph, 'Expected openGraph to be present')
    const images = (metadata.openGraph as { images?: Array<{ url: string }> }).images
    assert.ok(
      !images || images.length === 0,
      'Expected og:images to be absent or empty when no logo_url'
    )
  })

  it('returns fallback metadata when survey is not found (404)', async () => {
    globalThis.fetch = (async () => ({
      ok: false,
      status: 404,
      json: async () => ({ error: 'survey_not_found' }),
    })) as unknown as typeof fetch

    const { generateMetadata } = await import('../app/[slug]/page.js')

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'nonexistent' }),
    })

    // Should not have openGraph when survey not found
    assert.strictEqual(
      metadata.openGraph,
      undefined,
      'Expected no openGraph metadata when survey not found'
    )
    // Should have a fallback title
    assert.ok(metadata.title, 'Expected a fallback title when survey not found')
  })
})
