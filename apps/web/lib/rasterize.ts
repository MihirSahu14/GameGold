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

/** Any browser-readable image file → PNG data URI. Backgrounds are centre-cropped to 16:9
 *  (the Unity player stretches them to the screen); everything is capped at 1920 px wide. */
export async function imageFileToPngDataUri(file: File, cropTo16x9: boolean): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('That file is not an image this browser can read.')
  })
  let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height
  if (cropTo16x9) {
    if (sw / sh > 16 / 9) { sw = Math.round(sh * 16 / 9); sx = Math.round((bitmap.width - sw) / 2) }
    else { sh = Math.round(sw * 9 / 16); sy = Math.round((bitmap.height - sh) / 2) }
  }
  const scale = Math.min(1, 1920 / sw)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(sw * scale)
  canvas.height = Math.round(sh * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not supported in this browser.')
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/png')
}
