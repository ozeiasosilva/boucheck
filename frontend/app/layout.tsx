import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BouCheck',
  description: 'Plataforma de pesquisas e diagnósticos empresariais',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
