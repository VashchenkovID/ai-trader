import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import { Alert, Box, Button, Card, CardContent, Chip, Typography } from '@mui/material'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AutoPaperTradingService, TradingRequestsService } from '@/api/generated'
import { apiErrorMessage } from '@/utils/apiErrorMessage'

type AutoPaperStatus = {
  enabled?: boolean
  tradingMode?: string
}

export type DashboardAutoPaperCardProps = {
  onNotify: (message: string, severity: 'success' | 'error') => void
}

export function DashboardAutoPaperCard({ onNotify }: DashboardAutoPaperCardProps) {
  const [status, setStatus] = useState<AutoPaperStatus | null>(null)
  const [pendingPreview, setPendingPreview] = useState<{
    total: number
    sampleFigis: string[]
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const st = await AutoPaperTradingService.autoPaperStatusApiV1AutoPaperTradingStatusGet()
      setStatus((st.data ?? {}) as AutoPaperStatus)

      const pend =
        await TradingRequestsService.tradingRequestsPendingApiV1TradingRequestsPendingGet({
          offset: 0,
          limit: 10,
        })
      const data = pend.data as { items?: unknown[]; meta?: { total?: number } }
      const items = Array.isArray(data.items) ? data.items : []
      const figis = items
        .map((row: unknown) => String((row as Record<string, unknown>).figi ?? ''))
        .filter(Boolean)
      setPendingPreview({
        total: typeof data.meta?.total === 'number' ? data.meta.total : items.length,
        sampleFigis: figis.slice(0, 5),
      })
    } catch (err) {
      onNotify(apiErrorMessage(err), 'error')
    } finally {
      setLoading(false)
    }
  }, [onNotify])

  useEffect(() => {
    void load()
  }, [load])

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setActionLoading(true)
    try {
      await fn()
      onNotify(label, 'success')
      await load()
    } catch (err) {
      onNotify(apiErrorMessage(err), 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const mode = String(status?.tradingMode ?? '').toLowerCase()
  const canEnable = mode === 'paper'

  return (
    <Card variant="outlined">
      <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
        <Typography
          variant="subtitle2"
          sx={{ fontWeight: 600, color: 'secondary.main', letterSpacing: '0.02em', mb: 0.5 }}
        >
          Автоторговля (paper)
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25, fontSize: 13 }}>
          Auto-paper и очередь PENDING. Полный список — «Заявки».
        </Typography>

        {loading ? (
          <Typography variant="body2" color="text.secondary">
            Загрузка…
          </Typography>
        ) : (
          <>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75, mb: 1.25 }}>
              <Chip
                label={status?.enabled ? 'Включено' : 'Выключено'}
                color={status?.enabled ? 'success' : 'default'}
                size="small"
              />
              <Chip label={`Режим: ${mode || '—'}`} size="small" variant="outlined" />
            </Box>
            {!canEnable ? (
              <Alert severity="info" sx={{ mb: 1.25, py: 0.5 }}>
                Включение автоторговли доступно только при глобальном режиме <strong>paper</strong>.
              </Alert>
            ) : null}
            <Box
              sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 0.75, mb: 1.25 }}
            >
              <Button
                variant="contained"
                disabled={!canEnable || Boolean(status?.enabled) || actionLoading}
                onClick={() =>
                  void run('Автоторговля включена', () =>
                    AutoPaperTradingService.autoPaperEnableApiV1AutoPaperTradingEnablePost()
                  )
                }
              >
                Включить
              </Button>
              <Button
                variant="outlined"
                disabled={!status?.enabled || actionLoading}
                onClick={() =>
                  void run('Автоторговля выключена', () =>
                    AutoPaperTradingService.autoPaperDisableApiV1AutoPaperTradingDisablePost()
                  )
                }
              >
                Выключить
              </Button>
              <Button variant="text" onClick={() => void load()} disabled={actionLoading}>
                Обновить
              </Button>
            </Box>

            <Typography variant="caption" color="primary.main" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
              Ожидающие заявки (PENDING)
            </Typography>
            {pendingPreview ? (
              <>
                <Typography variant="body2" color="text.secondary">
                  Всего в очереди (по API): {pendingPreview.total}
                </Typography>
                {pendingPreview.sampleFigis.length > 0 ? (
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    Примеры FIGI: {pendingPreview.sampleFigis.join(', ')}
                    {pendingPreview.total > pendingPreview.sampleFigis.length ? '…' : ''}
                  </Typography>
                ) : (
                  <Typography variant="body2" sx={{ mt: 0.5 }} color="text.secondary">
                    Нет ожидающих в первой странице ответа.
                  </Typography>
                )}
              </>
            ) : null}
            <Button
              component={Link}
              to="/trading-requests"
              variant="outlined"
              size="small"
              endIcon={<OpenInNewIcon />}
              sx={{ mt: 1 }}
            >
              Все заявки
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
