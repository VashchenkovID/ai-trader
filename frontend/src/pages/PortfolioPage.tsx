import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import RefreshIcon from '@mui/icons-material/Refresh'
import {
  Alert,
  Box,
  Button,
  Chip,
  LinearProgress,
  Paper,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PortfolioAnalysisService, PortfolioService } from '@/api/generated'
import { CreateTradingRequestModal, parsePositionQuantity } from '@/components/trading'
import { apiErrorMessage } from '@/utils/apiErrorMessage'
import { parseLatestVerdictMap, type PortfolioVerdictCell } from '@/utils/portfolioPositionVerdict'

const REAL_PORTFOLIO_SCOPE = 'real'

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
  const [portfolioVerdictByFigi, setPortfolioVerdictByFigi] = useState<Map<string, PortfolioVerdictCell>>(
    new Map(),
  )
  const [loading, setLoading] = useState(false)
  const [verdictLoading, setVerdictLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [snack, setSnack] = useState<{ message: string; severity: 'success' | 'error' | 'warning' } | null>(null)

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

  const loadMarketRecommendations = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      setRecByFigi(new Map())
      return
    }
    try {
      const env =
        await PortfolioService.getPortfolioPositionRecommendationsApiV1PortfolioPositionRecommendationsGet({
          figi: ids,
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
      setRecByFigi(m)
    } catch {
      setRecByFigi(new Map())
    }
  }, [])

  const loadPortfolioVerdicts = useCallback(async () => {
    try {
      const env = await PortfolioAnalysisService.getLatestApiV1PortfolioAnalysisLatestGet({
        portfolioScope: REAL_PORTFOLIO_SCOPE,
        limit: 100,
      })
      setPortfolioVerdictByFigi(parseLatestVerdictMap(env.data))
    } catch {
      setPortfolioVerdictByFigi(new Map())
    }
  }, [])

  useEffect(() => {
    if (figis.length === 0) {
      setRecByFigi(new Map())
      setPortfolioVerdictByFigi(new Map())
      return
    }
    let cancelled = false
    const run = async () => {
      await loadMarketRecommendations(figis)
      if (!cancelled) await loadPortfolioVerdicts()
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [figis.join('|'), loadMarketRecommendations, loadPortfolioVerdicts])

  const runPortfolioVerdictRefresh = useCallback(async () => {
    setVerdictLoading(true)
    try {
      const env = await PortfolioAnalysisService.postVerdictApiV1PortfolioAnalysisVerdictPost({
        requestBody: { portfolio_scope: REAL_PORTFOLIO_SCOPE },
      })
      await loadPortfolioVerdicts()
      await loadMarketRecommendations(figis)
      const payload = env.data as { llmSource?: string; saved?: number; message?: string } | undefined
      const src =
        payload?.llmSource === 'perplexity'
          ? 'LLM'
          : payload?.llmSource === 'market_fallback'
            ? 'рыночный fallback'
            : (payload?.llmSource ?? '—')
      setSnack({
        message:
          payload?.message === 'no_positions'
            ? 'Нет открытых позиций — нечего анализировать.'
            : `Рекомендации по портфелю обновлены (${src}, записей: ${payload?.saved ?? '—'}).`,
        severity: payload?.message === 'no_positions' ? 'warning' : 'success',
      })
    } catch (e) {
      setSnack({ message: apiErrorMessage(e), severity: 'error' })
    } finally {
      setVerdictLoading(false)
    }
  }, [figis, loadMarketRecommendations, loadPortfolioVerdicts])

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
        <Tooltip title="Пересчёт BUY/SELL/HOLD с учётом цены закупки и рыночного сигнала (LLM при наличии ключа)">
          <span>
            <Button
              variant="contained"
              size="small"
              color="secondary"
              startIcon={<AutoAwesomeIcon />}
              onClick={() => void runPortfolioVerdictRefresh()}
              disabled={loading || verdictLoading}
            >
              Обновить рекомендации по портфелю
            </Button>
          </span>
        </Tooltip>
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
      {verdictLoading ? <LinearProgress sx={{ mb: 1 }} /> : null}

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
        <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
          <strong>Портфель</strong> — вердикт по <em>вашей</em> позиции (цена входа, PnL, ручной LLM-импорт на странице
          «Ручной импорт LLM»). Им ориентируйтесь для решений по этому счёту.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          <strong>Рынок</strong> — последняя строка из общей таблицы рекомендаций по FIGI (fusion/рынок), без учёта вашей
          средней и доли в портфеле. Может расходиться с колонкой «Портфель» — это ожидаемо, не путайте источники.
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>FIGI</TableCell>
                <TableCell>Тикер</TableCell>
                <TableCell align="right">Кол-во</TableCell>
                <TableCell align="right">Цена</TableCell>
                <TableCell>
                  <Tooltip title="Сигнал по инструменту из таблицы recommendations (общий для всех), не персональный">
                    <span>Рынок (FIGI)</span>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <Tooltip title="Вердикт по вашей позиции: закупка, PnL, доля; ручной импорт LLM пишет сюда">
                    <span>Портфель (позиция)</span>
                  </Tooltip>
                </TableCell>
                <TableCell align="right">Заявка</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {positions.map(p => {
                const figi = String(p.figi ?? '')
                const rec = recByFigi.get(figi)
                const sig = rec?.recommendation != null ? String(rec.recommendation) : '—'
                const pv = portfolioVerdictByFigi.get(figi)
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
                        <Tooltip title="Общий рыночный сигнал по FIGI; не заменяет вердикт по портфелю">
                          <Chip size="small" label={sig} variant="outlined" color="default" />
                        </Tooltip>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          —
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {pv ? (
                        <Tooltip
                          title={`Уверенность портфельного вердикта: ${(pv.finalConfidence * 100).toFixed(0)}%. Для сделок по этой позиции ориентируйтесь на этот столбец.`}
                        >
                          <Chip size="small" label={pv.finalAction} color="secondary" variant="filled" />
                        </Tooltip>
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
                        <Button
                          component={Link}
                          to={`/recommendations/${encodeURIComponent(figi)}`}
                          size="small"
                          title="Карточка инструмента и рыночный fusion — не портфельный вердикт по позиции"
                        >
                          Рынок · карточка
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                )
              })}
              {positions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    <Typography color="text.secondary">Нет позиций или данные не загружены.</Typography>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Snackbar
        open={snack != null}
        autoHideDuration={8000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnack(null)}
          severity={snack?.severity ?? 'success'}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snack?.message}
        </Alert>
      </Snackbar>

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
