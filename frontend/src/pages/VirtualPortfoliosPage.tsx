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
  Snackbar,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import RefreshIcon from '@mui/icons-material/Refresh'
import { alpha } from '@mui/material/styles'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PortfolioAnalysisService, PortfolioService } from '@/api/generated'
import { ChartContainer } from '@/components/charts/ChartContainer'
import { RecommendationStatusBadge } from '@/components/recommendations/RecommendationStatusBadge'
import { ScrollableTablePaper } from '@/components/ui/ScrollableTablePaper'
import { CreateTradingRequestModal, parsePositionQuantity } from '@/components/trading'
import { CollapsibleRawJson, LabeledValuesTable } from '@/components/ops'
import { NavLineChart, type NavPoint } from '@/components/virtual/NavLineChart'
import { useVirtualPortfolioOverview } from '@/hooks/useVirtualPortfolioOverview'
import { apiErrorMessage } from '@/utils/apiErrorMessage'
import { parseLatestVerdictMap, type PortfolioVerdictCell } from '@/utils/portfolioPositionVerdict'
import { FIGI_TABLE_CELL_SX, TABLE_NUMERIC_CELL_SX } from '@/theme/tableStyles'
import { virtualProfileConfigToRows } from '@/utils/virtualProfileConfigDisplay'

const PROFILE_SLUGS = ['conservative', 'moderate', 'aggressive', 'experimental'] as const

type VirtualProfileSlug = (typeof PROFILE_SLUGS)[number]

const PROFILE_LABELS: Record<VirtualProfileSlug, string> = {
  conservative: 'Консервативный',
  moderate: 'Умеренный',
  aggressive: 'Агрессивный',
  experimental: 'Экспериментальный',
}

function profileTitleSx(slug: string) {
  const s = slug.toLowerCase()
  if (s === 'conservative') return { color: 'primary.main' as const, fontWeight: 700 as const }
  if (s === 'moderate') return { color: 'primary.light' as const, fontWeight: 700 as const }
  if (s === 'aggressive') return { color: 'secondary.main' as const, fontWeight: 700 as const }
  return { color: 'secondary.light' as const, fontWeight: 700 as const }
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

/** Стоимость портфеля выше стартового капитала (оба числа известны). */
function summaryAboveInitialCapital(row: Record<string, unknown> | undefined): boolean {
  if (!row) return false
  const total = numOrNull(row.totalValue)
  const initial = numOrNull(row.initialCapital)
  if (total == null || initial == null) return false
  return total > initial
}

function VirtualPortfoliosPage() {
  const {
    summaryRows,
    configItems,
    loading: overviewLoading,
    error: overviewError,
    refetch: refetchOverview,
  } = useVirtualPortfolioOverview()
  const [profile, setProfile] = useState<string>('conservative')
  const [limitDays, setLimitDays] = useState(120)
  const [navPoints, setNavPoints] = useState<NavPoint[]>([])
  const [navLoading, setNavLoading] = useState(false)
  const [navError, setNavError] = useState<string | null>(null)

  const [sellOpen, setSellOpen] = useState(false)
  const [sellData, setSellData] = useState<Record<string, unknown> | null>(null)
  const [sellInitialQty, setSellInitialQty] = useState('')
  const [sellProfileSlug, setSellProfileSlug] = useState('conservative')
  const [positionsTab, setPositionsTab] = useState<VirtualProfileSlug>('conservative')

  const [verdictByProfile, setVerdictByProfile] = useState<
    Partial<Record<string, Map<string, PortfolioVerdictCell>>>
  >({})
  const [verdictBusySlug, setVerdictBusySlug] = useState<string | null>(null)
  const [verdictsLoading, setVerdictsLoading] = useState(false)
  const [snack, setSnack] = useState<{
    message: string
    severity: 'success' | 'error' | 'warning'
  } | null>(null)

  const loadSavedVerdictsAll = useCallback(async () => {
    setVerdictsLoading(true)
    try {
      const entries = await Promise.all(
        PROFILE_SLUGS.map(async slug => {
          try {
            const env = await PortfolioAnalysisService.getLatestApiV1PortfolioAnalysisLatestGet({
              portfolioScope: `virtual:${slug}`,
              limit: 100,
            })
            return [slug, parseLatestVerdictMap(env.data)] as const
          } catch {
            return [slug, new Map<string, PortfolioVerdictCell>()] as const
          }
        })
      )
      setVerdictByProfile(Object.fromEntries(entries))
    } finally {
      setVerdictsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSavedVerdictsAll()
  }, [loadSavedVerdictsAll])

  const refreshVerdictForProfile = useCallback(async (slug: string) => {
    const scope = `virtual:${slug}`
    setVerdictBusySlug(slug)
    try {
      const env = await PortfolioAnalysisService.postVerdictApiV1PortfolioAnalysisVerdictPost({
        requestBody: { portfolio_scope: scope },
      })
      const latest = await PortfolioAnalysisService.getLatestApiV1PortfolioAnalysisLatestGet({
        portfolioScope: scope,
        limit: 100,
      })
      setVerdictByProfile(prev => ({
        ...prev,
        [slug]: parseLatestVerdictMap(latest.data),
      }))
      const payload = env.data as
        | { llmSource?: string; saved?: number; message?: string }
        | undefined
      if (payload?.message === 'no_positions') {
        setSnack({ message: `Профиль «${slug}»: нет позиций для анализа.`, severity: 'warning' })
      } else if (payload?.message === 'no_llm_verdict') {
        setSnack({
          message: `Профиль «${slug}»: нет валидного ответа GigaChat — записи в БД не менялись.`,
          severity: 'warning',
        })
      } else if (payload?.message === 'used_manual_merged_auto_llm_unparseable') {
        setSnack({
          message: `Профиль «${slug}»: ответ GigaChat не разобран; для позиций без ручного импорта показан HOLD. Ручные вердикты сохранены.`,
          severity: 'warning',
        })
      } else if (payload?.message === 'used_manual_verdict_cache') {
        setSnack({
          message: `Профиль «${slug}»: все позиции покрыты свежим ручным импортом — вызов GigaChat не нужен.`,
          severity: 'success',
        })
      } else {
        const src =
          payload?.llmSource === 'gigachat' ||
          payload?.llmSource === 'gigachat_manual_merge' ||
          payload?.llmSource === 'perplexity'
            ? 'GigaChat/LLM'
            : payload?.llmSource === 'manual_cached' || payload?.llmSource === 'manual_cached_partial'
              ? 'ручной кэш'
              : (payload?.llmSource ?? '—')
        setSnack({
          message: `Профиль «${slug}»: вердикт обновлён (${src}, записей: ${payload?.saved ?? '—'}).`,
          severity: 'success',
        })
      }
    } catch (e) {
      setSnack({ message: apiErrorMessage(e), severity: 'error' })
    } finally {
      setVerdictBusySlug(null)
    }
  }, [])

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
      summaryRows.map(r => [
        String((r as Record<string, unknown>).profileSlug ?? '').toLowerCase(),
        r,
      ])
    )
    return PROFILE_SLUGS.map(slug => {
      const row = m.get(slug)
      if (row) return row as Record<string, unknown>
      return { profileSlug: slug, positionsList: [] }
    })
  }, [summaryRows])

  const tabProfileData = useMemo(() => {
    const prow =
      orderedProfileSummaries.find(
        p => String((p as Record<string, unknown>).profileSlug ?? '').toLowerCase() === positionsTab
      ) ?? ({ profileSlug: positionsTab, positionsList: [] } as Record<string, unknown>)
    const rawList = (prow as Record<string, unknown>).positionsList
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
    return { sorted, sumPnl, hasPnl }
  }, [orderedProfileSummaries, positionsTab])

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography
          variant="h5"
          sx={{
            flexGrow: 1,
            fontWeight: 800,
            color: 'primary.main',
            letterSpacing: '-0.02em',
          }}
        >
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
        <Button
          size="small"
          variant="outlined"
          onClick={() => void refetchOverview()}
          disabled={overviewLoading}
        >
          Обновить данные
        </Button>
        <Tooltip title="Подтянуть с сервера последние сохранённые вердикты BUY/SELL/HOLD по позициям (без вызова LLM)">
          <span>
            <Button
              size="small"
              variant="outlined"
              onClick={() => void loadSavedVerdictsAll()}
              disabled={overviewLoading || verdictsLoading}
            >
              Загрузить вердикты по позициям
            </Button>
          </span>
        </Tooltip>
      </Box>
      <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary', maxWidth: 720 }}>
        <Box component="span" sx={{ color: 'primary.main', fontWeight: 600 }}>
          Позиции
        </Box>{' '}
        и средняя закупка vs текущая котировка по каждому профилю;{' '}
        <Box component="span" sx={{ color: 'secondary.main', fontWeight: 600 }}>
          NAV
        </Box>{' '}
        на графике и{' '}
        <Box component="span" sx={{ color: 'primary.light', fontWeight: 600 }}>
          пороги
        </Box>{' '}
        в конфигурации.
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

      <Paper
        sx={theme => ({
          p: 2,
          mb: 2,
          borderColor: alpha(theme.palette.primary.main, 0.35),
          boxShadow: `0 0 0 1px ${alpha(theme.palette.primary.main, 0.12)}, 0 12px 40px ${alpha(theme.palette.primary.main, 0.08)}`,
        })}
      >
        <Typography variant="subtitle1" sx={{ mb: 0.5, color: 'primary.main', fontWeight: 700 }}>
          Сводка по портфелям
        </Typography>
        <Typography
          variant="caption"
          sx={{ display: 'block', mb: 1.5, color: 'secondary.main', fontWeight: 500 }}
        >
          Стоимость, доля в акциях и кэш по каждому профилю
        </Typography>
        {overviewLoading ? <LinearProgress sx={{ mb: 1 }} /> : null}
        <ScrollableTablePaper sx={{ overflowX: 'auto' }} maxHeight="min(50vh, 320px)">
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ color: 'primary.main', fontWeight: 700 }}>Профиль</TableCell>
                <TableCell align="right" sx={{ color: 'primary.main', fontWeight: 700 }}>
                  Стоимость
                </TableCell>
                <TableCell align="right" sx={{ color: 'secondary.main', fontWeight: 700 }}>
                  Позиции
                </TableCell>
                <TableCell align="right" sx={{ color: 'secondary.main', fontWeight: 700 }}>
                  Кэш
                </TableCell>
                <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                  Стартовый капитал
                </TableCell>
                <TableCell align="right" sx={{ color: 'success.main', fontWeight: 700 }}>
                  Доходность
                </TableCell>
                <TableCell align="right" sx={{ color: 'info.main', fontWeight: 700 }}>
                  Sharpe (90d)
                </TableCell>
                <TableCell align="right" sx={{ color: 'error.main', fontWeight: 700 }}>
                  Max DD (90d)
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {PROFILE_SLUGS.map(slug => {
                const row = summaryRows.find(
                  r =>
                    String((r as Record<string, unknown>).profileSlug ?? '').toLowerCase() === slug
                ) as Record<string, unknown> | undefined
                const aboveInitial = summaryAboveInitialCapital(row)
                return (
                  <TableRow
                    key={slug}
                    hover
                    sx={
                      aboveInitial
                        ? theme => ({
                            bgcolor: alpha(theme.palette.success.main, 0.1),
                            boxShadow: `inset 3px 0 0 ${theme.palette.success.main}`,
                          })
                        : undefined
                    }
                  >
                    <TableCell>
                      <Typography sx={profileTitleSx(slug)}>{PROFILE_LABELS[slug]}</Typography>
                      <Typography
                        variant="caption"
                        sx={{ display: 'block', color: 'text.disabled' }}
                      >
                        {slug}
                      </Typography>
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        ...TABLE_NUMERIC_CELL_SX,
                        color: aboveInitial ? 'success.main' : 'primary.light',
                        fontWeight: 700,
                      }}
                    >
                      {row ? formatMoney(row.totalValue) : '—'}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{ ...TABLE_NUMERIC_CELL_SX, color: 'text.primary' }}
                    >
                      {row ? formatMoney(row.positionsValue) : '—'}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{ ...TABLE_NUMERIC_CELL_SX, color: 'secondary.light', fontWeight: 500 }}
                    >
                      {row ? formatMoney(row.cash) : '—'}
                    </TableCell>
                    <TableCell align="right" sx={TABLE_NUMERIC_CELL_SX}>
                      {row ? formatMoney(row.initialCapital) : '—'}
                    </TableCell>
                    <TableCell align="right" sx={TABLE_NUMERIC_CELL_SX}>
                      {row?.tradeMetrics ? (
                        <Typography variant="body2" sx={{ color: pnlColor(numOrNull((row.tradeMetrics as any).totalReturnPct)), fontWeight: 700 }}>
                          {formatPercent((row.tradeMetrics as any).totalReturnPct)}
                        </Typography>
                      ) : '—'}
                    </TableCell>
                    <TableCell align="right" sx={TABLE_NUMERIC_CELL_SX}>
                      {row?.tradeMetrics && (row.tradeMetrics as any).sharpeAnnualized != null
                        ? Number((row.tradeMetrics as any).sharpeAnnualized).toFixed(2)
                        : '—'}
                    </TableCell>
                    <TableCell align="right" sx={TABLE_NUMERIC_CELL_SX}>
                      {row?.tradeMetrics && (row.tradeMetrics as any).maxDrawdownPct != null
                        ? <Typography variant="body2" sx={{ color: 'error.main' }}>{Number((row.tradeMetrics as any).maxDrawdownPct).toFixed(2)}%</Typography>
                        : '—'}
                    </TableCell>
                  </TableRow>
                )
              })}
              {summaryRows.length === 0 && !overviewLoading ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    <Typography sx={{ color: 'warning.main' }}>
                      Нет данных профилей с сервера.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </ScrollableTablePaper>
      </Paper>

      <Paper
        sx={theme => ({
          p: 2,
          mb: 2,
          borderColor: alpha(theme.palette.secondary.main, 0.35),
        })}
      >
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 2,
            mb: 1,
          }}
        >
          <Box>
            <Typography variant="subtitle1" sx={{ color: 'secondary.main', fontWeight: 700 }}>
              Позиции по профилю
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary' }}>
              Средняя цена — по сделкам в виртуальном портфеле; текущая —{' '}
              <Box component="span" sx={{ color: 'primary.main', fontWeight: 600 }}>
                last price
              </Box>{' '}
              из БД. Колонка «Портфель» — вердикт с учётом позиции; пересчёт — кнопка справа.
            </Typography>
          </Box>
          <Tooltip title="Пересчёт рекомендаций по позициям выбранного профиля (цена закупки + рыночный сигнал)">
            <span>
              <Button
                size="small"
                variant="contained"
                color="secondary"
                startIcon={<AutoAwesomeIcon />}
                disabled={verdictBusySlug === positionsTab}
                onClick={() => void refreshVerdictForProfile(positionsTab)}
              >
                Обновить рекомендации
              </Button>
            </span>
          </Tooltip>
        </Box>
        {overviewLoading || verdictsLoading ? <LinearProgress sx={{ mb: 1 }} /> : null}
        <Tabs
          value={positionsTab}
          onChange={(_, v) => v != null && setPositionsTab(v as VirtualProfileSlug)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{
            mb: 2,
            minHeight: 44,
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 700,
              minHeight: 44,
              color: 'text.secondary',
            },
            '& .Mui-selected': {
              color: 'primary.main',
            },
            '& .MuiTabs-indicator': {
              height: 3,
              borderRadius: 1,
              bgcolor: 'secondary.main',
            },
          }}
        >
          {PROFILE_SLUGS.map(slug => (
            <Tab key={slug} value={slug} label={PROFILE_LABELS[slug]} />
          ))}
        </Tabs>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 1.5 }}>
          <Typography sx={profileTitleSx(positionsTab)} variant="subtitle2">
            {PROFILE_LABELS[positionsTab]}
          </Typography>
          <Typography variant="body2" sx={{ color: 'primary.light', fontWeight: 600 }}>
            Позиций: {tabProfileData.sorted.length}
          </Typography>
          {tabProfileData.hasPnl ? (
            <Typography
              variant="body2"
              sx={{ color: pnlColor(tabProfileData.sumPnl), fontWeight: 700 }}
            >
              Σ нереализ. P/L: {formatSignedRub(tabProfileData.sumPnl)}
            </Typography>
          ) : null}
        </Box>
        {(() => {
          const map = verdictByProfile[positionsTab]
          if (!map) return null
          let comment: string | undefined
          for (const v of map.values()) {
            if (v.portfolioComment) {
              comment = v.portfolioComment
              break
            }
          }
          if (!comment) return null
          return (
            <Box sx={{ mb: 2, p: 1.5, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle2" sx={{ color: 'secondary.main', mb: 0.5 }}>
                Мнение LLM по портфелю:
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {comment}
              </Typography>
            </Box>
          )
        })()}
        {tabProfileData.sorted.length === 0 ? (
          <Typography sx={{ color: 'text.secondary' }}>
            Нет открытых позиций в этом профиле.
          </Typography>
        ) : (
          <ScrollableTablePaper maxHeight="min(55vh, 440px)" sx={{ overflowX: 'auto' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: 'primary.main', fontWeight: 700 }}>Инструмент</TableCell>
                  <TableCell sx={{ color: 'secondary.main', fontWeight: 700 }}>FIGI</TableCell>
                  <TableCell align="right" sx={{ color: 'primary.main', fontWeight: 700 }}>
                    Кол-во
                  </TableCell>
                  <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                    Средняя
                  </TableCell>
                  <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                    Текущая
                  </TableCell>
                  <TableCell align="right" sx={{ color: 'primary.main', fontWeight: 700 }}>
                    Δ ₽
                  </TableCell>
                  <TableCell align="right" sx={{ color: 'primary.main', fontWeight: 700 }}>
                    Δ %
                  </TableCell>
                  <TableCell align="right" sx={{ color: 'secondary.main', fontWeight: 700 }}>
                    P/L позиции
                  </TableCell>
                  <TableCell sx={{ color: 'secondary.main', fontWeight: 700 }}>
                    <Tooltip title="Вердикт по позиции в этом виртуальном профиле (цена входа, PnL). Не путать с рыночной карточкой FIGI">
                      <span>Портфель (позиция)</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right" sx={{ color: 'primary.main', fontWeight: 700 }}>
                    Действия
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tabProfileData.sorted.map(p => {
                  const slug = positionsTab
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
                        <Box
                          sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}
                        >
                          <Typography
                            variant="body2"
                            sx={{ color: 'text.primary', fontWeight: 500 }}
                          >
                            {label}
                          </Typography>
                          {miss ? (
                            <Chip
                              size="small"
                              label="нет котировки в БД"
                              variant="outlined"
                              sx={{ borderColor: 'warning.main', color: 'warning.light' }}
                            />
                          ) : null}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ ...FIGI_TABLE_CELL_SX, color: 'secondary.light' }}>
                        {figi || '—'}
                      </TableCell>
                      <TableCell align="right" sx={TABLE_NUMERIC_CELL_SX}>
                        {String(p.quantity ?? '—')}
                      </TableCell>
                      <TableCell align="right" sx={TABLE_NUMERIC_CELL_SX}>
                        {formatMoney(p.averagePositionPrice)}
                      </TableCell>
                      <TableCell align="right" sx={TABLE_NUMERIC_CELL_SX}>
                        {formatMoney(p.currentPrice)}
                      </TableCell>
                      <TableCell align="right" sx={TABLE_NUMERIC_CELL_SX}>
                        <Typography variant="body2" sx={{ color: pnlColor(dRub), fontWeight: 600 }}>
                          {formatSignedRub(p.priceDelta)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={TABLE_NUMERIC_CELL_SX}>
                        <Typography variant="body2" sx={{ color: pnlColor(dPct), fontWeight: 600 }}>
                          {formatPercent(p.priceDeltaPercent)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={TABLE_NUMERIC_CELL_SX}>
                        <Typography variant="body2" sx={{ color: pnlColor(pnl), fontWeight: 700 }}>
                          {formatSignedRub(p.unrealizedPnlRub)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const v = (verdictByProfile[slug] ?? new Map()).get(figi)
                          return v ? (
                            <Tooltip
                              title={
                                <Box>
                                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                    Уверенность: {(v.finalConfidence * 100).toFixed(0)}%
                                  </Typography>
                                  {v.reasons && v.reasons.length > 0 && (
                                    <Box component="ul" sx={{ m: 0, pl: 2, mt: 0.5 }}>
                                      {v.reasons.map((r, i) => (
                                        <Typography component="li" variant="caption" key={i}>
                                          {r}
                                        </Typography>
                                      ))}
                                    </Box>
                                  )}
                                </Box>
                              }
                            >
                              <Box sx={{ display: 'inline-block' }}>
                                <RecommendationStatusBadge value={v.finalAction} />
                              </Box>
                            </Tooltip>
                          ) : (
                            <Typography variant="body2" sx={{ color: 'text.disabled' }}>
                              —
                            </Typography>
                          )
                        })()}
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
                                setSellProfileSlug(
                                  PROFILE_SLUGS.includes(slug as VirtualProfileSlug)
                                    ? slug
                                    : 'conservative'
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
                              sx={{ color: 'primary.light' }}
                              title="Рыночная карточка инструмента (fusion) — не вердикт по позиции в профиле"
                            >
                              Рынок · карточка
                            </Button>
                          </Stack>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </ScrollableTablePaper>
        )}
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1, color: 'secondary.main', fontWeight: 600 }}>
          Профиль для графика NAV
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
              <ToggleButton key={slug} value={slug} sx={{ textTransform: 'none', fontWeight: 600 }}>
                {PROFILE_LABELS[slug]}
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
            titleSx={{ color: 'primary.main', fontWeight: 700 }}
            subtitle={`Профиль: ${PROFILE_LABELS[profile as VirtualProfileSlug] ?? profile}, глубина ${limitDays} дн.`}
            subtitleSx={{ color: 'secondary.light' }}
            minHeight={360}
          >
            <NavLineChart points={navPoints} emptyLabel="Нет истории NAV для выбранного профиля." />
          </ChartContainer>
        </Box>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1, color: 'primary.main', fontWeight: 700 }}>
          Конфигурация порогов (по профилю)
        </Typography>
        {configEntries.length === 0 ? (
          <Typography color="text.secondary">Конфиг недоступен.</Typography>
        ) : (
          configEntries.map(([slug, cfg]) => (
            <Accordion key={slug} disableGutters sx={{ bgcolor: 'background.default' }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography sx={profileTitleSx(slug)}>
                  {PROFILE_LABELS[slug as VirtualProfileSlug] ?? slug}
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <LabeledValuesTable rows={virtualProfileConfigToRows(cfg)} />
                <CollapsibleRawJson data={cfg} />
              </AccordionDetails>
            </Accordion>
          ))
        )}
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
        initialMode="paper"
        initialVirtualProfile={sellProfileSlug}
        lockVirtualProfile
        initialQuantity={sellInitialQty}
        onSuccess={() => void refetchOverview()}
      />
    </Box>
  )
}

export { VirtualPortfoliosPage }
export default VirtualPortfoliosPage
