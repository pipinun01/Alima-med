import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

type Variant = 'primary' | 'ghost' | 'soft' | 'danger' | 'outline'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-[var(--accent)] text-[var(--accent-fg)] hover:brightness-110 active:brightness-95 shadow-[var(--shadow-sm)]',
  soft: 'bg-[var(--accent-soft)] text-[var(--accent)] hover:brightness-[0.97]',
  ghost: 'text-[var(--fg-soft)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]',
  outline:
    'border border-[var(--line-strong)] text-[var(--fg)] hover:bg-[var(--bg-hover)] bg-[var(--bg-card)]',
  danger: 'bg-red-600 text-white hover:bg-red-700',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-[15px] gap-2.5 rounded-2xl',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center font-medium whitespace-nowrap
        transition-[filter,background-color,color,transform] duration-150
        active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none
        ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    />
  )
}

export function IconButton({
  label,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...props}
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl
        text-[var(--fg-soft)] transition-colors duration-150
        hover:bg-[var(--bg-hover)] hover:text-[var(--fg)] active:scale-95
        disabled:opacity-40 disabled:pointer-events-none ${className}`}
    />
  )
}

export function Field({
  label,
  hint,
  className = '',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-[13px] font-medium text-[var(--fg-soft)]">{label}</span>
      )}
      <input
        {...props}
        className={`h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--bg-card)] px-3.5
          text-[15px] text-[var(--fg)] placeholder:text-[var(--fg-faint)]
          transition-[border-color,box-shadow] duration-150
          focus:border-[var(--accent)] focus:outline-none
          focus:ring-4 focus:ring-[rgb(var(--accent-glow)/0.12)] ${className}`}
      />
      {hint && <span className="mt-1.5 block text-xs text-[var(--fg-faint)]">{hint}</span>}
    </label>
  )
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2
        border-current border-t-transparent opacity-60 ${className}`}
      role="status"
      aria-label="Загрузка"
    />
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 'max-w-lg',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  width?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.querySelector<HTMLElement>('input, textarea, button')?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-[3px] animate-fade-up"
        onClick={onClose}
      />
      <div
        ref={ref}
        className={`animate-pop-in relative w-full ${width} rounded-t-3xl sm:rounded-3xl
          border border-[var(--line)] bg-[var(--bg-card)] shadow-[var(--shadow-lg)]
          max-h-[92vh] overflow-y-auto scrollbar-slim
          pb-[max(1.25rem,env(safe-area-inset-bottom))]`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-[var(--line)] bg-[var(--bg-card)] px-5 py-4">
          <h2 className="font-display text-[17px] font-semibold tracking-tight">{title}</h2>
          <IconButton label="Закрыть" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="animate-fade-up flex flex-col items-center justify-center px-6 py-16 text-center">
      <div
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl
          bg-[var(--bg-subtle)] text-[var(--fg-faint)]"
      >
        {icon}
      </div>
      <p className="font-display text-[17px] font-semibold tracking-tight">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-[var(--fg-soft)]">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Badge({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-[var(--bg-subtle)]
        px-2 py-0.5 text-[11px] font-medium text-[var(--fg-soft)] ${className}`}
    >
      {children}
    </span>
  )
}
