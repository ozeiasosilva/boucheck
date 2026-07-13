import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'
import { csvEscape, CSV_BOM } from '../../app/services/csv_helpers.js'

/**
 * Property-based tests for CSV format correctness
 * Property 12: CSV format correctness
 * Validates: Requirements 7.2, 7.3
 */

/**
 * Helper: unescapes a CSV field that was escaped with csvEscape.
 * Reverses the quoting/doubling logic for round-trip verification.
 */
function csvUnescape(field: string): string {
  if (field.startsWith('"') && field.endsWith('"')) {
    // Remove surrounding quotes and un-double embedded quotes
    return field.slice(1, -1).replace(/""/g, '"')
  }
  return field
}

/**
 * Helper: parses a single `;`-delimited CSV line respecting quoted fields.
 * Handles fields that contain `;` within double quotes.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  let i = 0

  while (i < line.length) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '""'
          i += 2
        } else {
          current += '"'
          inQuotes = false
          i++
        }
      } else {
        current += ch
        i++
      }
    } else {
      if (ch === '"') {
        current += '"'
        inQuotes = true
        i++
      } else if (ch === ';') {
        fields.push(current)
        current = ''
        i++
      } else {
        current += ch
        i++
      }
    }
  }
  fields.push(current)
  return fields
}

describe('Property 12: CSV format correctness', () => {
  it('csvEscape round-trips: escaping and unescaping produces the original value', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 200 }), (input) => {
        const escaped = csvEscape(input)
        const unescaped = csvUnescape(escaped)
        assert.strictEqual(
          unescaped,
          input,
          `Round-trip failed: input=${JSON.stringify(input)}, escaped=${JSON.stringify(escaped)}, unescaped=${JSON.stringify(unescaped)}`
        )
      }),
      { numRuns: 200 }
    )
  })

  it('escaped fields never produce unintended separators in a ;-joined line', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 0, maxLength: 100 }), { minLength: 2, maxLength: 10 }),
        (fields) => {
          const escapedFields = fields.map(csvEscape)
          const line = escapedFields.join(';')
          const parsed = parseCsvLine(line)
          // After parsing, we should get exactly the same number of fields back
          assert.strictEqual(
            parsed.length,
            fields.length,
            `Field count mismatch: expected ${fields.length}, got ${parsed.length} for line: ${line}`
          )
          // Each parsed field should unescape to the original
          for (let i = 0; i < fields.length; i++) {
            const recovered = csvUnescape(parsed[i])
            assert.strictEqual(
              recovered,
              fields[i],
              `Field ${i} mismatch: expected ${JSON.stringify(fields[i])}, got ${JSON.stringify(recovered)}`
            )
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it('fields containing ; are quoted', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 100 }).filter((s) => s.includes(';')),
        (input) => {
          const escaped = csvEscape(input)
          assert.ok(
            escaped.startsWith('"') && escaped.endsWith('"'),
            `Field containing ";" should be quoted: input=${JSON.stringify(input)}, escaped=${JSON.stringify(escaped)}`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('fields containing " are quoted and doubled', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 100 }).filter((s) => s.includes('"')),
        (input) => {
          const escaped = csvEscape(input)
          // Must be quoted
          assert.ok(
            escaped.startsWith('"') && escaped.endsWith('"'),
            `Field containing '"' should be quoted: input=${JSON.stringify(input)}, escaped=${JSON.stringify(escaped)}`
          )
          // Inner content (without outer quotes) should have all " doubled
          const inner = escaped.slice(1, -1)
          const originalQuoteCount = (input.match(/"/g) || []).length
          const doubledQuoteCount = (inner.match(/""/g) || []).length
          assert.strictEqual(
            doubledQuoteCount,
            originalQuoteCount,
            `Expected ${originalQuoteCount} doubled quotes, found ${doubledQuoteCount}`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('fields without special chars are unchanged', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 200 }).filter((s) => !/[;"\r\n]/.test(s)),
        (input) => {
          const escaped = csvEscape(input)
          assert.strictEqual(
            escaped,
            input,
            `Field without special chars should be unchanged: input=${JSON.stringify(input)}, escaped=${JSON.stringify(escaped)}`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('the BOM bytes are exactly [0xEF, 0xBB, 0xBF]', () => {
    // Verify the BOM constant used in CsvExporter matches the UTF-8 BOM spec
    assert.strictEqual(CSV_BOM.length, 3)
    assert.strictEqual(CSV_BOM[0], 0xef)
    assert.strictEqual(CSV_BOM[1], 0xbb)
    assert.strictEqual(CSV_BOM[2], 0xbf)
    // Also verify as string it matches the UTF-8 BOM character
    assert.strictEqual(CSV_BOM.toString('utf8'), '\uFEFF')
  })
})
