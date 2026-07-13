// ---------------------------------------------------------------------------
// logo_upload — S3 helper for survey logo file uploads
//
// Validates file type and size before uploading to the foundation `logos`
// bucket. The S3 client is injectable/mockable for testing.
//
// Requirements covered:
//   8.1 — Store file in Object_Store and record key in config_visual.logo_s3_key
//   8.2 — Reject non-PNG/SVG/JPG with 422
//   8.3 — Reject files > 2 MB with 422
//   8.4 — Store in bucket with Block Public Access + SSE (foundation bucket)
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimal file interface representing a multipart upload.
 * Compatible with AdonisJS MultipartFile shape.
 */
export interface LogoFile {
  /** MIME type of the uploaded file, e.g. 'image/png' */
  type: string
  /** File size in bytes */
  size: number
  /** Original file extension without dot, e.g. 'png', 'svg', 'jpg', 'jpeg' */
  extname: string
  /** Readable stream or buffer of the file contents */
  tmpPath?: string
  /** The file buffer (used when tmpPath is not available) */
  buffer?: Buffer
}

/**
 * Minimal S3 client interface for PutObject.
 * Injectable/mockable — callers provide their own implementation or a real
 * S3Client instance wrapped in this interface.
 */
export interface S3ClientLike {
  putObject(params: {
    Bucket: string
    Key: string
    Body: Buffer | NodeJS.ReadableStream
    ContentType: string
  }): Promise<void>
}

// ---------------------------------------------------------------------------
// Domain Errors
// ---------------------------------------------------------------------------

/**
 * Thrown when the uploaded file MIME type is not allowed (Req 8.2).
 */
export class InvalidLogoTypeError extends Error {
  status = 422
  constructor() {
    super('Logo file must be PNG, SVG, or JPG')
  }
}

/**
 * Thrown when the uploaded file exceeds the 2 MB size limit (Req 8.3).
 */
export class LogoTooLargeError extends Error {
  status = 422
  constructor() {
    super('Logo file must not exceed 2 MB')
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Allowed MIME types for logo uploads (Req 8.2) */
export const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/svg+xml',
  'image/jpeg',
])

/** Maximum logo file size in bytes: 2 MB (Req 8.3) */
export const MAX_LOGO_SIZE = 2 * 1024 * 1024

// ---------------------------------------------------------------------------
// Main upload function
// ---------------------------------------------------------------------------

export interface UploadLogoParams {
  surveyId: number
  file: LogoFile
  s3Client: S3ClientLike
  bucket: string
  /** Optional: override UUID generation for deterministic testing */
  generateId?: () => string
}

/**
 * Validates a logo file and uploads it to S3.
 *
 * @returns The S3 object key on success (e.g. `surveys/42/logo-abc123.png`)
 * @throws InvalidLogoTypeError if the MIME type is not PNG/SVG/JPG (422)
 * @throws LogoTooLargeError if the file exceeds 2 MB (422)
 */
export async function uploadLogo(params: UploadLogoParams): Promise<string> {
  const { surveyId, file, s3Client, bucket, generateId = randomUUID } = params

  // --- Validate MIME type (Req 8.2) ---
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new InvalidLogoTypeError()
  }

  // --- Validate size (Req 8.3) ---
  if (file.size > MAX_LOGO_SIZE) {
    throw new LogoTooLargeError()
  }

  // --- Determine file extension ---
  const ext = normalizeExtension(file.extname)

  // --- Build the S3 key (Req 8.4) ---
  const id = generateId()
  const key = `surveys/${surveyId}/logo-${id}.${ext}`

  // --- Read file content ---
  const body = await getFileBody(file)

  // --- PutObject to foundation logos bucket (Req 8.1, 8.4) ---
  await s3Client.putObject({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: file.type,
  })

  return key
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalizes file extension to a consistent short form.
 * Handles 'jpeg' → 'jpg', 'svg' stays as 'svg', 'png' stays as 'png'.
 */
function normalizeExtension(extname: string): string {
  const ext = extname.toLowerCase().replace(/^\./, '')
  if (ext === 'jpeg') return 'jpg'
  return ext
}

/**
 * Reads file content from tmpPath or buffer.
 */
async function getFileBody(file: LogoFile): Promise<Buffer> {
  if (file.buffer) {
    return file.buffer
  }

  if (file.tmpPath) {
    const { readFile } = await import('node:fs/promises')
    return readFile(file.tmpPath)
  }

  throw new Error('Logo file must provide either a buffer or tmpPath')
}
