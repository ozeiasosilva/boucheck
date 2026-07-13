import { ResponseProviderWrapper } from './response-provider-wrapper'

/**
 * Layout for the [slug] route group.
 *
 * Wraps all pages (identification, questions, checklist, completion) with
 * a ResponseProvider that makes the Response_Token available via React context.
 *
 * The SSR landing page (page.tsx) doesn't consume the context since it runs
 * server-side, but it renders correctly since the provider is a client component
 * that just passes through children during SSR.
 */
export default async function SlugLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  return <ResponseProviderWrapper slug={slug}>{children}</ResponseProviderWrapper>
}
