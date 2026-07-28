import type { Metadata } from 'next'
import { Sora, Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
  variable: '--font-body',
})

const sora = Sora({
  subsets: ['latin'],
  weight: ['600', '700'],
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
  variable: '--font-heading',
})

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
    <html lang="pt-BR" className={`${inter.variable} ${sora.variable}`}>
      <body className={inter.className}>{children}</body>
    </html>
  )
}
