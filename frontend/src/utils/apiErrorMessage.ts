import type { ApiError } from '@/api/generated'

export function apiErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'body' in err) {
    const body = (err as ApiError).body as Record<string, unknown> | undefined
    const errObj = body?.error as Record<string, unknown> | undefined
    if (errObj?.message != null) return String(errObj.message)
    if (body?.message != null) return String(body.message)
  }
  if (err instanceof Error) return err.message
  return 'Ошибка запроса'
}
