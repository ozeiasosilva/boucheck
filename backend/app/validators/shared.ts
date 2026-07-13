import vine from '@vinejs/vine'

/**
 * Req 2.1, 2.2 — Slug format: non-empty, lowercase letters, digits, and hyphens only.
 */
export const SLUG_REGEX = /^[a-z0-9-]+$/
export const slugRule = vine.string().trim().regex(SLUG_REGEX)

// Req 7.3, 21.6 — CSS hexadecimal color (#rgb, #rrggbb, #rrggbbaa)
export const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
export const hexColorRule = vine.string().trim().regex(HEX_COLOR_REGEX)
