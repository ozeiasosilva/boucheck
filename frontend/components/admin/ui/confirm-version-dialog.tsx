'use client'

import { useEffect } from 'react'
import { Button } from './button'

interface ConfirmVersionDialogProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
}

export function ConfirmVersionDialog({ open, onConfirm, onCancel, loading = false }: ConfirmVersionDialogProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="version-dialog-title"
      aria-describedby="version-dialog-desc"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} aria-hidden="true" />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl animate-in fade-in zoom-in-95 duration-150">
        {/* Icon + Content */}
        <div className="px-6 pt-6 pb-2">
          <div className="flex items-start gap-4">
            {/* Warning icon */}
            <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-amber-50">
              <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <div className="flex-1">
              <h3 id="version-dialog-title" className="text-base font-semibold text-gray-900">
                Survey com respostas existentes
              </h3>
              <p id="version-dialog-desc" className="mt-2 text-sm text-gray-600 leading-relaxed">
                Este survey já possui respostas coletadas vinculadas à estrutura atual.
                Ao confirmar, a alteração será aplicada e uma <span className="font-medium text-gray-900">nova versão</span> será criada.
                As respostas anteriores serão preservadas na versão original.
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 mt-2 border-t border-gray-100">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={onConfirm} loading={loading}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Confirmar e versionar
          </Button>
        </div>
      </div>
    </div>
  )
}
