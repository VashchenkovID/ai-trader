import FilterListIcon from '@mui/icons-material/FilterList'
import type { ButtonProps, ChipProps } from '@mui/material'
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControl,
  FormControlLabel,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  Switch,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { TradingRequestsService } from '@/api/generated'
import { JsonViewBlock } from '@/components/json'
import { ScrollableTablePaper } from '@/components/ui/ScrollableTablePaper'
import { tradingRequestActionDisabledReason } from '@/domain/tradingRequestUiHints'
import { FIGI_TABLE_CELL_SX, TABLE_NUMERIC_CELL_SX } from '@/theme/tableStyles'
import { apiErrorMessage } from '@/utils/apiErrorMessage'
import { filterTradingRequestRows } from '@/utils/tradingRequestFilters'

function TrActionButton({
  label,
  disabledReason,
  onClick,
  color,
  variant = 'outlined',
}: {
  label: string
  disabledReason: string | null
  onClick?: () => void
} & Pick<ButtonProps, 'color' | 'variant'>) {
  if (disabledReason) {
    return (
      <Tooltip title={disabledReason}>
        <span>
          <Button size="small" variant={variant} color={color} disabled>
            {label}
          </Button>
        </span>
      </Tooltip>
    )
  }
  return (
    <Button size="small" variant={variant} color={color} onClick={onClick}>
      {label}
    </Button>
  )
}

type TradingRequestRow = {
  id: string
  status: string
  figi: string
  mode?: string
  action?: string
  quantity?: number
  price?: unknown
  budget?: unknown
  ticker?: string | null
  name?: string | null
  virtualProfileSlug?: string | null
  createdAt?: string | null
}

const STATUS_OPTIONS = [
  '',
  'PENDING',
  'APPROVED',
  'PENDING_MANUAL_REAL',
  'EXECUTED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
]
const MODE_OPTIONS = ['', 'paper', 'real', 'micro']

type StatusMeta = {
  labelRu: string
  color: ChipProps['color']
  variant?: ChipProps['variant']
}

const STATUS_META: Record<string, StatusMeta> = {
  PENDING: { labelRu: 'В ожидании', color: 'warning', variant: 'filled' },
  APPROVED: { labelRu: 'Одобрена', color: 'info', variant: 'filled' },
  PENDING_MANUAL_REAL: { labelRu: 'Ожидает ручного исполнения', color: 'secondary', variant: 'filled' },
  EXECUTED: { labelRu: 'Исполнена', color: 'success', variant: 'filled' },
  REJECTED: { labelRu: 'Отклонена', color: 'error', variant: 'filled' },
  CANCELLED: { labelRu: 'Отменена', color: 'default', variant: 'outlined' },
  EXPIRED: { labelRu: 'Истекла', color: 'default', variant: 'outlined' },
}

function statusMeta(status: string): StatusMeta {
  return STATUS_META[status] ?? { labelRu: status || 'Неизвестно', color: 'default', variant: 'outlined' }
}

function asRows(raw: unknown): TradingRequestRow[] {
  if (!Array.isArray(raw)) return []
  return raw.map(r => {
    const o = r as Record<string, unknown>
    return {
      id: String(o.id ?? ''),
      status: String(o.status ?? ''),
      figi: String(o.figi ?? ''),
      mode: o.mode != null ? String(o.mode) : undefined,
      action: o.action != null ? String(o.action) : undefined,
      quantity: typeof o.quantity === 'number' ? o.quantity : Number(o.quantity) || undefined,
      price: o.price,
      budget: o.budget,
      ticker: o.ticker != null ? String(o.ticker) : null,
      name: o.name != null ? String(o.name) : null,
      virtualProfileSlug: o.virtualProfileSlug != null ? String(o.virtualProfileSlug) : null,
      createdAt: o.createdAt != null ? String(o.createdAt) : null,
    }
  })
}

function formatNum(v: unknown): string {
  if (v == null || v === '') return '—'
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return String(v)
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 4,
  }).format(n)
}

function TradingRequestsPage() {
  const theme = useTheme()
  const isNarrow = useMediaQuery(theme.breakpoints.down('md'))
  const [items, setItems] = useState<TradingRequestRow[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const limit = 50
  const [statusFilter, setStatusFilter] = useState('')
  const [modeFilter, setModeFilter] = useState('')
  const [figiFilter, setFigiFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false)
  const [statsByStatus, setStatsByStatus] = useState<Record<string, number>>({})
  const [statsTotal, setStatsTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [snack, setSnack] = useState<{ message: string; severity: 'success' | 'error' } | null>(
    null
  )

  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectId, setRejectId] = useState<string | null>(null)

  const [executeOpen, setExecuteOpen] = useState(false)
  const [executeId, setExecuteId] = useState<string | null>(null)
  const [executePrice, setExecutePrice] = useState('')
  const [executeAmount, setExecuteAmount] = useState('')

  const [approveOpen, setApproveOpen] = useState(false)
  const [approveId, setApproveId] = useState<string | null>(null)
  const [manualBroker, setManualBroker] = useState(false)

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewPayload, setPreviewPayload] = useState<unknown>(null)
  const [previewTitle, setPreviewTitle] = useState('')

  const clientFilterActive = useMemo(
    () => Boolean(figiFilter.trim() || dateFrom.trim() || dateTo.trim()),
    [figiFilter, dateFrom, dateTo],
  )

  useEffect(() => {
    setOffset(0)
  }, [figiFilter, dateFrom, dateTo])

  const loadStats = useCallback(async () => {
    try {
      const envelope =
        await TradingRequestsService.tradingRequestsStatsApiV1TradingRequestsStatsGet({
          mode: modeFilter || null,
        })
      const d = envelope.data as { byStatus?: Record<string, number>; total?: number }
      setStatsByStatus(d.byStatus ?? {})
      setStatsTotal(typeof d.total === 'number' ? d.total : 0)
    } catch {
      setStatsByStatus({})
      setStatsTotal(0)
    }
  }, [modeFilter])

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const heavy = clientFilterActive
      const envelope = await TradingRequestsService.tradingRequestsListApiV1TradingRequestsGet({
        status: statusFilter || null,
        mode: modeFilter || null,
        offset: heavy ? 0 : offset,
        limit: heavy ? 500 : limit,
      })
      const data = envelope.data as { items?: unknown; meta?: { total?: number } }
      let rows = asRows(data.items)
      if (heavy) {
        rows = filterTradingRequestRows(rows, figiFilter, dateFrom || undefined, dateTo || undefined)
        const n = rows.length
        setItems(rows.slice(offset, offset + limit))
        setTotal(n)
      } else {
        setItems(rows)
        setTotal(typeof data.meta?.total === 'number' ? data.meta.total : 0)
      }
    } catch (err) {
      setSnack({ message: apiErrorMessage(err), severity: 'error' })
    } finally {
      setLoading(false)
    }
  }, [statusFilter, modeFilter, offset, limit, clientFilterActive, figiFilter, dateFrom, dateTo])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const refresh = () => {
    void loadStats()
    void loadList()
  }

  const runAction = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn()
      setSnack({ message: `${label}: ок`, severity: 'success' })
      refresh()
    } catch (err) {
      setSnack({ message: apiErrorMessage(err), severity: 'error' })
    }
  }

  const openReject = (id: string) => {
    setRejectId(id)
    setRejectReason('')
    setRejectOpen(true)
  }

  const submitReject = async () => {
    if (!rejectId) return
    await runAction('Отклонено', () =>
      TradingRequestsService.tradingRequestRejectApiV1TradingRequestsRequestIdRejectPost({
        requestId: rejectId,
        requestBody: { reason: rejectReason || undefined },
      })
    )
    setRejectOpen(false)
    setRejectId(null)
  }

  const openExecute = (id: string) => {
    setExecuteId(id)
    setExecutePrice('')
    setExecuteAmount('')
    setExecuteOpen(true)
  }

  const submitExecute = async () => {
    if (!executeId) return
    const price = executePrice.trim() === '' ? undefined : Number(executePrice.replace(',', '.'))
    const amount = executeAmount.trim() === '' ? undefined : Number(executeAmount.replace(',', '.'))
    await runAction('Исполнено', () =>
      TradingRequestsService.tradingRequestExecuteApiV1TradingRequestsRequestIdExecutePost({
        requestId: executeId,
        requestBody: {
          actualPrice: Number.isFinite(price as number) ? price : undefined,
          actualAmount: Number.isFinite(amount as number) ? amount : undefined,
        },
      })
    )
    setExecuteOpen(false)
    setExecuteId(null)
  }

  const openApprove = (id: string) => {
    setApproveId(id)
    setManualBroker(false)
    setApproveOpen(true)
  }

  const submitApprove = async () => {
    if (!approveId) return
    await runAction('Одобрено', () =>
      TradingRequestsService.tradingRequestApproveApiV1TradingRequestsRequestIdApprovePost({
        requestId: approveId,
        requestBody: { manualBrokerExecution: manualBroker },
      })
    )
    setApproveOpen(false)
    setApproveId(null)
  }

  const openPreview = (row: TradingRequestRow) => {
    setPreviewTitle(row.figi)
    setPreviewPayload(null)
    setPreviewOpen(true)
    setPreviewLoading(true)
    void TradingRequestsService.tradingRequestPreviewApiV1TradingRequestsPreviewPost({
      requestBody: {
        recommendationFigi: row.figi,
        options: {
          action: row.action ?? undefined,
          mode: row.mode,
          quantity: row.quantity ?? undefined,
          virtualProfile: row.virtualProfileSlug ?? undefined,
        },
      },
    })
      .then(env => {
        setPreviewPayload(env.data ?? env)
      })
      .catch(err => {
        setPreviewPayload({ error: apiErrorMessage(err) })
      })
      .finally(() => setPreviewLoading(false))
  }

  const filterExtras = (
    <Stack spacing={1.25} sx={{ mt: { xs: 0, md: 1 } }}>
      <TextField
        size="small"
        label="FIGI или тикер (содержит)"
        value={figiFilter}
        onChange={e => setFigiFilter(e.target.value)}
        sx={{ minWidth: 220 }}
      />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        <TextField
          size="small"
          type="date"
          label="Создана с"
          slotProps={{ inputLabel: { shrink: true } }}
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
        />
        <TextField
          size="small"
          type="date"
          label="Создана по"
          slotProps={{ inputLabel: { shrink: true } }}
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
        />
      </Box>
      <Typography variant="caption" color="text.secondary">
        При фильтре по FIGI/датам загружается до 500 заявок, отбор и пагинация — на клиенте.
      </Typography>
    </Stack>
  )

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h6" component="h1" sx={{ fontWeight: 600, color: 'primary.main' }}>
          Торговые заявки
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
          State machine, фильтры и действия. Превью: <code>POST /trading-requests/preview</code>.
        </Typography>
      </Box>

      <Paper variant="outlined" sx={{ p: 1.5, borderColor: 'divider' }}>
        <Stack spacing={1.25}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'secondary.main', letterSpacing: '0.04em' }}>
            СТАТУСЫ
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Агрегаты {modeFilter ? `(режим: ${modeFilter})` : '(все режимы)'} · всего: {statsTotal}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {Object.entries(statsByStatus).map(([st, n]) => (
              <Chip key={st} size="small" label={`${statusMeta(st).labelRu}: ${n}`} color={statusMeta(st).color} variant={statusMeta(st).variant ?? 'outlined'} />
            ))}
          </Box>

          <Divider sx={{ borderColor: 'divider' }} />

          <Typography variant="caption" sx={{ fontWeight: 600, color: 'primary.main', letterSpacing: '0.04em' }}>
            ФИЛЬТРЫ
          </Typography>
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              flexWrap: 'wrap',
              gap: 1.25,
              alignItems: { sm: 'center' },
            }}
          >
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel id="tr-status-filter">Статус</InputLabel>
              <Select
                labelId="tr-status-filter"
                label="Статус"
                value={statusFilter}
                onChange={e => {
                  setStatusFilter(String(e.target.value))
                  setOffset(0)
                }}
              >
                {STATUS_OPTIONS.map(s => (
                  <MenuItem key={s || 'all'} value={s}>
                    {s ? statusMeta(s).labelRu : 'Все'}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel id="tr-mode-filter">Режим</InputLabel>
              <Select
                labelId="tr-mode-filter"
                label="Режим"
                value={modeFilter}
                onChange={e => {
                  setModeFilter(String(e.target.value))
                  setOffset(0)
                }}
              >
                {MODE_OPTIONS.map(m => (
                  <MenuItem key={m || 'all-m'} value={m}>
                    {m || 'Все'}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button variant="outlined" size="small" onClick={() => refresh()} disabled={loading}>
              Обновить
            </Button>
            {isNarrow ? (
              <Button
                variant="text"
                size="small"
                color="secondary"
                startIcon={<FilterListIcon />}
                onClick={() => setFilterDrawerOpen(true)}
              >
                Доп. фильтры
              </Button>
            ) : null}
            <Typography variant="caption" color="text.secondary" sx={{ ml: { sm: 'auto' } }}>
              {total
                ? `${offset + 1}–${Math.min(offset + items.length, total)} / ${total}`
                : loading
                  ? 'Загрузка…'
                  : 'Нет данных'}
            </Typography>
          </Box>
          {!isNarrow ? filterExtras : null}
        </Stack>
      </Paper>

      <Drawer anchor="right" open={filterDrawerOpen} onClose={() => setFilterDrawerOpen(false)}>
        <Box sx={{ width: 300, p: 1.5 }}>
          <Typography variant="subtitle2" gutterBottom>
            Дополнительные фильтры
          </Typography>
          {filterExtras}
          <Button fullWidth sx={{ mt: 2 }} variant="contained" onClick={() => setFilterDrawerOpen(false)}>
            Готово
          </Button>
        </Box>
      </Drawer>

      <ScrollableTablePaper maxHeight="min(62vh, 480px)" sx={{ overflowX: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Статус</TableCell>
              <TableCell>FIGI</TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Тикер</TableCell>
              <TableCell>Действие</TableCell>
              <TableCell>Режим</TableCell>
              <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                Кол-во
              </TableCell>
              <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>Профиль</TableCell>
              <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>Создана</TableCell>
              <TableCell align="right">Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={9}>
                  <Typography color="text.secondary">Нет заявок по текущим фильтрам.</Typography>
                </TableCell>
              </TableRow>
            ) : (
              items.map(row => (
                <TableRow key={row.id} hover>
                  <TableCell>
                    <Chip
                      label={statusMeta(row.status).labelRu}
                      size="small"
                      color={statusMeta(row.status).color}
                      variant={statusMeta(row.status).variant ?? 'outlined'}
                    />
                  </TableCell>
                  <TableCell sx={FIGI_TABLE_CELL_SX}>
                    <Typography
                      variant="body2"
                      component={Link}
                      to={`/recommendations/${encodeURIComponent(row.figi)}`}
                      sx={{ color: 'primary.main' }}
                    >
                      {row.figi}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                    {row.ticker ?? '—'}
                  </TableCell>
                  <TableCell>{row.action ?? '—'}</TableCell>
                  <TableCell>{row.mode ?? '—'}</TableCell>
                  <TableCell
                    sx={{ display: { xs: 'none', sm: 'table-cell' }, ...TABLE_NUMERIC_CELL_SX }}
                    align="right"
                  >
                    {row.quantity ?? '—'}
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>
                    {row.virtualProfileSlug ?? '—'}
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>
                    {row.createdAt ? new Date(row.createdAt).toLocaleString('ru-RU') : '—'}
                  </TableCell>
                  <TableCell align="right">
                    <Box
                      sx={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 0.5,
                        justifyContent: 'flex-end',
                      }}
                    >
                      <TrActionButton
                        label="Одобрить"
                        variant="contained"
                        disabledReason={tradingRequestActionDisabledReason(row.status, 'approve')}
                        onClick={() => openApprove(row.id)}
                      />
                      <TrActionButton
                        label="Отклонить"
                        color="error"
                        variant="outlined"
                        disabledReason={tradingRequestActionDisabledReason(row.status, 'reject')}
                        onClick={() => openReject(row.id)}
                      />
                      <TrActionButton
                        label="Исполнить"
                        variant="outlined"
                        disabledReason={tradingRequestActionDisabledReason(row.status, 'execute')}
                        onClick={() => openExecute(row.id)}
                      />
                      <TrActionButton
                        label="Отменить"
                        variant="text"
                        disabledReason={tradingRequestActionDisabledReason(row.status, 'cancel')}
                        onClick={() =>
                          void runAction('Отмена', () =>
                            TradingRequestsService.tradingRequestCancelApiV1TradingRequestsRequestIdCancelPost({
                              requestId: row.id,
                            })
                          )
                        }
                      />
                      {!row.figi ? (
                        <Tooltip title="Нет FIGI для превью">
                          <span>
                            <Button size="small" variant="outlined" disabled>
                              Превью
                            </Button>
                          </span>
                        </Tooltip>
                      ) : (
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => openPreview(row)}
                        >
                          Превью
                        </Button>
                      )}
                    </Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block', mt: 0.5, ...TABLE_NUMERIC_CELL_SX }}
                    >
                      Цена {formatNum(row.price)} · Бюджет {formatNum(row.budget)}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </ScrollableTablePaper>

      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
        <Button
          disabled={offset === 0 || loading}
          onClick={() => setOffset(o => Math.max(0, o - limit))}
        >
          Назад
        </Button>
        <Button
          disabled={offset + items.length >= total || loading}
          onClick={() => setOffset(o => o + limit)}
        >
          Вперёд
        </Button>
      </Box>

      <Dialog open={rejectOpen} onClose={() => setRejectOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Отклонить заявку</DialogTitle>
        <DialogContent>
          <TextField
            margin="dense"
            label="Причина (необязательно)"
            fullWidth
            multiline
            minRows={2}
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectOpen(false)}>Закрыть</Button>
          <Button variant="contained" color="error" onClick={() => void submitReject()}>
            Отклонить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={executeOpen} onClose={() => setExecuteOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Исполнить заявку</DialogTitle>
        <DialogContent>
          <TextField
            margin="dense"
            label="Фактическая цена"
            fullWidth
            value={executePrice}
            onChange={e => setExecutePrice(e.target.value)}
            sx={{ mb: 1 }}
          />
          <TextField
            margin="dense"
            label="Фактическая сумма"
            fullWidth
            value={executeAmount}
            onChange={e => setExecuteAmount(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExecuteOpen(false)}>Закрыть</Button>
          <Button variant="contained" onClick={() => void submitExecute()}>
            Исполнить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Превью заявки · {previewTitle}</DialogTitle>
        <DialogContent>
          {previewLoading ? <LinearProgress sx={{ mb: 2 }} /> : null}
          <JsonViewBlock data={previewPayload} maxHeight={480} collapsed={2} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewOpen(false)}>Закрыть</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={approveOpen} onClose={() => setApproveOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Одобрить заявку</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Для режима paper после одобрения бэкенд сразу исполняет заявку. Для real можно отметить
            ручное исполнение у брокера.
          </Typography>
          <FormControlLabel
            control={
              <Switch checked={manualBroker} onChange={e => setManualBroker(e.target.checked)} />
            }
            label="Real / micro: одобрить как ожидание ручного исполнения у брокера (PENDING_MANUAL_REAL)"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApproveOpen(false)}>Закрыть</Button>
          <Button variant="contained" onClick={() => void submitApprove()}>
            Одобрить
          </Button>
        </DialogActions>
      </Dialog>

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

export { TradingRequestsPage }
export default TradingRequestsPage
