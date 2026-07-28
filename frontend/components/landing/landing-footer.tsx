import Link from 'next/link'
import Image from 'next/image'

export function LandingFooter() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-[var(--color-navy)] text-white/80 py-12 px-4">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
        {/* Logo + descrição */}
        <div className="flex flex-col gap-3">
          <Image
            src="/logo_completo.png"
            alt="BouCheck"
            width={130}
            height={40}
            className="h-8 w-auto object-contain brightness-0 invert"
          />
          <p className="text-xs text-white/50 max-w-xs">
            Plataforma de diagnóstico de maturidade de TI da BeOnUp.
          </p>
        </div>

        {/* Links */}
        <nav aria-label="Links do rodapé" className="flex flex-col sm:flex-row gap-4 sm:gap-8 text-sm">
          <Link
            href="https://www.beonup.com.br/aviso-de-privacidade"
            className="text-[#B9CDF5] hover:text-white transition-colors"
          >
            Política de Privacidade
          </Link>
          <Link
            href="/termos-de-uso"
            className="text-[#B9CDF5] hover:text-white transition-colors"
          >
            Termos de Uso
          </Link>
          <a
            href="https://beonup.com.br"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#B9CDF5] hover:text-white transition-colors"
          >
            beonup.com.br
          </a>
        </nav>
      </div>

      {/* Copyright */}
      <div className="max-w-6xl mx-auto mt-8 pt-6 border-t border-white/10">
        <p className="text-xs text-white/50 text-center md:text-left">
          &copy; {currentYear} BouCheck · BeOnUp Consultoria.
        </p>
      </div>
    </footer>
  )
}
