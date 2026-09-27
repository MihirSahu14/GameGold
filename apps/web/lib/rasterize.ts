// Unity can't import an SVG data URI — rasterize it to PNG in the browser (no server lib needed).
function svgSize(dataUri: string): { width: number; height: number } {
  const svgText = atob(dataUri.split(',')[1] ?? '')
  const dims = svgText.match(/<svg[^>]*\swidth="([\d.]+)"[^>]*\sheight="([\d.]+)"/)
  return dims ? { width: parseFloat(dims[1]), height: parseFloat(dims[2]) } : { width: 256, height: 256 }
}

export async function svgToPngBlob(dataUri: string): Promise<Blob> {
  const { width, height } = svgSize(dataUri)
  const img = new Image()
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Could not load the sprite image.'))
  })
  img.src = dataUri
  await loaded
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not supported in this browser.')
  ctx.drawImage(img, 0, 0, width, height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Could not rasterize the sprite.')
  return blob
}

export async function svgToPngDataUri(dataUri: string): Promise<string> {
  const blob = await svgToPngBlob(dataUri)
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not encode the PNG.'))
    reader.readAsDataURL(blob)
  })
}

export type BackgroundFit = 'crop' | 'pad'

/** Any browser-readable image file → PNG data URI, capped at 1920 px wide. `fit` makes it 16:9 (the Unity
 *  player stretches backgrounds to the screen): 'crop' centre-crops; 'pad' keeps the whole image and fills
 *  the sides with a blurred copy of itself (for art with a logo near the edge). No fit = as-is. */
export async function imageFileToPngDataUri(file: File, fit?: BackgroundFit): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('That file is not an image this browser can read.')
  })
  const { width: w, height: h } = bitmap
  const wide = w / h > 16 / 9
  let [cw, ch] = [w, h] // canvas size before the 1920 cap
  if (fit === 'crop') [cw, ch] = wide ? [Math.round(h * 16 / 9), h] : [w, Math.round(w * 9 / 16)]
  if (fit === 'pad') [cw, ch] = wide ? [w, Math.round(w * 9 / 16)] : [Math.round(h * 16 / 9), h]
  const scale = Math.min(1, 1920 / cw)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(cw * scale)
  canvas.height = Math.round(ch * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not supported in this browser.')
  // "cover" the canvas (crop, or the blurred pad backdrop) ...
  const cover = Math.max(canvas.width / w, canvas.height / h)
  if (fit === 'pad') ctx.filter = 'blur(24px) brightness(0.7)'
  ctx.drawImage(bitmap, (canvas.width - w * cover) / 2, (canvas.height - h * cover) / 2, w * cover, h * cover)
  if (fit === 'pad') {
    // ... then the whole image "contained" on top.
    ctx.filter = 'none'
    const contain = Math.min(canvas.width / w, canvas.height / h)
    ctx.drawImage(bitmap, (canvas.width - w * contain) / 2, (canvas.height - h * contain) / 2, w * contain, h * contain)
  }
  bitmap.close()
  return canvas.toDataURL('image/png')
}
