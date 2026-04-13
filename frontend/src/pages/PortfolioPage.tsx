import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import RefreshIcon from '@mui/icons-material/Refresh'
import {
  Alert,
  Box,
  Button,
  Chip,
  Grid,
  LinearProgress,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PortfolioAnalysisService, PortfolioService } from '@/api/generated'
import { RecommendationStatusBadge } from '@/components/recommendations/RecommendationStatusBadge'
import { ScrollableTablePaper } from '@/components/ui/ScrollableTablePaper'
import { CreateTradingRequestModal, parsePositionQuantity } from '@/components/trading'
import { FIGI_TABLE_CELL_SX, TABLE_NUMERIC_CELL_SX } from '@/theme/tableStyles'
import { apiErrorMessage } from '@/utils/apiErrorMessage'
import { parseLatestVerdictMap, type PortfolioVerdictCell } from '@/utils/portfolioPositionVerdict'

const REAL_PORTFOLIO_SCOPE = 'real'

type PortfolioPayload = {
  cash?: unknown
  totalValue?: unknown
  positionsValue?: unknown
  positionsList?: unknown[]
  cached?: boolean
  lastUpdated?: unknown
}

function formatMoney(value: unknown) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(n)
}

function formatSourceUpdated(data: PortfolioPayload | null, source: 'live' | 'db') {
  const src = source === 'live' ? 'live Tinkoff' : 'кэш БД'
  const upd = data?.lastUpdated != null ? ` · ${String(data.lastUpdated)}` : ''
  return `${src}${upd}`
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

function PortfolioPage() {
  const [data, setData] = useState<PortfolioPayload | null>(null)
  const [source, setSource] = useState<'live' | 'db'>('live')
  const [recByFigi, setRecByFigi] = useState<Map<string, Record<string, unknown>>>(new Map())
  const [portfolioVerdictByFigi, setPortfolioVerdictByFigi] = useState<
    Map<string, PortfolioVerdictCell>
  >(new Map())
  const [loading, setLoading] = useState(false)
  const [verdictLoading, setVerdictLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [snack, setSnack] = useState<{
    message: string
    severity: 'success' | 'error' | 'warning'
  } | null>(null)

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
    () => positions.map(p => String(p.figi ?? '').trim()).filter(Boolean),
    [positions]
  )

  const loadMarketRecommendations = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      setRecByFigi(new Map())
      return
    }
    try {
      const env =
        await PortfolioService.getPortfolioPositionRecommendationsApiV1PortfolioPositionRecommendationsGet(
          {
            figi: ids,
          }
        )
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
      const payload = env.data as
        | { llmSource?: string; saved?: number; message?: string }
        | undefined
      const src =
        payload?.llmSource === 'gigachat' ||
        payload?.llmSource === 'gigachat_manual_merge' ||
        payload?.llmSource === 'perplexity'
          ? 'GigaChat/LLM'
          : payload?.llmSource === 'manual_cached' || payload?.llmSource === 'manual_cached_partial'
            ? 'ручной кэш'
            : (payload?.llmSource ?? '—')
      setSnack({
        message:
          payload?.message === 'no_positions'
            ? 'Нет открытых позиций — нечего анализировать.'
            : payload?.message === 'no_llm_verdict'
              ? 'Нет валидного ответа GigaChat — записи рекомендаций по позициям не обновлялись.'
              : payload?.message === 'used_manual_merged_auto_llm_unparseable'
                ? 'Ответ GigaChat не разобран; для позиций без ручного импорта показан HOLD. Ручные вердикты учтены.'
                : payload?.message === 'used_manual_verdict_cache'
                  ? 'Все позиции покрыты свежим ручным импортом — GigaChat не вызывался.'
                  : `Рекомендации по портфелю обновлены (${src}, записей: ${payload?.saved ?? '—'}).`,
        severity:
          payload?.message === 'no_positions' ||
          payload?.message === 'no_llm_verdict' ||
          payload?.message === 'used_manual_merged_auto_llm_unparseable'
            ? 'warning'
            : 'success',
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
    <Box sx={{ p: { xs: 1.5, md: 2 }, maxWidth: 1400, mx: 'auto' }}>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 1,
          rowGap: 1,
          mb: 1,
        }}
      >
        <Typography
          variant="h5"
          sx={{
            flexGrow: 1,
            minWidth: 200,
            fontWeight: 800,
            color: 'primary.main',
            letterSpacing: '-0.02em',
          }}
        >
          Портфель (реальный счёт)
        </Typography>
        <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={() => void loadLive()}
            disabled={loading}
          >
            Обновить (Tinkoff)
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={() => void loadDbSnapshot()}
            disabled={loading}
          >
            Снимок из БД
          </Button>
          <Button variant="text" size="small" onClick={() => void triggerSync()} disabled={loading}>
            Sync в очередь
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
                Рекомендации по портфелю
              </Button>
            </span>
          </Tooltip>
        </Stack>
      </Box>

      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center', mb: 1.5 }}>
        <Chip
          size="small"
          label={formatSourceUpdated(data, source)}
          variant="outlined"
          sx={{
            borderColor: theme => alpha(theme.palette.primary.main, 0.45),
            color: 'primary.light',
            fontWeight: 600,
          }}
        />
        {data?.cached ? (
          <Chip
            size="small"
            label="Кэш API"
            color="warning"
            variant="outlined"
            sx={{ fontWeight: 600 }}
          />
        ) : null}
      </Stack>

      {error ? (
        <Alert severity="warning" sx={{ mb: 1.5, py: 0.5 }}>
          {error}
          <Box sx={{ mt: 0.75 }}>
            <Button size="small" onClick={() => void loadDbSnapshot()}>
              Загрузить снимок из БД
            </Button>
          </Box>
        </Alert>
      ) : null}

      {loading && !data ? <LinearProgress sx={{ mb: 1 }} /> : null}
      {verdictLoading ? <LinearProgress sx={{ mb: 0.75 }} /> : null}

      {data ? (
        <Paper
          sx={theme => ({
            p: 1.5,
            mb: 1.5,
            borderColor: alpha(theme.palette.primary.main, 0.28),
            boxShadow: `0 0 0 1px ${alpha(theme.palette.primary.main, 0.08)}`,
          })}
        >
          <Grid container spacing={1.5}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Box
                sx={theme => ({
                  pl: { sm: 1.5 },
                  borderLeft: { sm: `3px solid ${theme.palette.secondary.main}` },
                  py: 0.25,
                })}
              >
                <Typography variant="caption" sx={{ color: 'secondary.light', fontWeight: 600 }}>
                  Кэш
                </Typography>
                <Typography
                  variant="h6"
                  sx={{ color: 'secondary.main', fontWeight: 700, lineHeight: 1.2 }}
                >
                  {formatMoney(data.cash)}
                </Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Box
                sx={theme => ({
                  pl: { sm: 1.5 },
                  borderLeft: { sm: `3px solid ${theme.palette.primary.main}` },
                  py: 0.25,
                })}
              >
                <Typography variant="caption" sx={{ color: 'primary.light', fontWeight: 600 }}>
                  Позиции
                </Typography>
                <Typography
                  variant="h6"
                  sx={{ color: 'primary.main', fontWeight: 700, lineHeight: 1.2 }}
                >
                  {formatMoney(data.positionsValue)}
                </Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Box
                sx={theme => ({
                  pl: { sm: 1.5 },
                  borderLeft: { sm: `3px solid ${theme.palette.success.main}` },
                  py: 0.25,
                })}
              >
                <Typography variant="caption" sx={{ color: 'success.light', fontWeight: 600 }}>
                  Итого
                </Typography>
                <Typography
                  variant="h6"
                  sx={{ color: 'success.main', fontWeight: 800, lineHeight: 1.2 }}
                >
                  {formatMoney(data.totalValue)}
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </Paper>
      ) : null}

      <Paper
        sx={theme => ({
          p: 1.5,
          borderColor: alpha(theme.palette.secondary.main, 0.28),
        })}
      >
        <Typography variant="subtitle1" sx={{ mb: 0.5, color: 'secondary.main', fontWeight: 700 }}>
          Позиции и рекомендации
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mb: 1, lineHeight: 1.45 }}
        >
          <Box component="span" sx={{ color: 'secondary.main', fontWeight: 700 }}>
            Портфель
          </Box>{' '}
          — вердикт по вашей позиции (вход, PnL, ручной LLM).{' '}
          <Box component="span" sx={{ color: 'primary.main', fontWeight: 700 }}>
            Рынок
          </Box>{' '}
          — сигнал fusion по FIGI без учёта вашей средней; может отличаться от «Портфель».
        </Typography>
        <ScrollableTablePaper sx={{ overflowX: 'auto' }} maxHeight="min(62vh, 520px)">
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ color: 'secondary.main', fontWeight: 700 }}>FIGI</TableCell>
                <TableCell sx={{ color: 'primary.main', fontWeight: 700 }}>Тикер</TableCell>
                <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                  Кол-во
                </TableCell>
                <TableCell align="right" sx={{ color: 'primary.main', fontWeight: 700 }}>
                  Цена
                </TableCell>
                <TableCell sx={{ color: 'primary.main', fontWeight: 700 }}>
                  <Tooltip title="Сигнал по инструменту из таблицы recommendations (общий для всех), не персональный">
                    <span>Рынок (FIGI)</span>
                  </Tooltip>
                </TableCell>
                <TableCell sx={{ color: 'secondary.main', fontWeight: 700 }}>
                  <Tooltip title="Вердикт по вашей позиции: закупка, PnL, доля; ручной импорт LLM пишет сюда">
                    <span>Портфель (позиция)</span>
                  </Tooltip>
                </TableCell>
                <TableCell align="right" sx={{ color: 'primary.main', fontWeight: 700 }}>
                  Действия
                </TableCell>
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
                    <TableCell sx={{ ...FIGI_TABLE_CELL_SX, color: 'secondary.light' }}>
                      {figi || '—'}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                        {String(p.ticker ?? p.name ?? '—')}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={TABLE_NUMERIC_CELL_SX}>
                      {String(p.quantity ?? '—')}
                    </TableCell>
                    <TableCell align="right" sx={TABLE_NUMERIC_CELL_SX}>
                      {px != null ? formatMoney(px) : '—'}
                    </TableCell>
                    <TableCell>
                      {sig !== '—' ? (
                        <Tooltip title="Общий рыночный сигнал по FIGI; не заменяет вердикт по портфелю">
                          <RecommendationStatusBadge value={sig} />
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
                          <RecommendationStatusBadge value={pv.finalAction} />
                        </Tooltip>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          —
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {figi ? (
                        <Stack
                          direction="row"
                          spacing={0.5}
                          sx={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}
                        >
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
                          <Button
                            component={Link}
                            to={`/recommendations/${encodeURIComponent(figi)}`}
                            size="small"
                            sx={{ color: 'primary.light' }}
                            title="Карточка инструмента и рыночный fusion — не портфельный вердикт по позиции"
                          >
                            Карточка
                          </Button>
                        </Stack>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
              {positions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Typography sx={{ color: 'text.disabled' }}>
                      Нет позиций или данные не загружены.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </ScrollableTablePaper>
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

export { PortfolioPage }
export default PortfolioPage
