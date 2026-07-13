import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div className={['bg-white rounded-xl border border-gray-200 shadow-sm', className].join(' ')}>
      {children}
    </div>
  )
}

export function CardHeader({ children, className = '' }: CardProps) {
  return (
    <div className={['px-6 py-4 border-b border-gray-100', className].join(' ')}>
      {children}
    </div>
  )
}

export function CardBody({ children, className = '' }: CardProps) {
  return (
    <div className={['px-6 py-4', className].join(' ')}>
      {children}
    </div>
  )
}

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  icon?: ReactNode
  color?: string
}

export function StatCard({ label, value, sub, icon, color = 'text-indigo-600' }: StatCardProps) {
  return (
    <Card>
      <CardBody className="flex items-start gap-4">
        {icon && (
          <div className={['p-2 rounded-lg bg-gray-50', color].join(' ')}>
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm text-gray-500 truncate">{label}</p>
          <p className={['text-2xl font-bold mt-0.5', color].join(' ')}>{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
      </CardBody>
    </Card>
  )
}
