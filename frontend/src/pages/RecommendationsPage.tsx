import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import {
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
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
  TextField,
  Typography,
} from '@mui/material'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MarketService, RecommendationPipelineService } from '@/api/generated'
import { JsonViewBlock } from '@/components/json'
import { CreateTradingRequestModal } from '@/components/trading'
import type { RecommendationRecord } from '@/utils/recommendationFormat'
import { formatPrice, formatScoreConfidence, recNum, recString } from '@/utils/recommendationFormat'
import { apiErrorMessage } from '@/utils/apiErrorMessage'

const SIGNAL_OPTIONS = ['', 'BUY', 'SELL', 'HOLD'] as const

function tradeActionFromRecommendation(r: RecommendationRecord): 'BUY' | 'SELL' {
  const s = recString(r, 'recommendation').toUpperCase()
  return s === 'SELL' ? 'SELL' : 'BUY'
}

function tradeButtonLabel(action: 'BUY' | 'SELL') {
  return action === 'SELL' ? 'Продать' : 'Купить'
}

export function RecommendationsPage() {
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

  const chipForSignal = (sig: string) => {
    const s = sig.toUpperCase()
    if (s === 'BUY') return <Chip size="small" label={sig} color="primary" variant="outlined" />
    if (s === 'SELL') return <Chip size="small" label={sig} color="secondary" variant="outlined" />
    return <Chip size="small" label={sig || '—'} variant="outlined" />
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" gutterBottom>
          Рекомендации
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Сохранённые строки из анализа (fusion NN+LLM). Создание заявки — кнопка «Купить» / «Продать» в
          строке или на карточке; дальше одобрение и исполнение в разделе «Торговые заявки».
        </Typography>
      </Box>

      {error ? (
        <Paper variant="outlined" sx={{ p: 2, borderColor: 'error.main' }}>
          <Typography color="error">{error}</Typography>
          <Button sx={{ mt: 1 }} onClick={() => void load()}>
            Повторить
          </Button>
        </Paper>
      ) : null}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            flexWrap: 'wrap',
            gap: 2,
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
          <Button variant="outlined" onClick={() => void load()} disabled={loading}>
            Обновить
          </Button>
          <Typography variant="body2" color="text.secondary" sx={{ ml: { sm: 'auto' } }}>
            Страница: {items.length} из {total} · после фильтра: {filtered.length}
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Фильтр сигнала и поиск применяются к загруженной странице ({limit} записей). Листайте
          ниже, чтобы подгрузить другой срез.
        </Typography>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          Pipeline рекомендаций
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          Запуск на бэкенде: пороги, дедупликация, создание заявок (см. API recommendation-pipeline).
        </Typography>
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 2,
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
          <Button variant="contained" disabled={pipeLoading} onClick={() => void runPipeline()}>
            {pipeLoading ? 'Запуск…' : 'Запустить pipeline'}
          </Button>
        </Box>
        {pipeNotice ? (
          <Typography
            variant="body2"
            color={pipeNotice.kind === 'success' ? 'success.main' : 'error.main'}
            sx={{ mt: 1.5 }}
          >
            {pipeNotice.text}
          </Typography>
        ) : null}
        {pipeNotice?.kind === 'success' && pipeResult != null ? (
          <Box sx={{ mt: 1 }}>
            <JsonViewBlock data={pipeResult} maxHeight={240} collapsed={2} />
          </Box>
        ) : null}
      </Paper>

      <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Сигнал</TableCell>
              <TableCell>FIGI</TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Тикер</TableCell>
              <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>Название</TableCell>
              <TableCell>Уверенность / score</TableCell>
              <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Цена</TableCell>
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
                    <TableCell>{chipForSignal(recString(r, 'recommendation'))}</TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                        {figi}
                      </Typography>
                    </TableCell>
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
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
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
      </TableContainer>

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
    </Stack>
  )
}
