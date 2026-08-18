/**
 * Стилизованный пион: несколько колец широких округлых лепестков вокруг
 * сердцевины. Рисуется вектором — не грузит страницу и красив на любом экране.
 */

/** Широкий лепесток веером: узкий у основания, округлый и пышный к краю */
const PETAL =
  'M 0 0 C -26 -10, -41 -33, -23 -53 C -13 -64, 13 -64, 23 -53 C 41 -33, 26 -10, 0 0 Z'

const RINGS = [
  { count: 9, scale: 1.0,  opacity: 0.30, offset: 0,  fill: 'var(--bloom-1)' },
  { count: 8, scale: 0.79, opacity: 0.34, offset: 22, fill: 'var(--bloom-2)' },
  { count: 7, scale: 0.58, opacity: 0.38, offset: 10, fill: 'var(--bloom-1)' },
  { count: 6, scale: 0.40, opacity: 0.42, offset: 28, fill: 'var(--bloom-2)' },
  { count: 5, scale: 0.25, opacity: 0.46, offset: 14, fill: 'var(--bloom-3)' },
]

let uid = 0

export function Peony({
  size = 320,
  className = '',
  style,
}: {
  size?: number
  className?: string
  style?: React.CSSProperties
}) {
  const gradientId = `peony-core-${(uid += 1)}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="-78 -78 156 156"
      className={className}
      style={style}
      aria-hidden
      focusable="false"
    >
      <defs>
        <radialGradient id={gradientId}>
          <stop offset="0%" stopColor="var(--bloom-3)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--bloom-2)" stopOpacity="0.35" />
        </radialGradient>
      </defs>

      {/* Листья позади цветка */}
      <g opacity="0.4">
        {[205, 250, 300].map((angle) => (
          <path
            key={angle}
            d={PETAL}
            fill="var(--bloom-leaf)"
            opacity="0.5"
            transform={`rotate(${angle}) scale(1.18 1.28)`}
          />
        ))}
      </g>

      {/* Мягкая подложка, чтобы бутон читался цельным пятном, а не звездой */}
      <circle r="48" fill="var(--bloom-1)" opacity="0.06" />

      {RINGS.map((ring, ri) =>
        Array.from({ length: ring.count }).map((_, i) => {
          const angle = ring.offset + (360 / ring.count) * i
          return (
            <path
              key={`${ri}-${i}`}
              d={PETAL}
              fill={ring.fill}
              opacity={ring.opacity}
              stroke={ring.fill}
              strokeOpacity="0.55"
              strokeWidth={0.9 / ring.scale}
              strokeLinejoin="round"
              transform={`rotate(${angle}) scale(${ring.scale})`}
            />
          )
        }),
      )}

      {/* Сердцевина */}
      <circle r="11" fill={`url(#${gradientId})`} />
      <circle r="4" fill="var(--bloom-3)" opacity="0.85" />
    </svg>
  )
}
