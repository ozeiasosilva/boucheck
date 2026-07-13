import { S3Client, GetPublicAccessBlockCommand } from '@aws-sdk/client-s3'

/**
 * Cached-for-process-lifetime Block Public Access (BPA) check utility.
 *
 * Before any `putObject` to the reports bucket, the PDF worker (and any other
 * writer) must call `assertBpaEnabled(bucket)` to confirm that S3 Block Public
 * Access is fully enabled (all four flags true). If it is not, the utility
 * throws a `BpaNotEnabledError` and logs a structured error — no object is
 * stored to a possibly-public bucket.
 *
 * The check result is cached per bucket for the entire process lifetime
 * (singleton map), avoiding repeated S3 control-plane calls on every put.
 *
 * Requirements: 18.3, 18.4
 */

/**
 * Thrown when the Object_Store bucket does not have BPA fully enabled.
 * Callers MUST NOT proceed with putObject when this is thrown.
 */
export class BpaNotEnabledError extends Error {
  constructor(bucket: string, reason: string) {
    super(`[BPA] Block Public Access is NOT fully enabled on bucket "${bucket}": ${reason}`)
    this.name = 'BpaNotEnabledError'
  }
}

export interface BpaCheckDeps {
  s3Client: S3Client
}

/**
 * Process-lifetime cache: bucket name → boolean (true = all BPA flags enabled).
 * Once resolved for a bucket, the result never changes until the process restarts.
 */
const bpaCache = new Map<string, Promise<boolean>>()

/**
 * Checks whether all four S3 Block Public Access flags are set to `true`
 * for the given bucket. The result is cached for the process lifetime.
 *
 * Returns `true` only when BlockPublicAcls, IgnorePublicAcls,
 * BlockPublicPolicy, and RestrictPublicBuckets are all `true`.
 */
export async function isBpaFullyEnabled(bucket: string, deps?: BpaCheckDeps): Promise<boolean> {
  const existing = bpaCache.get(bucket)
  if (existing !== undefined) {
    return existing
  }

  const checkPromise = performBpaCheck(bucket, deps)
  bpaCache.set(bucket, checkPromise)
  return checkPromise
}

/**
 * Asserts that the given bucket has BPA fully enabled.
 * Throws `BpaNotEnabledError` (and logs a structured error) if it does not.
 *
 * Call this BEFORE every `putObject` to the reports bucket.
 *
 * Requirements: 18.3, 18.4
 */
export async function assertBpaEnabled(bucket: string, deps?: BpaCheckDeps): Promise<void> {
  const enabled = await isBpaFullyEnabled(bucket, deps)
  if (!enabled) {
    const error = new BpaNotEnabledError(
      bucket,
      'One or more BPA flags are not set to true. Refusing to store objects.'
    )
    console.error('[BPA] Object storage refused — bucket is not fully protected', {
      bucket,
      error: error.message,
    })
    throw error
  }
}

/**
 * Performs the actual GetPublicAccessBlock call against S3.
 * Returns `true` only when all four flags are `true`.
 * Returns `false` on any error (missing config, access denied, etc.)
 * — fail-closed: if we cannot confirm BPA, we refuse writes.
 */
async function performBpaCheck(bucket: string, deps?: BpaCheckDeps): Promise<boolean> {
  const s3 = deps?.s3Client ?? defaultS3Client()

  try {
    const response = await s3.send(
      new GetPublicAccessBlockCommand({ Bucket: bucket })
    )

    const config = response.PublicAccessBlockConfiguration
    if (!config) {
      console.error('[BPA] GetPublicAccessBlock returned no configuration', { bucket })
      return false
    }

    const allEnabled =
      config.BlockPublicAcls === true &&
      config.IgnorePublicAcls === true &&
      config.BlockPublicPolicy === true &&
      config.RestrictPublicBuckets === true

    if (!allEnabled) {
      console.error('[BPA] Bucket does not have all BPA flags enabled', {
        bucket,
        BlockPublicAcls: config.BlockPublicAcls,
        IgnorePublicAcls: config.IgnorePublicAcls,
        BlockPublicPolicy: config.BlockPublicPolicy,
        RestrictPublicBuckets: config.RestrictPublicBuckets,
      })
    }

    return allEnabled
  } catch (error) {
    // Fail-closed: if the check itself fails (access denied, network error, etc.),
    // treat the bucket as NOT safe for storage.
    console.error('[BPA] Failed to verify Block Public Access configuration', {
      bucket,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return false
  }
}

/**
 * Lazily-created default S3 client using environment-sourced region.
 */
let _defaultClient: S3Client | null = null

function defaultS3Client(): S3Client {
  if (!_defaultClient) {
    _defaultClient = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1' })
  }
  return _defaultClient
}

/**
 * Clears the BPA cache. Intended for testing only.
 * @internal
 */
export function _resetBpaCache(): void {
  bpaCache.clear()
}
