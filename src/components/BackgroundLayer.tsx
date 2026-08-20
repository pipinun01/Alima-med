import { Peony } from './Peony'
import type { BackgroundSetting } from '@/lib/settings'

/** Раскладка пионов: позиция, размер, поворот, глубина размытия */
const BLOOMS = [
  { top: '-8%',  left: '-9%',  size: 460, rotate: -12, blur: 0, depth: 1 },
  { top: '16%',  left: '79%',  size: 340, rotate: 24,  blur: 1, depth: 0.78 },
  { top: '61%',  left: '-7%',  size: 290, rotate: 40,  blur: 1, depth: 0.66 },
  { top: '76%',  left: '69%',  size: 400, rotate: -28, blur: 1, depth: 0.82 },
  { top: '41%',  left: '39%',  size: 210, rotate: 8,   blur: 3, depth: 0.42 },
]

/** Узор лепестков — маска: цвет задаёт тема через --bloom-2, сам SVG чёрно-белый */
const PETAL_TILE = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
     <g fill="#000">
       <path d="M30 18c7 6 8 18 0 26-8-8-7-20 0-26z"/>
       <path d="M92 54c8 5 10 17 3 26-9-7-9-19-3-26z"/>
       <path d="M54 92c8 4 11 16 5 25-9-6-10-18-5-25z"/>
     </g>
   </svg>`,
)
const PETAL_MASK = `url("data:image/svg+xml,${PETAL_TILE}")`

export function BackgroundLayer({ setting }: { setting: BackgroundSetting }) {
  if (setting.kind === 'none') return null

  const intensity = Math.min(Math.max(setting.intensity ?? 0.5, 0), 1)

  if (setting.kind === 'photo' && setting.url) {
    return (
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <div
          className="absolute inset-0 bg-cover bg-center bg-fixed"
          style={{
            backgroundImage: `url(${setting.url})`,
            filter: setting.blur ? `blur(${setting.blur}px)` : undefined,
            transform: setting.blur ? 'scale(1.06)' : undefined,
          }}
        />
        {/* Вуаль цвета темы: чем ниже интенсивность, тем спокойнее фон */}
        <div
          className="absolute inset-0 transition-colors duration-500"
          style={{ background: `color-mix(in srgb, var(--bg) ${Math.round(100 - intensity * 72)}%, transparent)` }}
        />
      </div>
    )
  }

  if (setting.preset === 'petals') {
    return (
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: 'var(--bloom-2)',
            maskImage: PETAL_MASK,
            WebkitMaskImage: PETAL_MASK,
            maskSize: '160px 160px',
            WebkitMaskSize: '160px 160px',
            opacity: intensity * 0.35,
          }}
        />
        <div className="absolute inset-0" style={{ background: 'var(--halo)' }} />
      </div>
    )
  }

  if (setting.preset === 'bloom') {
    return (
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <div
          className="absolute inset-0 transition-opacity duration-500"
          style={{
            opacity: intensity,
            background: `
              radial-gradient(38rem 30rem at 12% 8%,  color-mix(in srgb, var(--bloom-1) 45%, transparent), transparent 65%),
              radial-gradient(34rem 28rem at 88% 22%, color-mix(in srgb, var(--bloom-3) 40%, transparent), transparent 65%),
              radial-gradient(30rem 26rem at 70% 88%, color-mix(in srgb, var(--bloom-2) 38%, transparent), transparent 65%)
            `,
          }}
        />
      </div>
    )
  }

  // По умолчанию — пионы
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 transition-opacity duration-500" style={{ opacity: intensity }}>
        {BLOOMS.map((bloom, i) => (
          <div
            key={i}
            className="absolute"
            style={{
              top: bloom.top,
              left: bloom.left,
              transform: `rotate(${bloom.rotate}deg)`,
              filter: `blur(${bloom.blur + (setting.blur ?? 0) * 0.6}px)`,
              opacity: bloom.depth * 0.55,
            }}
          >
            <Peony size={bloom.size} />
          </div>
        ))}
      </div>
      {/* Смягчаем к центру, чтобы текст оставался читаемым */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(70% 55% at 50% 45%, color-mix(in srgb, var(--bg) 88%, transparent), color-mix(in srgb, var(--bg) 55%, transparent) 70%, transparent)',
        }}
      />
    </div>
  )
}
