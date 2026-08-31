import { useEffect } from 'react'
import { Gift } from 'lucide-react'
import { Peony } from './Peony'
import { Modal } from './ui'
import { haptic } from '@/lib/telegram'

/*
 * Сюрприз: показывается один раз — когда в базе впервые создали ветку.
 * Показ запоминается на устройстве, чтобы окно не выскакивало снова.
 */

const SURPRISE_URL = 'https://www.youtube.com/shorts/qOcKcLlCL2E'

const SHOWN_KEY = 'lichnoe-info-surprise-1'

// eslint-disable-next-line react-refresh/only-export-components
export const surpriseAlreadyShown = () => {
  try {
    return localStorage.getItem(SHOWN_KEY) === '1'
  } catch {
    return false
  }
}

const markShown = () => {
  try {
    localStorage.setItem(SHOWN_KEY, '1')
  } catch {
    /* приватный режим — покажется ещё раз, не страшно */
  }
}

export function SurpriseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Помечаем показанным сразу при открытии: даже если закрыть приложение, второй раз не выскочит
  useEffect(() => {
    if (open) {
      markShown()
      haptic.ok()
    }
  }, [open])

  if (!open) return null

  return (
    <Modal open onClose={onClose} title="Секундочку…">
      <div className="relative overflow-hidden text-center">
        <div className="pointer-events-none absolute -right-14 -top-14 opacity-60" aria-hidden>
          <Peony size={190} />
        </div>
        <div className="pointer-events-none absolute -left-16 -bottom-16 opacity-40" aria-hidden>
          <Peony size={170} />
        </div>

        <span
          className="relative mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl
            text-[var(--accent-fg)] shadow-[0_8px_20px_-8px_rgb(var(--accent-glow)/0.6)]"
          style={{ background: 'var(--grad)' }}
        >
          <Gift size={26} />
        </span>

        <p className="relative font-display text-[19px] font-bold tracking-tight">
          Алимка, я кое-что тебе подготовил
        </p>
        <p className="relative mt-2 text-[14.5px] leading-relaxed text-[var(--fg-soft)]">
          Перейди по ссылке — это тебе.
        </p>

        <a
          href={SURPRISE_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => haptic.hit()}
          className="relative mt-5 inline-flex h-12 items-center justify-center gap-2.5 rounded-2xl
            px-6 text-[15px] font-medium text-[var(--accent-fg)]
            shadow-[0_6px_16px_-6px_rgb(var(--accent-glow)/0.55)]
            transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.98]"
          style={{ background: 'var(--grad)' }}
        >
          Открыть 🎁
        </a>

        <p className="relative mt-4 text-[12px] text-[var(--fg-faint)]">
          Это окошко больше не появится — не потеряй ссылку 🌸
        </p>
      </div>
    </Modal>
  )
}
