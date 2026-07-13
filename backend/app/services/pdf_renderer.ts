// ---------------------------------------------------------------------------
// PDF Renderer (Req 9.1, 9.3)
//
// Headless Playwright Chromium wrapper that renders arbitrary HTML into a
// PDF document. The caller (PDF_Generation_Worker) passes in the exact HTML
// content stored in S3 — this class never re-assembles or re-templates
// content itself (Req 9.3).
// ---------------------------------------------------------------------------

import { chromium } from 'playwright-chromium'

/**
 * Wraps Playwright's headless Chromium browser to convert HTML strings into
 * PDF buffers formatted for A4 with background rendering enabled.
 *
 * Validates: Requirement 9.1 (headless Chromium/Playwright rendering)
 * Validates: Requirement 9.3 (renders from exact HTML passed in)
 */
export class PdfRenderer {
  /**
   * Renders the provided HTML string into an A4 PDF document.
   *
   * Launches a disposable headless Chromium instance, loads the HTML via
   * `page.setContent` (waiting for network-idle to allow inline resources to
   * settle), then captures the PDF with `page.pdf`.
   *
   * The browser is always closed in a `finally` block to prevent leaked
   * processes even when rendering fails.
   */
  async renderFromHtml(html: string): Promise<Buffer> {
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'networkidle' })
      const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true })
      return Buffer.from(pdfBuffer)
    } finally {
      await browser.close()
    }
  }
}
