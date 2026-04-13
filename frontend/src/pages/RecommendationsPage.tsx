import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import {
  Alert,
  Box,
  Button,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MarketService, RecommendationPipelineService } from '@/api/generated'
import { JsonViewBlock } from '@/components/json'
import { RecommendationStatusBadge } from '@/components/recommendations/RecommendationStatusBadge'
import { ScrollableTablePaper } from '@/components/ui/ScrollableTablePaper'
import { CreateTradingRequestModal } from '@/components/trading'
import type { RecommendationRecord } from '@/utils/recommendationFormat'
import { formatPrice, formatScoreConfidence, recNum, recString } from '@/utils/recommendationFormat'
import { apiErrorMessage } from '@/utils/apiErrorMessage'
import { FIGI_TABLE_CELL_SX, TABLE_NUMERIC_CELL_SX } from '@/theme/tableStyles'

const SIGNAL_OPTIONS = ['', 'BUY', 'SELL', 'HOLD'] as const

function tradeActionFromRecommendation(r: RecommendationRecord): 'BUY' | 'SELL' {
  const s = recString(r, 'recommendation').toUpperCase()
  return s === 'SELL' ? 'SELL' : 'BUY'
}

function tradeButtonLabel(action: 'BUY' | 'SELL') {
  return action === 'SELL' ? 'Продать' : 'Купить'
}

function RecommendationsPage() {
  const [items, setItems] = useState<RecommendationRecord[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const limit = 80
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [signalFilter, setSignalFilter] = useState<string>('')
  const [search, setSearch] = useState('')

  const [pipeMode, setPipeMode] = useState('paper')
  const [pipeLimit, setPipeLimit] = useState('50')
  const [pipeMinConf, setPipeMinConf] = useState('')
  const [pipeMinScore, setPipeMinScore] = useState('')
  const [pipeLoading, setPipeLoading] = useState(false)
  const [pipeNotice, setPipeNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [pipeResult, setPipeResult] = useState<unknown>(null)

  const [tradeOpen, setTradeOpen] = useState(false)
  const [tradeFigi, setTradeFigi] = useState<string | null>(null)
  const [tradeInitialAction, setTradeInitialAction] = useState<'BUY' | 'SELL'>('BUY')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const envelope = await MarketService.marketRecommendationsApiV1MarketRecommendationsGet({
        offset,
        limit,
      })
      const data = envelope.data as { items?: unknown[]; meta?: { total?: number } }
      const raw = Array.isArray(data.items) ? data.items : []
      setItems(
        raw.map(x => (typeof x === 'object' && x !== null ? (x as RecommendationRecord) : {}))
      )
      setTotal(typeof data.meta?.total === 'number' ? data.meta.total : 0)
    } catch (e) {
      setError(apiErrorMessage(e))
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [offset, limit])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(r => {
      const sig = recString(r, 'recommendation')
      if (signalFilter && sig !== signalFilter) return false
      if (!q) return true
      const figi = recString(r, 'figi').toLowerCase()
      const ticker = recString(r, 'ticker').toLowerCase()
      const name = recString(r, 'name').toLowerCase()
      return figi.includes(q) || ticker.includes(q) || name.includes(q)
    })
  }, [items, signalFilter, search])

  const runPipeline = useCallback(async () => {
    setPipeLoading(true)
    setPipeNotice(null)
    try {
      const limit = Math.min(500, Math.max(1, Number(pipeLimit) || 50))
      const minConfidence =
        pipeMinConf.trim() === '' ? undefined : Number(pipeMinConf.replace(',', '.'))
      const minScore =
        pipeMinScore.trim() === '' ? undefined : Number(pipeMinScore.replace(',', '.'))
      const env = await RecommendationPipelineService.recommendationPipelineRunApiV1RecommendationPipelineRunPost(
        {
          mode: pipeMode,
          limit,
          minConfidence:
            minConfidence != null && Number.isFinite(minConfidence) ? minConfidence : undefined,
          minScore: minScore != null && Number.isFinite(minScore) ? minScore : undefined,
        },
      )
      setPipeResult(env.data ?? env)
      setPipeNotice({ kind: 'success', text: 'Pipeline выполнен' })
      await load()
    } catch (e) {
      setPipeResult(null)
      setPipeNotice({ kind: 'error', text: apiErrorMessage(e) })
    } finally {
      setPipeLoading(false)
    }
  }, [load, pipeLimit, pipeMinConf, pipeMinScore, pipeMode])

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h6" component="h1" sx={{ fontWeight: 600, color: 'primary.main' }}>
          Рекомендации
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25, maxWidth: 720 }}>
          Fusion NN+LLM. Заявка — «Купить»/«Продать» в строке; одобрение — в «Торговые заявки».
        </Typography>
      </Box>

      {error ? (
        <Alert
          severity="error"
          sx={{ py: 0.5, alignItems: 'center' }}
          action={
            <Button color="inherit" size="small" onClick={() => void load()}>
              Повторить
            </Button>
          }
        >
          {error}
        </Alert>
      ) : null}

      <Paper variant="outlined" sx={{ p: 1.5, borderColor: 'divider' }}>
        <Stack spacing={1.25}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'secondary.main', letterSpacing: '0.04em' }}>
            СПИСОК И ФИЛЬТРЫ
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
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel id="rec-signal">Сигнал</InputLabel>
              <Select
                labelId="rec-signal"
                label="Сигнал"
                value={signalFilter}
                onChange={e => setSignalFilter(String(e.target.value))}
              >
                {SIGNAL_OPTIONS.map(s => (
                  <MenuItem key={s || 'all'} value={s}>
                    {s || 'Все'}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="Поиск FIGI / тикер / имя"
              value={search}
              onChange={e => setSearch(e.target.value)}
              sx={{ minWidth: { xs: '100%', sm: 280 } }}
            />
            <Button variant="outlined" size="small" onClick={() => void load()} disabled={loading}>
              Обновить
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ ml: { sm: 'auto' } }}>
              Стр.: {items.length}/{total} · после фильтра: {filtered.length}
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            Фильтр и поиск — по загруженной странице ({limit} записей); пагинация внизу.
          </Typography>

          <Divider sx={{ borderColor: 'divider' }} />

          <Box>
            <Typography
              variant="caption"
              sx={{ fontWeight: 600, color: 'primary.main', letterSpacing: '0.04em', display: 'block', mb: 0.75 }}
            >
              PIPELINE
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Пороги, дедупликация, заявки (API recommendation-pipeline).
            </Typography>
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 1.25,
                alignItems: 'center',
              }}
            >
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel id="pipe-mode">Режим</InputLabel>
                <Select
                  labelId="pipe-mode"
                  label="Режим"
                  value={pipeMode}
                  onChange={e => setPipeMode(String(e.target.value))}
                >
                  {['paper', 'real', 'micro'].map(m => (
                    <MenuItem key={m} value={m}>
                      {m}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                size="small"
                label="Limit"
                value={pipeLimit}
                onChange={e => setPipeLimit(e.target.value)}
                sx={{ width: 100 }}
              />
              <TextField
                size="small"
                label="Min confidence"
                value={pipeMinConf}
                onChange={e => setPipeMinConf(e.target.value)}
                sx={{ width: 130 }}
              />
              <TextField
                size="small"
                label="Min score"
                value={pipeMinScore}
                onChange={e => setPipeMinScore(e.target.value)}
                sx={{ width: 120 }}
              />
              <Button variant="contained" size="small" disabled={pipeLoading} onClick={() => void runPipeline()}>
                {pipeLoading ? 'Запуск…' : 'Запустить pipeline'}
              </Button>
            </Box>
            {pipeNotice ? (
              <Typography
                variant="body2"
                color={pipeNotice.kind === 'success' ? 'success.main' : 'error.main'}
                sx={{ mt: 1 }}
              >
                {pipeNotice.text}
              </Typography>
            ) : null}
            {pipeNotice?.kind === 'success' && pipeResult != null ? (
              <Box sx={{ mt: 0.75 }}>
                <JsonViewBlock data={pipeResult} maxHeight={200} collapsed={2} />
              </Box>
            ) : null}
          </Box>
        </Stack>
      </Paper>

      <ScrollableTablePaper maxHeight="min(62vh, 480px)" sx={{ overflowX: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Сигнал</TableCell>
              <TableCell>FIGI</TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Тикер</TableCell>
              <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>Название</TableCell>
              <TableCell>Уверенность / score</TableCell>
              <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                Цена
              </TableCell>
              <TableCell align="right">Заявка</TableCell>
              <TableCell align="right">Карточка</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={8}>
                  <Typography color="text.secondary">Нет строк по фильтрам.</Typography>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(r => {
                const figi = recString(r, 'figi')
                const href = `/recommendations/${encodeURIComponent(figi)}`
                const tAct = tradeActionFromRecommendation(r)
                return (
                  <TableRow key={recString(r, 'id') || figi} hover>
                    <TableCell>
                      <RecommendationStatusBadge value={recString(r, 'recommendation')} />
                    </TableCell>
                    <TableCell sx={FIGI_TABLE_CELL_SX}>{figi}</TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      {recString(r, 'ticker') || '—'}
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>
                      {recString(r, 'name') || '—'}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {formatScoreConfidence(recNum(r, 'score'), recNum(r, 'confidence'))}
                      </Typography>
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{ display: { xs: 'none', sm: 'table-cell' }, ...TABLE_NUMERIC_CELL_SX }}
                    >
                      {formatPrice(r.lastPrice)}
                    </TableCell>
                    <TableCell align="right">
                      {figi ? (
                        <Button
                          size="small"
                          variant="outlined"
                          color={tAct === 'SELL' ? 'secondary' : 'primary'}
                          onClick={() => {
                            setTradeFigi(figi)
                            setTradeInitialAction(tAct)
                            setTradeOpen(true)
                          }}
                        >
                          {tradeButtonLabel(tAct)}
                        </Button>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Button component={Link} to={href} size="small" endIcon={<OpenInNewIcon />}>
                        Открыть
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </ScrollableTablePaper>

      <CreateTradingRequestModal
        open={tradeOpen}
        onClose={() => {
          setTradeOpen(false)
          setTradeFigi(null)
        }}
        recommendationFigi={tradeFigi}
        initialAction={tradeInitialAction}
        onSuccess={() => void load()}
      />

      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
        <Button size="small" disabled={offset === 0 || loading} onClick={() => setOffset(o => Math.max(0, o - limit))}>
          Назад
        </Button>
        <Button
          size="small"
          disabled={offset + items.length >= total || loading}
          onClick={() => setOffset(o => o + limit)}
        >
          Вперёд
        </Button>
      </Box>
    </Stack>
  )
}

export { RecommendationsPage }
export default RecommendationsPage
