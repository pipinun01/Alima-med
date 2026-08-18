import { useEffect } from 'react'
import { X } from 'lucide-react'

export function Lightbox({ src, onClose }: { src: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!src) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [src, onClose])

  if (!src) return null

  return (
    <div
      className="animate-fade-up fixed inset-0 z-70 flex items-center justify-center bg-black/88 p-4"
      onClick={onClose}
      role="dialog"
      aria-label="Просмотр изображения"
    >
      <button
        onClick={onClose}
        aria-label="Закрыть"
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2.5 text-white
          backdrop-blur transition-colors hover:bg-white/20"
        style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <X size={20} />
      </button>
      <img
        src={src}
        alt=""
        className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}
