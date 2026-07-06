// Shared clip-path polygon strings for the pixel-art primitives. Every shape
// uses only straight, 90°-angle steps — curves read as "smooth/modern", not
// pixel art, so border-radius is never used anywhere in this directory.

export const PIXEL_STAR_CLIP_PATH =
  'polygon(33% 0%, 66% 0%, 66% 33%, 100% 33%, 100% 66%, 66% 66%, 66% 100%, 33% 100%, 33% 66%, 0% 66%, 0% 33%, 33% 33%)'

/** An 8px square "bite" out of each corner — the standard fake for pixel-art rounded corners. */
export function notchedCornerClipPath(notch: number): string {
  return `polygon(${notch}px 0, calc(100% - ${notch}px) 0, 100% ${notch}px, 100% calc(100% - ${notch}px), calc(100% - ${notch}px) 100%, ${notch}px 100%, 0 calc(100% - ${notch}px), 0 ${notch}px)`
}
