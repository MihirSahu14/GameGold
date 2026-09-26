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
