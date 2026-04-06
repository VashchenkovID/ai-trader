import type { CancelablePromise } from '@/api/generated/core/CancelablePromise'
import { OpenAPI } from '@/api/generated/core/OpenAPI'
import { request as __request } from '@/api/generated/core/request'

export type CleanupTradingRequestsResponse = {
  deleted: number
  mode: string | null
}

export function cleanupCompletedTradingRequests(mode: string | null): CancelablePromise<{ success: true; data: CleanupTradingRequestsResponse }> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/trading-requests/cleanup',
    query: {
      mode: mode || undefined,
    },
  }) as never
}

export type TradingRequestPreviewBody = {
  recommendationFigi?: string | null
  recommendationData?: Record<string, unknown> | null
  options?: {
    action?: string | null
    mode?: string
    quantity?: number | null
  }
}

/** Предрасчёт заявки без записи в БД. */
export function previewTradingRequest(
  body: TradingRequestPreviewBody
): CancelablePromise<{ success?: boolean; data: Record<string, unknown> }> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/trading-requests/preview',
    body,
    mediaType: 'application/json',
  }) as never
}

