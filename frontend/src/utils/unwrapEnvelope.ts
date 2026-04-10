/** Достаёт полезную нагрузку из ответа `SuccessEnvelope` или возвращает объект как есть. */
export function unwrapEnvelopeData<T extends Record<string, unknown>>(body: unknown): T | null {
  if (!body || typeof body !== 'object') return null
  const o = body as Record<string, unknown>
  const inner = o.data
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    return inner as T
  }
  return o as T
}
