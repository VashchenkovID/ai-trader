import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Chip,
  Divider,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError, MarketService } from '@/api/generated'
import { ChartContainer } from '@/components/charts/ChartContainer'
import { CreateTradingRequestModal } from '@/components/trading'
import { LabeledValuesTable } from '@/components/ops'
import { CandlesChart, type CandleRow } from '@/components/recommendations/CandlesChart'
import { VolumeHistogramChart } from '@/components/recommendations/VolumeHistogramChart'
import {
  WeeklyForecastChart,
  weeklyForecastMeanCaption,
  weeklyForecastStatusMessage,
} from '@/components/recommendations/WeeklyForecastChart'
import type { RecommendationRecord } from '@/utils/recommendationFormat'
import { formatPrice, formatScoreConfidence, recNum, recString } from '@/utils/recommendationFormat'
import {
  parseExplain,
  summarizeLlmJuryForUser,
  summarizeNnPayloadForUser,
  tradePlanToRows,
} from '@/utils/recommendationPayloadHumanize'
import { apiErrorMessage } from '@/utils/apiErrorMessage'

function tradeActionFromRecommendation(r: RecommendationRecord): 'BUY' | 'SELL' {
  const s = recString(r, 'recommendation').toUpperCase()
  return s === 'SELL' ? 'SELL' : 'BUY'
}

function tradeButtonLabel(action: 'BUY' | 'SELL') {
  return action === 'SELL' ? 'Продать' : 'Купить'
}

function recommendationSignalLabel(raw: string): string {
  const s = raw.toUpperCase()
  if (s === 'BUY') return 'Покупка'
  if (s === 'SELL') return 'Продажа'
  if (s === 'HOLD') return 'Ожидание'
  return raw || '—'
}

export function RecommendationDetailPage() {
  const { figi: figiParam } = useParams<{ figi: string }>()
  const figi = figiParam ? decodeURIComponent(figiParam) : ''

  const [rec, setRec] = useState<RecommendationRecord | null>(null)
  const [candles, setCandles] = useState<CandleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [candlesNote, setCandlesNote] = useState<string | null>(null)
  const [tradeOpen, setTradeOpen] = useState(false)

  const load = useCallback(async () => {
    if (!figi) {
      setError('Не указан FIGI')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    setCandlesNote(null)
    try {
      const env = await MarketService.marketRecommendationByFigiApiV1MarketRecommendationsFigiGet({
        figi,
      })
      const data = env.data as RecommendationRecord
      setRec(data)
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setError('Рекомендация не найдена для этого FIGI.')
      } else {
        setError(apiErrorMessage(e))
      }
      setRec(null)
      setCandles([])
      setLoading(false)
      return
    }

    try {
      const cEnv = await MarketService.marketStockCandlesApiV1MarketStockFigiCandlesGet({
        figi,
        offset: 0,
        limit: 365,
      })
      const cData = cEnv.data as { items?: unknown[]; meta?: { total?: number } }
      const raw = Array.isArray(cData.items) ? cData.items : []
      setCandles(raw.filter(Boolean) as CandleRow[])
      const t = cData.meta?.total
      if (typeof t === 'number' && t === 0) {
        setCandlesNote('В базе нет свечей по этому инструменту.')
      }
    } catch {
      setCandles([])
      setCandlesNote('Не удалось загрузить свечи.')
    } finally {
      setLoading(false)
    }
  }, [figi])

  useEffect(() => {
    void load()
  }, [load])

  const signal = rec ? recString(rec, 'recommendation') : ''
  const signalChip = useMemo(() => {
    const s = signal.toUpperCase()
    const label = recommendationSignalLabel(signal)
    if (s === 'BUY') return <Chip label={label} color="primary" />
    if (s === 'SELL') return <Chip label={label} color="secondary" />
    if (s) return <Chip label={label} variant="outlined" />
    return null
  }, [signal])

  const explainBlock = useMemo(() => parseExplain(rec?.explain), [rec?.explain])

  const horizonLine = useMemo(() => {
    const hm = rec?.horizonMomentum
    if (!Array.isArray(hm)) return ''
    const parts = hm
      .filter((x): x is Record<string, unknown> => x != null && typeof x === 'object')
      .map((x, i) => {
        const label = String(x.label ?? x.id ?? `Период ${i + 1}`)
        const ret =
          x.returnPct != null
            ? `${typeof x.returnPct === 'number' ? x.returnPct.toFixed(2) : String(x.returnPct)}%`
            : '—'
        const hint = x.kind != null ? String(x.kind) : ''
        return hint ? `${label}: ${ret} (${hint})` : `${label}: ${ret}`
      })
    return parts.join(' · ')
  }, [rec?.horizonMomentum])

  const llmCard = useMemo(() => summarizeLlmJuryForUser(rec?.llmJuryPayload), [rec?.llmJuryPayload])

  const nnHints = useMemo(() => summarizeNnPayloadForUser(rec?.nnPayload), [rec?.nnPayload])

  const tradePlanRows = useMemo(
    () => (rec?.tradePlan != null ? tradePlanToRows(rec.tradePlan) : []),
    [rec?.tradePlan],
  )

  if (!figi) {
    return (
      <Alert severity="warning">
        Некорректный маршрут.{' '}
        <Button component={Link} to="/recommendations">
          К списку
        </Button>
      </Alert>
    )
  }

  return (
    <Stack spacing={3}>
      <Breadcrumbs aria-label="Навигация" sx={{ color: 'text.secondary' }}>
        <Typography
          component={Link}
          to="/dashboard"
          color="inherit"
          variant="body2"
          sx={{ textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
        >
          Главная
        </Typography>
        <Typography
          component={Link}
          to="/recommendations"
          color="inherit"
          variant="body2"
          sx={{ textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
        >
          Рекомендации
        </Typography>
        <Typography color="text.primary" variant="body2">
          {recString(rec ?? {}, 'ticker') || figi.slice(0, 12) || 'Карточка'}
        </Typography>
      </Breadcrumbs>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
        <Button
          component={Link}
          to="/recommendations"
          startIcon={<ArrowBackIcon />}
          variant="outlined"
          size="small"
        >
          Все рекомендации
        </Button>
        <Typography variant="h5" component="span" sx={{ ml: { sm: 1 } }}>
          {recString(rec ?? {}, 'ticker') || 'Инструмент'}
        </Typography>
        {signalChip}
        {rec && !error ? (
          <Button
            variant="contained"
            size="small"
            sx={{ ml: 'auto' }}
            color={tradeActionFromRecommendation(rec) === 'SELL' ? 'secondary' : 'primary'}
            onClick={() => setTradeOpen(true)}
          >
            {tradeButtonLabel(tradeActionFromRecommendation(rec))}
          </Button>
        ) : null}
      </Box>

      <CreateTradingRequestModal
        open={tradeOpen}
        onClose={() => setTradeOpen(false)}
        recommendationFigi={figi}
        initialAction={rec ? tradeActionFromRecommendation(rec) : 'BUY'}
        onSuccess={() => void load()}
      />

      {loading ? <LinearProgress /> : null}

      {error ? (
        <Alert severity="error" action={<Button onClick={() => void load()}>Повторить</Button>}>
          {error}
        </Alert>
      ) : null}

      {rec && !error ? (
        <>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={1.5}>
              <Box>
                <Typography variant="h6" component="h1">
                  {recString(rec, 'name') || recString(rec, 'ticker')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Тикер: {recString(rec, 'ticker') || '—'}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                  FIGI {figi}
                </Typography>
              </Box>
              <Divider flexItem />
              <Stack spacing={0.75}>
                <Typography variant="body1">
                  <strong>Сигнал:</strong> {recommendationSignalLabel(signal)} ·{' '}
                  <strong>Уверенность и оценка:</strong>{' '}
                  {formatScoreConfidence(recNum(rec, 'score'), recNum(rec, 'confidence'))}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>Цена на момент анализа:</strong> {formatPrice(rec.lastPrice)}
                </Typography>
                {(() => {
                  const ns = recNum(rec, 'nnScore')
                  const nc = recNum(rec, 'nnConfidence')
                  if (ns == null && nc == null) return null
                  return (
                    <Typography variant="body2" color="text.secondary">
                      <strong>Нейросеть:</strong> {formatScoreConfidence(ns, nc)}
                    </Typography>
                  )
                })()}
                {recString(rec, 'paperRecommendation') ? (
                  <Typography variant="body2" color="text.secondary">
                    <strong>Paper:</strong> {recommendationSignalLabel(recString(rec, 'paperRecommendation'))} ·{' '}
                    {formatScoreConfidence(recNum(rec, 'paperScore'), recNum(rec, 'paperConfidence'))}
                  </Typography>
                ) : null}
                {recString(rec, 'analysisDate') ? (
                  <Typography variant="caption" color="text.secondary">
                    Дата анализа: {recString(rec, 'analysisDate')}
                  </Typography>
                ) : null}
              </Stack>
            </Stack>
          </Paper>

          {horizonLine ? (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle1" gutterBottom>
                Доходность до даты анализа
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Фактические изменения цены за 1 / 5 / ~20 дней до точки анализа (признаки модели, не прогноз).
              </Typography>
              <Typography variant="body2">{horizonLine}</Typography>
            </Paper>
          ) : null}

          {explainBlock ? (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle1" gutterBottom>
                Краткое обоснование
              </Typography>
              {explainBlock.summaryText ? (
                <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', mb: explainBlock.detailRows.length ? 2 : 0 }}>
                  {explainBlock.summaryText}
                </Typography>
              ) : null}
              {explainBlock.detailRows.length > 0 ? (
                <LabeledValuesTable
                  rows={explainBlock.detailRows.map(r => ({ label: r.label, value: r.value }))}
                />
              ) : null}
            </Paper>
          ) : null}

          <ChartContainer title="Свечи (закрытия)" minHeight={340}>
            {candlesNote ? (
              <Typography color="text.secondary" sx={{ mb: 1 }}>
                {candlesNote}
              </Typography>
            ) : null}
            <CandlesChart candles={candles} emptyLabel="Нет данных свечей." />
          </ChartContainer>

          <ChartContainer title="Объём торгов" minHeight={240}>
            {candlesNote ? (
              <Typography color="text.secondary" sx={{ mb: 1 }}>
                {candlesNote}
              </Typography>
            ) : null}
            <VolumeHistogramChart candles={candles} emptyLabel="В свечах нет поля volume или оно нулевое." />
          </ChartContainer>

          {rec.weeklyForecast != null ? (
            <ChartContainer title="Недельный прогноз (LSTM)" minHeight={320}>
              {(() => {
                const wfPayload = rec.weeklyForecast
                const wf = wfPayload as Record<string, unknown>
                const statusMsg = weeklyForecastStatusMessage(wfPayload)
                const meanCap = weeklyForecastMeanCaption(wfPayload)
                return (
                  <>
                    {statusMsg ? (
                      <Alert severity="warning" sx={{ mb: 1 }}>
                        {statusMsg}
                      </Alert>
                    ) : null}
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Линия показывает последнее закрытие и ожидаемую траекторию по шагам модели (масштаб
                      подбирается автоматически).
                    </Typography>
                    <WeeklyForecastChart payload={wfPayload} />
                    {wf.ok === true && meanCap ? (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        {meanCap}
                      </Typography>
                    ) : null}
                    {recString(rec, 'weeklyForecastAt') ? (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                        Обновлено: {recString(rec, 'weeklyForecastAt')}
                      </Typography>
                    ) : null}
                  </>
                )
              })()}
            </ChartContainer>
          ) : null}

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              План сделки и мнение моделей
            </Typography>
            <Stack spacing={2.5} divider={<Divider flexItem />}>
              {tradePlanRows.length > 0 ? (
                <Box>
                  <Typography variant="subtitle2" gutterBottom color="text.secondary">
                    Торговый план
                  </Typography>
                  <LabeledValuesTable rows={tradePlanRows} />
                </Box>
              ) : null}

              {llmCard || rec.llmJuryPayload != null ? (
                <Box>
                  <Typography variant="subtitle2" gutterBottom color="text.secondary">
                    Мнение LLM-жюри
                  </Typography>
                  {llmCard ? (
                    <Stack spacing={1}>
                      <Typography variant="body1" sx={{ fontWeight: 600 }}>
                        {llmCard.title}
                      </Typography>
                      {llmCard.lines.map((line, i) => (
                        <Typography key={i} variant="body2" color="text.secondary">
                          {line}
                        </Typography>
                      ))}
                      {llmCard.providers.length > 0 ? (
                        <Stack component="ul" spacing={0.5} sx={{ pl: 2.25, m: 0 }}>
                          {llmCard.providers.map(p => (
                            <Typography key={p.name} component="li" variant="body2">
                              <strong>{p.name}</strong> — {p.text}
                            </Typography>
                          ))}
                        </Stack>
                      ) : null}
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Данные жюри сохранены в нестандартном формате — краткое резюме недоступно.
                    </Typography>
                  )}
                </Box>
              ) : null}

              {nnHints.length > 0 || rec.nnPayload != null ? (
                <Box>
                  <Typography variant="subtitle2" gutterBottom color="text.secondary">
                    Нейросеть
                  </Typography>
                  {nnHints.length > 0 ? (
                    <Stack spacing={0.5}>
                      {nnHints.map((t, i) => (
                        <Typography key={i} variant="body2" color="text.secondary">
                          {t}
                        </Typography>
                      ))}
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Дополнительное текстовое резюме по признакам недоступно.
                    </Typography>
                  )}
                </Box>
              ) : null}
            </Stack>
          </Paper>
        </>
      ) : null}
    </Stack>
  )
}
