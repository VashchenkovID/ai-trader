import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Paper,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AutoPaperTradingService, TradingRequestsService } from '@/api/generated'
import { apiErrorMessage } from '@/utils/apiErrorMessage'

type AutoPaperStatus = {
  enabled?: boolean
  tradingMode?: string
}

export function VirtualTradingPage() {
  const [status, setStatus] = useState<AutoPaperStatus | null>(null)
  const [pendingPreview, setPendingPreview] = useState<{
    total: number
    sampleFigis: string[]
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [snack, setSnack] = useState<{ message: string; severity: 'success' | 'error' } | null>(
    null
  )

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
      setSnack({ message: apiErrorMessage(err), severity: 'error' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setActionLoading(true)
    try {
      await fn()
      setSnack({ message: label, severity: 'success' })
      await load()
    } catch (err) {
      setSnack({ message: apiErrorMessage(err), severity: 'error' })
    } finally {
      setActionLoading(false)
    }
  }

  const mode = String(status?.tradingMode ?? '').toLowerCase()
  const canEnable = mode === 'paper'

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" gutterBottom>
          Автоторговля (paper)
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Статус auto-paper и очередь ожидающих заявок. Полный список — в разделе «Заявки».
        </Typography>
      </Box>

      {loading ? (
        <Typography color="text.secondary">Загрузка…</Typography>
      ) : (
        <>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>
                Auto-paper
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 2 }}>
                <Chip
                  label={status?.enabled ? 'Включено' : 'Выключено'}
                  color={status?.enabled ? 'success' : 'default'}
                  size="small"
                />
                <Chip label={`Режим: ${mode || '—'}`} size="small" variant="outlined" />
              </Box>
              {!canEnable ? (
                <Alert severity="info" sx={{ mb: 2 }}>
                  Включение автоторговли доступно только при глобальном режиме{' '}
                  <strong>paper</strong>.
                </Alert>
              ) : null}
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1 }}>
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
            </CardContent>
          </Card>

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Ожидающие заявки (PENDING)
            </Typography>
            {pendingPreview ? (
              <>
                <Typography variant="body2" color="text.secondary">
                  Всего в очереди (по API): {pendingPreview.total}
                </Typography>
                {pendingPreview.sampleFigis.length > 0 ? (
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    Примеры FIGI: {pendingPreview.sampleFigis.join(', ')}
                    {pendingPreview.total > pendingPreview.sampleFigis.length ? '…' : ''}
                  </Typography>
                ) : (
                  <Typography variant="body2" sx={{ mt: 1 }} color="text.secondary">
                    Нет ожидающих в первой странице ответа.
                  </Typography>
                )}
              </>
            ) : null}
            <Button
              component={Link}
              to="/trading-requests"
              variant="outlined"
              endIcon={<OpenInNewIcon />}
              sx={{ mt: 2 }}
            >
              Все заявки
            </Button>
          </Paper>
        </>
      )}

      <Snackbar
        open={Boolean(snack)}
        autoHideDuration={5000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {snack ? (
          <Alert severity={snack.severity} onClose={() => setSnack(null)} sx={{ width: '100%' }}>
            {snack.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Stack>
  )
}
