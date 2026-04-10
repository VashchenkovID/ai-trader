import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import RefreshIcon from '@mui/icons-material/Refresh'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PortfolioService } from '@/api/generated'
import { ChartContainer } from '@/components/charts/ChartContainer'
import { CreateTradingRequestModal, parsePositionQuantity } from '@/components/trading'
import { CollapsibleRawJson, LabeledValuesTable } from '@/components/ops'
import { NavLineChart, type NavPoint } from '@/components/virtual/NavLineChart'
import { useVirtualPortfolioOverview } from '@/hooks/useVirtualPortfolioOverview'
import { apiErrorMessage } from '@/utils/apiErrorMessage'
import { virtualProfileConfigToRows } from '@/utils/virtualProfileConfigDisplay'

const PROFILE_SLUGS = ['conservative', 'moderate', 'aggressive', 'experimental'] as const

function formatMoney(value: unknown) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(n)
}

function formatSignedRub(value: unknown) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
  }).format(n)
}

function formatPercent(value: unknown) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return '—'
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2, signDisplay: 'exceptZero' }).format(n)}%`
}

function numOrNull(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function pnlColor(v: number | null): 'success.main' | 'error.main' | 'text.secondary' {
  if (v == null || !Number.isFinite(v)) return 'text.secondary'
  if (v > 0) return 'success.main'
  if (v < 0) return 'error.main'
  return 'text.secondary'
}

export function VirtualPortfoliosPage() {
  const {
    summaryRows,
    configItems,
    loading: overviewLoading,
    error: overviewError,
    refetch: refetchOverview,
  } = useVirtualPortfolioOverview()
  const [profile, setProfile] = useState<string>('moderate')
  const [limitDays, setLimitDays] = useState(120)
  const [navPoints, setNavPoints] = useState<NavPoint[]>([])
  const [navLoading, setNavLoading] = useState(false)
  const [navError, setNavError] = useState<string | null>(null)

  const [sellOpen, setSellOpen] = useState(false)
  const [sellData, setSellData] = useState<Record<string, unknown> | null>(null)
  const [sellInitialQty, setSellInitialQty] = useState('')
  const [sellProfileSlug, setSellProfileSlug] = useState('moderate')

  const loadNav = useCallback(async () => {
    setNavLoading(true)
    setNavError(null)
    try {
      const env = await PortfolioService.getVirtualNavHistoryApiV1PortfolioVirtualNavHistoryGet({
        profile,
        limitDays,
      })
      const data = env.data as { points?: unknown[] }
      const raw = Array.isArray(data.points) ? data.points : []
      const pts: NavPoint[] = raw
        .map(p => {
          if (!p || typeof p !== 'object') return null
          const o = p as Record<string, unknown>
          return {
            date: String(o.date ?? ''),
            totalValue: typeof o.totalValue === 'number' ? o.totalValue : Number(o.totalValue) || 0,
          }
        })
        .filter((x): x is NavPoint => x != null && x.date.length > 0)
      setNavPoints(pts)
    } catch (e) {
      setNavError(apiErrorMessage(e))
      setNavPoints([])
    } finally {
      setNavLoading(false)
    }
  }, [profile, limitDays])

  useEffect(() => {
    void loadNav()
  }, [loadNav])

  const configEntries = useMemo(() => {
    if (!configItems) return []
    return Object.entries(configItems).sort(([a], [b]) => a.localeCompare(b))
  }, [configItems])

  const orderedProfileSummaries = useMemo(() => {
    const m = new Map(
      summaryRows.map(r => [String((r as Record<string, unknown>).profileSlug ?? '').toLowerCase(), r]),
    )
    return PROFILE_SLUGS.map(slug => {
      const row = m.get(slug)
      if (row) return row as Record<string, unknown>
      return { profileSlug: slug, positionsList: [] }
    })
  }, [summaryRows])

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>
          Виртуальные портфели
        </Typography>
        <Tooltip title="Обновить сводку и позиции">
          <span>
            <IconButton
              size="small"
              onClick={() => void refetchOverview()}
              disabled={overviewLoading}
              aria-label="Обновить"
            >
              <RefreshIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Button size="small" variant="outlined" onClick={() => void refetchOverview()} disabled={overviewLoading}>
          Обновить данные
        </Button>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Позиции, средняя цена закупки и сравнение с текущей котировкой по каждому профилю; NAV и пороги.
      </Typography>

      {overviewError ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {overviewError}
        </Alert>
      ) : null}
      {navError ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {navError}
        </Alert>
      ) : null}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          Профиль для графика
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
          <ToggleButtonGroup
            exclusive
            value={profile}
            onChange={(_, v) => v != null && setProfile(String(v))}
            size="small"
            color="primary"
          >
            {PROFILE_SLUGS.map(slug => (
              <ToggleButton key={slug} value={slug}>
                {slug}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel id="nav-days-label">Глубина, дней</InputLabel>
            <Select
              labelId="nav-days-label"
              label="Глубина, дней"
              value={limitDays}
              onChange={e => setLimitDays(Number(e.target.value))}
            >
              {[30, 60, 90, 120, 200].map(d => (
                <MenuItem key={d} value={d}>
                  {d}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
        {navLoading ? <LinearProgress sx={{ mt: 2 }} /> : null}
        <Box sx={{ mt: 2 }}>
          <ChartContainer
            title="История NAV"
            subtitle={`Профиль: ${profile}, глубина ${limitDays} дн.`}
            minHeight={360}
          >
            <NavLineChart points={navPoints} emptyLabel="Нет истории NAV для выбранного профиля." />
          </ChartContainer>
        </Box>
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Сводка по профилям
        </Typography>
        {overviewLoading ? <LinearProgress sx={{ mb: 1 }} /> : null}
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Профиль</TableCell>
                <TableCell align="right">Стоимость</TableCell>
                <TableCell align="right">Позиции</TableCell>
                <TableCell align="right">Кэш</TableCell>
                <TableCell align="right">Стартовый капитал</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {summaryRows.map(row => (
                <TableRow key={String(row.profileSlug ?? '')}>
                  <TableCell>{String(row.profileSlug ?? '—')}</TableCell>
                  <TableCell align="right">{formatMoney(row.totalValue)}</TableCell>
                  <TableCell align="right">{formatMoney(row.positionsValue)}</TableCell>
                  <TableCell align="right">{formatMoney(row.cash)}</TableCell>
                  <TableCell align="right">{formatMoney(row.initialCapital)}</TableCell>
                </TableRow>
              ))}
              {summaryRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Typography color="text.secondary">Нет данных профилей.</Typography>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Открытые позиции по портфелям
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Средняя цена — по сделкам в виртуальном портфеле; текущая — last price из БД (или последняя цена сделки,
          если инструмент не найден).
        </Typography>
        {overviewLoading ? <LinearProgress sx={{ mb: 1 }} /> : null}
        {orderedProfileSummaries.map(prow => {
          const slug = String(prow.profileSlug ?? '—')
          const rawList = prow.positionsList
          const list = Array.isArray(rawList)
            ? rawList.filter((x): x is Record<string, unknown> => x != null && typeof x === 'object')
            : []
          const sorted = [...list].sort((a, b) => {
            const ta = String(a.ticker ?? a.figi ?? '')
            const tb = String(b.ticker ?? b.figi ?? '')
            return ta.localeCompare(tb, 'ru')
          })
          let sumPnl = 0
          let hasPnl = false
          for (const p of sorted) {
            const u = numOrNull(p.unrealizedPnlRub)
            if (u != null) {
              sumPnl += u
              hasPnl = true
            }
          }
          return (
            <Accordion key={slug} disableGutters sx={{ mb: 1, bgcolor: 'background.default' }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, width: '100%', pr: 1 }}>
                  <Typography sx={{ fontWeight: 600, textTransform: 'capitalize' }}>{slug}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Позиций: {sorted.length}
                  </Typography>
                  {hasPnl ? (
                    <Typography variant="body2" sx={{ color: pnlColor(sumPnl), fontWeight: 600 }}>
                      Σ нереализ. P/L: {formatSignedRub(sumPnl)}
                    </Typography>
                  ) : null}
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                {sorted.length === 0 ? (
                  <Typography color="text.secondary">Нет открытых позиций.</Typography>
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Инструмент</TableCell>
                          <TableCell>FIGI</TableCell>
                          <TableCell align="right">Кол-во</TableCell>
                          <TableCell align="right">Средняя</TableCell>
                          <TableCell align="right">Текущая</TableCell>
                          <TableCell align="right">Δ ₽</TableCell>
                          <TableCell align="right">Δ %</TableCell>
                          <TableCell align="right">P/L позиции</TableCell>
                          <TableCell align="right">Действия</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {sorted.map(p => {
                          const figi = String(p.figi ?? '')
                          const label = [p.ticker, p.name].filter(Boolean).join(' · ') || figi || '—'
                          const miss = Boolean(p.instrumentMissing)
                          const pnl = numOrNull(p.unrealizedPnlRub)
                          const dRub = numOrNull(p.priceDelta)
                          const dPct = numOrNull(p.priceDeltaPercent)
                          const px = numOrNull(p.currentPrice)
                          const qtyHeld = parsePositionQuantity(p)
                          return (
                            <TableRow key={figi || label}>
                              <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                                  <Typography variant="body2">{label}</Typography>
                                  {miss ? (
                                    <Chip size="small" label="нет котировки в БД" variant="outlined" />
                                  ) : null}
                                </Box>
                              </TableCell>
                              <TableCell>
                                <Typography variant="caption" sx={{ wordBreak: 'break-all' }}>
                                  {figi || '—'}
                                </Typography>
                              </TableCell>
                              <TableCell align="right">{String(p.quantity ?? '—')}</TableCell>
                              <TableCell align="right">{formatMoney(p.averagePositionPrice)}</TableCell>
                              <TableCell align="right">{formatMoney(p.currentPrice)}</TableCell>
                              <TableCell align="right">
                                <Typography variant="body2" sx={{ color: pnlColor(dRub) }}>
                                  {formatSignedRub(p.priceDelta)}
                                </Typography>
                              </TableCell>
                              <TableCell align="right">
                                <Typography variant="body2" sx={{ color: pnlColor(dPct) }}>
                                  {formatPercent(p.priceDeltaPercent)}
                                </Typography>
                              </TableCell>
                              <TableCell align="right">
                                <Typography variant="body2" sx={{ color: pnlColor(pnl), fontWeight: 600 }}>
                                  {formatSignedRub(p.unrealizedPnlRub)}
                                </Typography>
                              </TableCell>
                              <TableCell align="right">
                                {figi ? (
                                  <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                    <Button
                                      size="small"
                                      color="secondary"
                                      variant="outlined"
                                      disabled={qtyHeld < 1}
                                      title={qtyHeld < 1 ? 'Нет количества для продажи' : undefined}
                                      onClick={() => {
                                        setSellProfileSlug(
                                          PROFILE_SLUGS.includes(slug as (typeof PROFILE_SLUGS)[number])
                                            ? slug
                                            : 'moderate',
                                        )
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
                                    >
                                      Карточка
                                    </Button>
                                  </Stack>
                                ) : null}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </AccordionDetails>
            </Accordion>
          )
        })}
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Конфигурация порогов (по профилю)
        </Typography>
        {configEntries.length === 0 ? (
          <Typography color="text.secondary">Конфиг недоступен.</Typography>
        ) : (
          configEntries.map(([slug, cfg]) => (
            <Accordion key={slug} disableGutters sx={{ bgcolor: 'background.default' }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography sx={{ fontWeight: 600 }}>{slug}</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <LabeledValuesTable rows={virtualProfileConfigToRows(cfg)} />
                <CollapsibleRawJson data={cfg} />
              </AccordionDetails>
            </Accordion>
          ))
        )}
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
        initialMode="paper"
        initialVirtualProfile={sellProfileSlug}
        lockVirtualProfile
        initialQuantity={sellInitialQty}
        onSuccess={() => void refetchOverview()}
      />
    </Box>
  )
}
