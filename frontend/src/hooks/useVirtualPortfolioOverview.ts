import { useCallback, useEffect, useState } from 'react'
import { PortfolioService } from '@/api/generated'
import { apiErrorMessage } from '@/utils/apiErrorMessage'

export type VirtualProfileSummaryRow = Record<string, unknown>

/**
 * Сводка профилей и конфиг порогов — общий источник для `/virtual-portfolios` и при необходимости других экранов.
 */
export function useVirtualPortfolioOverview() {
  const [summaryRows, setSummaryRows] = useState<VirtualProfileSummaryRow[]>([])
  const [configItems, setConfigItems] = useState<Record<string, Record<string, unknown>> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [profilesEnv, configEnv] = await Promise.all([
        PortfolioService.getVirtualPortfolioProfilesApiV1PortfolioVirtualProfilesGet(),
        PortfolioService.getVirtualProfilesConfigApiV1PortfolioVirtualProfilesConfigGet().catch(() => null),
      ])
      const pdata = profilesEnv.data as { items?: unknown[] }
      const items = Array.isArray(pdata.items) ? pdata.items : []
      setSummaryRows(
        items.filter((x): x is VirtualProfileSummaryRow => x != null && typeof x === 'object'),
      )
      if (configEnv) {
        const cdata = configEnv.data as { items?: Record<string, Record<string, unknown>> }
        setConfigItems(cdata.items && typeof cdata.items === 'object' ? cdata.items : null)
      } else {
        setConfigItems(null)
      }
    } catch (e) {
      setError(apiErrorMessage(e))
      setSummaryRows([])
      setConfigItems(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { summaryRows, configItems, loading, error, refetch }
}
