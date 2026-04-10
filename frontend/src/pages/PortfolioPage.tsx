import RefreshIcon from '@mui/icons-material/Refresh'
import {
  Alert,
  Box,
  Button,
  Chip,
  LinearProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PortfolioService } from '@/api/generated'
import { CreateTradingRequestModal, parsePositionQuantity } from '@/components/trading'
import { apiErrorMessage } from '@/utils/apiErrorMessage'

function formatMoney(value: unknown) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(n)
}

function priceFromPosition(p: Record<string, unknown>): number | null {
  const lp = p.instrumentLastPrice
  if (typeof lp === 'number' && Number.isFinite(lp)) return lp
  const cur = p.currentPrice
  if (cur && typeof cur === 'object') {
    const v = (cur as Record<string, unknown>).value
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return null
}

type PortfolioPayload = {
  cash?: unknown
  totalValue?: unknown
  positionsValue?: unknown
  positionsList?: unknown[]
  cached?: boolean
  lastUpdated?: unknown
}

export function PortfolioPage() {
  const [data, setData] = useState<PortfolioPayload | null>(null)
  const [source, setSource] = useState<'live' | 'db'>('live')
  const [recByFigi, setRecByFigi] = useState<Map<string, Record<string, unknown>>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [sellOpen, setSellOpen] = useState(false)
  const [sellData, setSellData] = useState<Record<string, unknown> | null>(null)
  const [sellInitialQty, setSellInitialQty] = useState('')

  const loadLive = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const env = await PortfolioService.getPortfolioApiV1PortfolioGet1()
      setData(env.data as PortfolioPayload)
      setSource('live')
    } catch (e) {
      setError(apiErrorMessage(e))
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDbSnapshot = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const env = await PortfolioService.getRealPortfolioDbSnapshotApiV1PortfolioRealDbGet()
      setData(env.data as PortfolioPayload)
      setSource('db')
    } catch (e) {
      setError(apiErrorMessage(e))
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadLive()
  }, [loadLive])

  const positions = useMemo(() => {
    const list = data?.positionsList
    if (!Array.isArray(list)) return []
    return list.filter((x): x is Record<string, unknown> => x != null && typeof x === 'object')
  }, [data])

  const figis = useMemo(
    () =>
      positions
        .map(p => String(p.figi ?? '').trim())
        .filter(Boolean),
    [positions],
  )

  useEffect(() => {
    if (figis.length === 0) {
      setRecByFigi(new Map())
      return
    }
    let cancelled = false
    const run = async () => {
      try {
        const env = await PortfolioService.getPortfolioPositionRecommendationsApiV1PortfolioPositionRecommendationsGet({
          figi: figis,
        })
        const body = env.data as { items?: unknown[] }
        const items = Array.isArray(body.items) ? body.items : []
        const m = new Map<string, Record<string, unknown>>()
        for (const it of items) {
          if (!it || typeof it !== 'object') continue
          const o = it as Record<string, unknown>
          const f = String(o.figi ?? '')
          if (f) m.set(f, o)
        }
        if (!cancelled) setRecByFigi(m)
      } catch {
        if (!cancelled) setRecByFigi(new Map())
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [figis.join('|')])

  const triggerSync = useCallback(async () => {
    try {
      await PortfolioService.portfolioSyncTriggerApiV1PortfolioSyncPost()
    } catch {
      /* optional */
    }
    void loadLive()
  }, [loadLive])

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 2 }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>
          Портфель (реальный счёт)
        </Typography>
        <Button
          variant="outlined"
          size="small"
          startIcon={<RefreshIcon />}
          onClick={() => void loadLive()}
          disabled={loading}
        >
          Обновить (Tinkoff)
        </Button>
        <Button variant="outlined" size="small" onClick={() => void loadDbSnapshot()} disabled={loading}>
          Снимок из БД
        </Button>
        <Button variant="text" size="small" onClick={() => void triggerSync()} disabled={loading}>
          Поставить sync в очередь
        </Button>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Источник: {source === 'live' ? 'live Tinkoff' : 'кэш БД'}
        {data?.lastUpdated != null ? ` · обновлено: ${String(data.lastUpdated)}` : ''}
      </Typography>

      {error ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {error}
          <Box sx={{ mt: 1 }}>
            <Button size="small" onClick={() => void loadDbSnapshot()}>
              Загрузить снимок из БД
            </Button>
          </Box>
        </Alert>
      ) : null}

      {loading && !data ? <LinearProgress sx={{ mb: 2 }} /> : null}

      {data ? (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Кэш
              </Typography>
              <Typography variant="h6">{formatMoney(data.cash)}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Позиции
              </Typography>
              <Typography variant="h6">{formatMoney(data.positionsValue)}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Итого
              </Typography>
              <Typography variant="h6">{formatMoney(data.totalValue)}</Typography>
            </Box>
          </Box>
        </Paper>
      ) : null}

      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Позиции и рекомендации
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>FIGI</TableCell>
                <TableCell>Тикер</TableCell>
                <TableCell align="right">Кол-во</TableCell>
                <TableCell align="right">Цена</TableCell>
                <TableCell>Рекомендация</TableCell>
                <TableCell align="right">Заявка</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {positions.map(p => {
                const figi = String(p.figi ?? '')
                const rec = recByFigi.get(figi)
                const sig = rec?.recommendation != null ? String(rec.recommendation) : '—'
                const px = priceFromPosition(p)
                const qtyHeld = parsePositionQuantity(p)
                return (
                  <TableRow key={figi || JSON.stringify(p)}>
                    <TableCell>{figi || '—'}</TableCell>
                    <TableCell>{String(p.ticker ?? p.name ?? '—')}</TableCell>
                    <TableCell align="right">{String(p.quantity ?? '—')}</TableCell>
                    <TableCell align="right">{px != null ? formatMoney(px) : '—'}</TableCell>
                    <TableCell>
                      {sig !== '—' ? (
                        <Chip size="small" label={sig} variant="outlined" />
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          —
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {figi ? (
                        <Button
                          size="small"
                          color="secondary"
                          variant="outlined"
                          disabled={qtyHeld < 1}
                          title={qtyHeld < 1 ? 'Нет количества для продажи' : undefined}
                          onClick={() => {
                            setSellData({
                              figi,
                              recommendation: 'SELL',
                              price: px != null && px > 0 ? px : 1,
                              ticker: p.ticker,
                              name: p.name,
                            })
                            setSellInitialQty(qtyHeld >= 1 ? String(qtyHeld) : '')
                            setSellOpen(true)
                          }}
                        >
                          Продать
                        </Button>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      {figi ? (
                        <Button component={Link} to={`/recommendations/${encodeURIComponent(figi)}`} size="small">
                          Карточка
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                )
              })}
              {positions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Typography color="text.secondary">Нет позиций или данные не загружены.</Typography>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <CreateTradingRequestModal
        open={sellOpen}
        onClose={() => {
          setSellOpen(false)
          setSellData(null)
          setSellInitialQty('')
        }}
        recommendationData={sellData}
        initialAction="SELL"
        lockActionToSell
        initialMode="real"
        initialQuantity={sellInitialQty}
        onSuccess={() => void loadLive()}
      />
    </Box>
  )
}
