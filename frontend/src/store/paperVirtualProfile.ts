/** Slug виртуального профиля для `GET /portfolio/virtual` — совпадает с бэкендом. */
export const PAPER_VIRTUAL_PROFILE_SLUGS = [
  'conservative',
  'moderate',
  'aggressive',
  'experimental',
] as const

export type PaperVirtualProfileSlug = (typeof PAPER_VIRTUAL_PROFILE_SLUGS)[number]

const STORAGE_KEY = 'ai-trader.paperVirtualProfileSlug'

export function normalizePaperVirtualProfileSlug(raw: string | null | undefined): PaperVirtualProfileSlug {
  const s = String(raw ?? '')
    .toLowerCase()
    .trim()
  return (PAPER_VIRTUAL_PROFILE_SLUGS as readonly string[]).includes(s)
    ? (s as PaperVirtualProfileSlug)
    : 'moderate'
}

export function readStoredPaperVirtualProfileSlug(): PaperVirtualProfileSlug {
  if (typeof localStorage === 'undefined') return 'moderate'
  try {
    return normalizePaperVirtualProfileSlug(localStorage.getItem(STORAGE_KEY))
  } catch {
    return 'moderate'
  }
}

export function persistPaperVirtualProfileSlug(slug: PaperVirtualProfileSlug): void {
  try {
    localStorage.setItem(STORAGE_KEY, slug)
  } catch {
    /* private mode / quota */
  }
}
