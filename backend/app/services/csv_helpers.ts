// ---------------------------------------------------------------------------
// CSV Helper Functions
// ---------------------------------------------------------------------------
// Pure utility functions for CSV formatting, extracted to allow testing
// without triggering the AdonisJS/Lucid module initialization chain.
// ---------------------------------------------------------------------------

/**
 * UTF-8 BOM bytes for CSV export (Req 7.3).
 */
export const CSV_BOM = Buffer.from([0xef, 0xbb, 0xbf])

/**
 * Escapes a CSV field value per RFC 4180 adapted for `;` delimiter.
 * Fields containing the separator, double quotes, or line breaks are
 * enclosed in double quotes with inner quotes doubled.
 */
export function csvEscape(field: string): string {
  return /[;"\r\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field
}
