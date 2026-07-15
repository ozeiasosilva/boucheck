import env from '#start/env'

const CDN_BASE_URL = env.get('CDN_BASE_URL', 'https://cdn.boucheck.beonup.com.br')

/**
 * Constrói a URL do logo a partir da chave S3.
 * - null/vazio → null
 * - "__default__" → "/logo_completo.png"
 * - qualquer outro → CDN_BASE_URL + "/" + logoS3Key
 */
export function buildLogoUrl(logoS3Key: string | null | undefined): string | null {
  if (!logoS3Key) return null
  if (logoS3Key === '__default__') return '/logo_completo.png'
  return `${CDN_BASE_URL}/${logoS3Key}`
}
