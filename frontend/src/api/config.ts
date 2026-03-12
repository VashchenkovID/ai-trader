const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')

const normalizeBasePath = (value: string) => {
  if (!value) return ''
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`
  return trimTrailingSlash(withLeadingSlash)
}

export const resolveApiBaseUrl = () => {
  const envBase = import.meta.env.VITE_API_BASE_URL?.trim()
  if (envBase) {
    return trimTrailingSlash(envBase)
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const nginxApiPath = normalizeBasePath(import.meta.env.VITE_API_BASE_PATH?.trim() || '')
  return `${origin}${nginxApiPath}`
}
