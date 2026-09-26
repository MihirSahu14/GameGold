import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Save a URL (object URL or data URI) as a file. Firefox needs the anchor in the DOM. */
export function downloadHref(href: string, filename: string): void {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** Save a Blob as a file. Revoke later so the browser has started reading it. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  downloadHref(url, filename)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
