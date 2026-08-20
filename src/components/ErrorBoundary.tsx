import { Component, type ReactNode } from 'react'

/**
 * Ловит ошибку отрисовки и показывает её на месте, а не белый экран на всё
 * приложение. Один испорченный блок не должен прятать остальные.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; title?: string; className?: string },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div
        role="alert"
        className={`rounded-[var(--radius-card)] border border-dashed border-[var(--line-strong)]
          px-4 py-4 text-[13.5px] leading-relaxed text-[var(--fg-soft)] ${this.props.className ?? ''}`}
      >
        <p className="font-medium text-[var(--fg)]">{this.props.title ?? 'Не получилось показать эту часть'}</p>
        <p className="mt-1 break-words text-[12px] text-[var(--fg-faint)]">{error.message}</p>
        <button
          type="button"
          className="mt-2 text-[13px] text-[var(--accent)] hover:underline"
          onClick={() => window.location.reload()}
        >
          Перезагрузить страницу
        </button>
      </div>
    )
  }
}
