import type { ApiError } from '@/api/generated'

export function apiErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'body' in err) {
    let body = (err as ApiError).body as any
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body)
      } catch {
        // ignore
      }
    }
    const errObj = body?.error as Record<string, unknown> | undefined
    if (errObj?.message != null) return String(errObj.message)
    if (body?.message != null) return String(body.message)
  }
  if (err instanceof Error) return err.message
  return 'Ошибка запроса'
}
