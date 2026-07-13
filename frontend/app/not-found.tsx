import Link from 'next/link'

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        backgroundColor: '#F8FAFC',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          maxWidth: '28rem',
          width: '100%',
        }}
      >
        {/* Brand */}
        <div
          style={{
            marginBottom: '2rem',
          }}
        >
          <span
            style={{
              fontSize: '2rem',
              fontWeight: 700,
              color: '#1E40AF',
              letterSpacing: '-0.025em',
            }}
          >
            BouCheck
          </span>
        </div>

        {/* 404 indicator */}
        <p
          style={{
            fontSize: '4rem',
            fontWeight: 700,
            color: '#CBD5E1',
            margin: '0 0 0.5rem 0',
            lineHeight: 1,
          }}
        >
          404
        </p>

        {/* Main message */}
        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 600,
            color: '#1E293B',
            margin: '0 0 0.75rem 0',
          }}
        >
          Pesquisa não encontrada
        </h1>

        {/* Explanation */}
        <p
          style={{
            fontSize: '1rem',
            color: '#64748B',
            margin: '0 0 2rem 0',
            lineHeight: 1.5,
          }}
        >
          Esta pesquisa não está disponível ou não existe.
        </p>

        {/* Back link */}
        <Link
          href="/"
          style={{
            display: 'inline-block',
            padding: '0.75rem 1.5rem',
            backgroundColor: '#1E40AF',
            color: '#FFFFFF',
            borderRadius: '0.5rem',
            textDecoration: 'none',
            fontSize: '0.875rem',
            fontWeight: 500,
            transition: 'background-color 0.2s',
          }}
        >
          Voltar ao início
        </Link>
      </div>
    </div>
  )
}
