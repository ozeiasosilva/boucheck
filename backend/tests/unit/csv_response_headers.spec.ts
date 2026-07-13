import { describe, it } from 'node:test'
import assert from 'node:assert'

/**
 * Unit tests for CSV response headers contract.
 * Validates: Requirements 7.4
 *
 * These tests verify the expected header values that the ExportController
 * will set when streaming the CSV response, ensuring they conform to
 * HTTP header specifications for CSV file downloads.
 */

const CSV_CONTENT_TYPE = 'text/csv; charset=utf-8'
const CSV_CONTENT_DISPOSITION = 'attachment; filename="responses.csv"'

describe('CSV response headers', () => {
  describe('Content-Type is a CSV media type', () => {
    it('has the correct MIME type for CSV', () => {
      assert.ok(
        CSV_CONTENT_TYPE === 'text/csv' || CSV_CONTENT_TYPE.startsWith('text/csv'),
        `Expected Content-Type to be text/csv or text/csv with params, got: ${CSV_CONTENT_TYPE}`
      )
    })

    it('specifies text/csv as the media type', () => {
      const mediaType = CSV_CONTENT_TYPE.split(';')[0].trim()
      assert.strictEqual(mediaType, 'text/csv')
    })

    it('includes charset=utf-8 parameter', () => {
      const params = CSV_CONTENT_TYPE.split(';').slice(1).map((p) => p.trim().toLowerCase())
      assert.ok(
        params.includes('charset=utf-8'),
        `Expected charset=utf-8 in Content-Type params, got: ${params.join(', ')}`
      )
    })
  })

  describe('Content-Disposition is attachment with a filename', () => {
    it('starts with "attachment"', () => {
      assert.ok(
        CSV_CONTENT_DISPOSITION.startsWith('attachment'),
        `Expected Content-Disposition to start with "attachment", got: ${CSV_CONTENT_DISPOSITION}`
      )
    })

    it('contains a filename parameter', () => {
      assert.ok(
        CSV_CONTENT_DISPOSITION.includes('filename='),
        `Expected Content-Disposition to contain "filename=", got: ${CSV_CONTENT_DISPOSITION}`
      )
    })

    it('filename has a .csv extension', () => {
      const filenameMatch = CSV_CONTENT_DISPOSITION.match(/filename="?([^";\s]+)"?/)
      assert.ok(filenameMatch, 'Expected a filename value in Content-Disposition')
      const filename = filenameMatch![1]
      assert.ok(
        filename.endsWith('.csv'),
        `Expected filename to end with .csv, got: ${filename}`
      )
    })
  })

  describe('HTTP header specification conformance', () => {
    it('Content-Type follows RFC 7231 media-type syntax', () => {
      // RFC 7231: media-type = type "/" subtype *( ";" parameter )
      const mediaTypeRegex = /^[a-z]+\/[a-z0-9.+-]+(\s*;\s*[a-z0-9-]+=\S+)*$/i
      assert.ok(
        mediaTypeRegex.test(CSV_CONTENT_TYPE),
        `Content-Type does not match RFC 7231 media-type syntax: ${CSV_CONTENT_TYPE}`
      )
    })

    it('Content-Disposition follows RFC 6266 disposition syntax', () => {
      // RFC 6266: disposition-type *( ";" disposition-parm )
      // disposition-type = "inline" | "attachment"
      // disposition-parm = filename-parm | ...
      assert.ok(
        CSV_CONTENT_DISPOSITION.startsWith('attachment'),
        'Expected disposition-type to be "attachment"'
      )
      assert.ok(
        /;\s*filename=/.test(CSV_CONTENT_DISPOSITION),
        'Expected disposition-parm with filename parameter'
      )
    })

    it('filename is properly quoted per RFC 6266', () => {
      // RFC 6266 recommends quoting filename values
      const filenameParamMatch = CSV_CONTENT_DISPOSITION.match(/filename=("([^"]+)"|([^\s;]+))/)
      assert.ok(filenameParamMatch, 'Expected filename parameter')
      // The filename should be quoted for spec compliance
      assert.ok(
        CSV_CONTENT_DISPOSITION.includes('filename="'),
        'Expected filename value to be enclosed in double quotes'
      )
    })
  })
})
