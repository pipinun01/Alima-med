/**
 * Фото с телефона весит 5–10 МБ. Такое и отправляется с мобильной сети долго
 * (и часто обрывается), и потом тормозит у каждого читателя. Поэтому перед
 * загрузкой картинку уменьшаем прямо в браузере: длинная сторона до 2048 px —
 * текст на фото страницы учебника остаётся читаемым, а вес падает в 10–20 раз.
 */

const MAX_SIDE = 2048
const JPEG_QUALITY = 0.85
/** Файлы меньше этого и так небольшие — не перекодируем, если размеры в норме */
const SMALL_ENOUGH = 400 * 1024
/** Эти форматы умеем перерисовать; gif и svg оставляем как есть */
const RASTER = /^image\/(jpeg|png|webp|heic|heif|avif|bmp|tiff)$/i

export interface PreparedImage {
  blob: Blob
  /** Размеры, чтобы страница не прыгала, пока фото грузится */
  width: number | null
  height: number | null
  ext: string
}

function extOf(file: File) {
  const fromName = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : ''
  if (fromName && fromName.length <= 5) return fromName === 'jpeg' ? 'jpg' : fromName
  const fromType = file.type.split('/')[1]
  return fromType === 'jpeg' ? 'jpg' : fromType || 'png'
}

const asIs = (file: File, width: number | null = null, height: number | null = null): PreparedImage => ({
  blob: file,
  width,
  height,
  ext: extOf(file),
})

/** Браузер сам учитывает EXIF-поворот, когда рисует <img> на canvas */
function decode(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('decode'))
    }
    img.src = url
  })
}

/** Есть ли у PNG прозрачные места — смотрим по уменьшенной копии, это дёшево */
function hasTransparency(img: HTMLImageElement): boolean {
  const probe = document.createElement('canvas')
  probe.width = 48
  probe.height = 48
  const ctx = probe.getContext('2d', { willReadFrequently: true })
  if (!ctx) return false
  ctx.drawImage(img, 0, 0, 48, 48)
  const { data } = ctx.getImageData(0, 0, 48, 48)
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true
  return false
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

export async function shrinkImage(file: File): Promise<PreparedImage> {
  if (!RASTER.test(file.type)) return asIs(file)

  let img: HTMLImageElement
  try {
    img = await decode(file)
  } catch {
    // не смогли прочитать (например, HEIC не в Safari) — отправляем как есть
    return asIs(file)
  }

  const { naturalWidth: width, naturalHeight: height } = img
  if (!width || !height) return asIs(file)

  const scale = Math.min(1, MAX_SIDE / Math.max(width, height))
  if (scale === 1 && file.size <= SMALL_ENOUGH) return asIs(file, width, height)

  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return asIs(file, width, height)
  ctx.drawImage(img, 0, 0, w, h)

  const keepPng = file.type === 'image/png' && hasTransparency(img)
  const type = keepPng ? 'image/png' : 'image/jpeg'
  const blob = await toBlob(canvas, type, keepPng ? undefined : JPEG_QUALITY)

  // Не стало меньше — значит, оригинал и так хорош
  if (!blob || blob.size >= file.size) return asIs(file, width, height)
  return { blob, width: w, height: h, ext: keepPng ? 'png' : 'jpg' }
}
